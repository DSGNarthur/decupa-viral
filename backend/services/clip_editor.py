# SPDX-License-Identifier: AGPL-3.0-only
"""Native Decupa adapter for the audited Supoclip document/rendering engine."""
import asyncio
import json
import os
import shutil
from pathlib import Path
from uuid import uuid4
from datetime import datetime
from sqlalchemy import select, update
from fastapi import HTTPException
from backend.config import settings
from backend.database import AsyncSessionLocal
from backend.models.editor_draft import EditorDraft
from backend.models.generated_video import GeneratedVideo
from backend.models.downloaded_video import DownloadedVideo
from backend.services.supoclip.document import EditDocument, render_document
from backend.services.supoclip.support import probe

_prepare_locks = {}


def safe_path(value):
    path = Path(value).resolve()
    if not path.is_relative_to(settings.STORAGE_ROOT.resolve()):
        raise HTTPException(403, 'Arquivo fora do armazenamento autorizado.')
    if not path.is_file():
        raise HTTPException(410, 'A fonte limpa não está disponível. Importe o vídeo novamente.')
    return path


def workspace(draft_id):
    # IDs are database-generated, never request paths.
    return settings.STORAGE_ROOT / 'editor' / draft_id


async def get_draft(draft_id):
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(EditorDraft).where(EditorDraft.id == draft_id, EditorDraft.user_id == 'local'))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, 'Rascunho não encontrado.')
    return row


def payload(row):
    return {'id': row.id, 'clip_id': row.generated_video_id, 'title': row.title,
            'revision': row.revision, 'duration': row.duration, 'width': row.width,
            'height': row.height, 'document': json.loads(row.document_json),
            'provenance': json.loads(row.provenance_json),
            'updated_at': row.updated_at.isoformat() if row.updated_at else None}


def flatten_words(segments, duration):
    from backend.services.caption_service import _extract_word_timestamps
    raw = _extract_word_timestamps(segments)
    result = []
    for i, word in enumerate(raw):
        start, end = max(0, float(word['start'])), min(duration, float(word['end']))
        if end > start:
            result.append({'id': f'w{i}', 'start': start, 'end': end,
                           'text': str(word.get('word', word.get('text', ''))).strip()[:120]})
    return result[:5000]


async def prepare(clip_id):
    lock = _prepare_locks.setdefault(clip_id, asyncio.Lock())
    async with lock:
        async with AsyncSessionLocal() as db:
            existing = (await db.execute(select(EditorDraft).where(EditorDraft.generated_video_id == clip_id))).scalar_one_or_none()
            if existing:
                return payload(existing)
            clip = await db.get(GeneratedVideo, clip_id)
            if not clip or clip.user_id != 'local':
                raise HTTPException(404, 'Corte não encontrado.')
            source = await db.get(DownloadedVideo, clip.source_downloaded_video_id) if clip.source_downloaded_video_id else None
        draft_id = str(uuid4())
        directory = workspace(draft_id)
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / 'clean.mp4'
        note = ''
        origin = {'source_video_id': clip.source_downloaded_video_id,
                  'clip_id': clip.id, 'start': clip.clip_start_seconds,
                  'end': clip.clip_end_seconds, 'engine': 'supoclip-document-v1'}
        try:
            if clip.editor_source_path:
                clean = safe_path(clip.editor_source_path)
                await asyncio.to_thread(shutil.copy2, clean, destination)
                metadata = json.loads(clip.editor_source_json or '{}')
                segments = metadata.get('segments', [])
                origin.update(metadata.get('provenance', {}))
            elif source and source.video_path and clip.clip_start_seconds is not None and clip.clip_end_seconds is not None:
                clean = safe_path(source.video_path)
                start, end = clip.clip_start_seconds, clip.clip_end_seconds
                from backend.services.clip_extractor import _filter_and_offset_segments
                metadata = json.loads(clip.editor_source_json or '{}')
                segments = metadata.get('segments') or _filter_and_offset_segments(json.loads(source.transcript_segments_json or '[]'), start, end)
                keep = metadata.get('keep_ranges')
                if keep and any(not (0 <= s < e <= end-start+.1) for s,e in keep):
                    raise HTTPException(422,'O mapa de tempos da fonte é inválido.')
                def extract():
                    import subprocess
                    window = directory/'window.mp4' if keep else destination
                    subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(clean),'-t',str(end-start),'-c:v','libx264','-threads','2','-preset','fast','-crf','18','-c:a','aac','-movflags','+faststart',str(window)],check=True,capture_output=True,timeout=900)
                    if keep:
                        expr='+'.join(f'between(t\\,{s:.3f}\\,{e:.3f})' for s,e in keep)
                        subprocess.run(['ffmpeg','-v','error','-y','-i',str(window),'-vf',f"select='{expr}',setpts=N/FRAME_RATE/TB",'-af',f"aselect='{expr}',asetpts=N/SR/TB",'-c:v','libx264','-threads','2','-preset','fast','-crf','18','-c:a','aac','-movflags','+faststart',str(destination)],check=True,capture_output=True,timeout=900)
                        window.unlink(missing_ok=True)
                await asyncio.to_thread(extract)
                origin.update(metadata.get('provenance',{}))
                note = '' if metadata else 'Fonte original recuperada. Este corte antigo não tinha mapa de silêncios; a edição começa no intervalo original, sem a legenda gravada.'
                origin['reconstructed_from_original'] = True
            elif clip.caption_status == 'skipped':
                await asyncio.to_thread(shutil.copy2, safe_path(clip.video_path), destination)
                segments = []
            else:
                raise HTTPException(422, 'Este vídeo não tem fonte limpa recuperável. Importe a fonte e gere o corte para editar sem duplicar legendas.')
            info = await asyncio.to_thread(probe, destination)
            document = EditDocument.model_validate({'segments': [{'id': 's1', 'start': 0, 'end': info['duration']}],
                         'words': flatten_words(segments, info['duration']),
                         'framing': {'aspect': 'vertical' if clip.aspect_ratio == '9:16' else 'original', 'fit': 'contain'}})
            if clip.editor_source_path and metadata.get('document'):
                document = EditDocument.model_validate(metadata['document']).validate_duration(info['duration'])
            origin['note'] = note
            row = EditorDraft(id=draft_id, generated_video_id=clip_id,
                   source_downloaded_video_id=clip.source_downloaded_video_id,
                   title=clip.title or 'Edição de corte', source_path=str(destination),
                   duration=info['duration'], width=info['width'], height=info['height'],
                   document_json=document.model_dump_json(), provenance_json=json.dumps(origin), revision=1)
            async with AsyncSessionLocal() as db:
                db.add(row)
                await db.commit()
            return payload(row)
        except BaseException:
            # Only the newly allocated workspace can be removed here.
            await asyncio.to_thread(shutil.rmtree, directory, True)
            raise


async def save(draft_id, document, revision):
    row = await get_draft(draft_id)
    document.validate_duration(row.duration)
    async with AsyncSessionLocal() as db:
        changed = await db.execute(update(EditorDraft).where(EditorDraft.id == draft_id, EditorDraft.revision == revision).values(
            document_json=document.model_dump_json(), revision=revision + 1, updated_at=datetime.utcnow()))
        if changed.rowcount != 1:
            raise HTTPException(409, 'Este rascunho mudou em outra aba. Recarregue a versão salva antes de continuar.')
        await db.commit()
    return payload(await get_draft(draft_id))


async def run_export(job_id, draft_id, document, revision):
    from backend.agents.job_helper import update_job_status, job_cancelled
    from backend.core.ws_manager import ws_manager
    from backend.services.ffmpeg_service import extract_thumbnail
    row = await get_draft(draft_id)
    directory = workspace(row.id) / 'exports' / job_id
    marker = directory / f'cancel-{job_id}'
    output = directory / f'export-{job_id}.mp4'
    directory.mkdir(parents=True, exist_ok=True)
    task = None
    try:
        if await job_cancelled(job_id):
            return
        clean = safe_path(row.source_path)
        try:
            os.link(clean, directory / 'clean.mp4')
        except OSError:
            await asyncio.to_thread(shutil.copy2, clean, directory / 'clean.mp4')
        await update_job_status(job_id, 'running', progress_pct=1, current_step='Renderizando sua edição no PC')
        task = asyncio.create_task(asyncio.to_thread(render_document, directory, job_id, document, 'reels'))
        previous = -1
        while not task.done():
            if await job_cancelled(job_id):
                marker.touch()
            status_file = directory / f'job-{job_id}.json'
            try:
                status = json.loads(status_file.read_text(encoding='utf-8')) if status_file.exists() else {}
            except (OSError, ValueError):
                status = {}
            percent = status.get('progress', 1)
            if percent != previous:
                previous = percent
                await ws_manager.send_progress(job_id, percent, 'Exportando edição', 'local')
            await asyncio.sleep(.5)
        await task
        if await job_cancelled(job_id):
            raise InterruptedError('Exportação cancelada.')
        info = await asyncio.to_thread(probe, output)
        thumbnail = await extract_thumbnail(output, timestamp=min(1, info['duration']/2))
        async with AsyncSessionLocal() as db:
            # The cancellation update and publication serialize on SQLite's write lock.
            from backend.models.job import Job
            claimed = await db.execute(update(Job).where(Job.id == job_id, Job.status == 'running').values(status='success'))
            if claimed.rowcount != 1:
                raise InterruptedError('Exportação cancelada antes da publicação.')
            video = GeneratedVideo(title=row.title, video_path=str(output), thumbnail_path=str(thumbnail) if thumbnail else None,
                 source_downloaded_video_id=row.source_downloaded_video_id,
                 source_type='clip_extraction', gen_tier='clip_extraction', clip_selection='manual', status='ready',
                 duration_seconds=round(info['duration']), aspect_ratio={'vertical':'9:16','square':'1:1'}.get(document.framing.aspect, f"{info['width']}:{info['height']}"),
                 caption_status='applied' if document.captions.enabled and document.words else 'skipped',
                 editor_source_path=row.source_path,
                 editor_source_json=json.dumps({'document':document.model_dump(),'provenance':{'parent_draft_id':row.id,'parent_revision':revision}}))
            db.add(video)
            await db.flush()
            result = {'clip_ids': [video.id], 'video_id': video.id, 'draft_id': draft_id, 'revision': revision}
            await db.commit()
        await update_job_status(job_id, 'success', progress_pct=100, current_step='Edição exportada para a biblioteca', output_data=result)
        await ws_manager.send({'type':'job_complete','job_id':job_id,'result':result},'local')
    except (InterruptedError, asyncio.CancelledError):
        marker.touch()
        if task and not task.done():
            try: await asyncio.shield(task)
            except Exception: pass
        output.unlink(missing_ok=True)
        await update_job_status(job_id,'cancelled',current_step='Exportação cancelada')
    except Exception as exc:
        output.unlink(missing_ok=True)
        await update_job_status(job_id,'failed',error_message=f'Não foi possível exportar: {exc}')
    finally:
        (directory/'clean.mp4').unlink(missing_ok=True)
        marker.unlink(missing_ok=True)


async def assert_not_pinned(db, source_id=None, clip_id=None):
    query = select(EditorDraft.id)
    if source_id:
        query = query.where(EditorDraft.source_downloaded_video_id == source_id)
    elif clip_id:
        query = query.where(EditorDraft.generated_video_id == clip_id)
    if (await db.execute(query.limit(1))).first():
        raise HTTPException(409, 'Este vídeo faz parte de um rascunho do editor. Exclua o rascunho antes de remover a fonte.')


async def combine(job_id, draft_ids):
    """Join clean renders and remap captions, yielding another editable draft."""
    from backend.agents.job_helper import update_job_status, job_cancelled
    from backend.services.supoclip.document import mapped_words
    from backend.core.ws_manager import ws_manager
    import subprocess
    import copy
    combined_id=str(uuid4())
    directory=workspace(combined_id)
    directory.mkdir(parents=True,exist_ok=True)
    marker=directory/f'cancel-{job_id}'
    complete=False
    try:
        await update_job_status(job_id,'running',progress_pct=1,current_step='Preparando montagem editável')
        words=[];cursor=0;normalized=[];first=None;target_size=None
        for index,draft_id in enumerate(draft_ids):
            if await job_cancelled(job_id):raise InterruptedError()
            row=await get_draft(draft_id)
            doc=EditDocument.model_validate_json(row.document_json)
            if first is None:first=copy.deepcopy(doc)
            for word in mapped_words(doc):
                words.append({**word,'id':f'{index}-{word["id"]}','start':cursor+word['start'],'end':cursor+word['end']})
            part=directory/f'part-{index}'
            part.mkdir()
            await asyncio.to_thread(shutil.copy2,safe_path(row.source_path),part/'clean.mp4')
            doc.captions.enabled=False
            doc.framing=first.framing.model_copy()
            rendering=asyncio.create_task(asyncio.to_thread(render_document,part,job_id,doc,'reels',directory))
            while not rendering.done():
                if await job_cancelled(job_id):marker.touch()
                await asyncio.sleep(.5)
            await rendering
            clean_part=part/f'export-{job_id}.mp4'
            # Every part has identical video/audio formats, including silent sources.
            info=await asyncio.to_thread(probe,clean_part)
            if target_size is None:target_size=(info['width'],info['height'])
            normal=directory/f'normalized-{index}.mp4'
            cmd=['ffmpeg','-v','error','-y','-i',str(clean_part)]
            if not info['audio']:cmd+=['-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-shortest']
            tw,th=target_size
            cmd+=['-map','0:v:0','-map','0:a:0' if info['audio'] else '1:a:0','-vf',f'scale={tw}:{th}:force_original_aspect_ratio=decrease,pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2,setsar=1','-c:v','libx264','-threads','2','-preset','fast','-r','30','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-t',str(info['duration']),str(normal)]
            normalization=asyncio.create_task(asyncio.to_thread(__import__('backend.services.supoclip.document',fromlist=['run_render']).run_render,cmd,directory,f'{job_id}-normalize',info['duration'],marker))
            while not normalization.done():
                if await job_cancelled(job_id):marker.touch()
                await asyncio.sleep(.5)
            await normalization
            normalized.append(normal)
            cursor+=info['duration']
            await ws_manager.send_progress(job_id,10+70*(index+1)/len(draft_ids),f'Montando trecho {index+1} de {len(draft_ids)}','local')
        if await job_cancelled(job_id):raise InterruptedError()
        manifest=directory/'concat.txt'
        manifest.write_text('\n'.join(f"file '{p.name}'" for p in normalized),encoding='utf-8')
        destination=directory/'clean.mp4'
        await asyncio.to_thread(subprocess.run,['ffmpeg','-v','error','-y','-f','concat','-safe','1','-i',str(manifest),'-c','copy','-movflags','+faststart',str(destination)],capture_output=True,check=True,timeout=900)
        if await job_cancelled(job_id):raise InterruptedError()
        info=await asyncio.to_thread(probe,destination)
        for word in words:word['end']=min(word['end'],info['duration'])
        doc=EditDocument.model_validate({'segments':[{'id':'montagem','start':0,'end':info['duration']}],
             'words':words,'captions':first.captions.model_dump(),'framing':{'aspect':'original','fit':'contain'},'volume':1})
        # Each draft's effects and volume were applied to the clean base already.
        clip_id=str(uuid4())
        row=EditorDraft(id=combined_id,generated_video_id=clip_id,title='Montagem de cortes',source_path=str(destination),
            document_json=doc.model_dump_json(),provenance_json=json.dumps({'combined_draft_ids':draft_ids}),
            revision=1,duration=info['duration'],width=info['width'],height=info['height'])
        async with AsyncSessionLocal() as db:
            from backend.models.job import Job
            accepted=await db.execute(update(Job).where(Job.id==job_id,Job.status=='running').values(status='success'))
            if accepted.rowcount!=1:raise InterruptedError()
            db.add(row)
            await db.commit()
        complete=True
        await update_job_status(job_id,'success',progress_pct=100,current_step='Montagem pronta para editar',output_data={'draft_id':combined_id})
    except (InterruptedError,asyncio.CancelledError):
        marker.touch()
        await update_job_status(job_id,'cancelled',current_step='Montagem cancelada')
    except Exception as exc:
        await update_job_status(job_id,'failed',error_message=f'Falha ao montar cortes: {exc}')
    finally:
        if not complete:
            await asyncio.to_thread(shutil.rmtree,directory,True)
        else:
            for path in normalized:path.unlink(missing_ok=True)
            for part in directory.glob('part-*'):
                if part.is_dir():await asyncio.to_thread(shutil.rmtree,part,True)
            (directory/'concat.txt').unlink(missing_ok=True)
