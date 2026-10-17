# SPDX-License-Identifier: AGPL-3.0-only
"""Exercise the integrated native editor with real media and isolated SQLite."""
import asyncio
import hashlib
import json
import shutil
import subprocess
from uuid import uuid4
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from backend.config import settings
from backend.database import init_db, AsyncSessionLocal
from backend.models.downloaded_video import DownloadedVideo
from backend.models.generated_video import GeneratedVideo
from backend.models.job import Job
from backend.services import clip_editor as service
from backend.services.supoclip.document import EditDocument


@pytest.mark.asyncio
async def test_editor_real_media_roundtrip_conflict_and_original_preservation():
    await init_db()
    source=settings.STORAGE_ROOT/'videos'/f'editor-test-{uuid4()}.mp4'
    source.parent.mkdir(parents=True,exist_ok=True)
    fixture=__import__('pathlib').Path(__file__).resolve().parents[2]/'Supoclip-Lab-20261017/evidence/input-30s.mp4'
    inputs=['-i',str(fixture)] if fixture.exists() else ['-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000']
    subprocess.run(['ffmpeg','-v','error','-y',*inputs,'-t','4','-vf','scale=640:360','-c:v','libx264','-threads','2','-preset','ultrafast','-c:a','aac',str(source)],capture_output=True,check=True)
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    async with AsyncSessionLocal() as db:
        downloaded=DownloadedVideo(video_path=str(source),duration_seconds=4,title='Fonte de teste',transcript_segments_json=json.dumps([{'start':0,'end':3,'text':'Teste real de legenda','words':[{'start':.1,'end':.7,'word':'Teste'},{'start':.8,'end':1.2,'word':'real'},{'start':1.3,'end':2,'word':'de'},{'start':2.1,'end':2.8,'word':'legenda'}]}]))
        db.add(downloaded);await db.flush()
        clip=GeneratedVideo(title='Corte de teste',source_downloaded_video_id=downloaded.id,clip_start_seconds=0,clip_end_seconds=4,aspect_ratio='9:16',caption_status='applied')
        db.add(clip);await db.commit()
    draft=await service.prepare(clip.id)
    assert len(draft['document']['words'])==4
    assert (await service.prepare(clip.id))['id']==draft['id']
    doc=EditDocument.model_validate(draft['document'])
    doc.segments=[__import__('backend.services.supoclip.document',fromlist=['Segment']).Segment(id='a',start=0,end=1),__import__('backend.services.supoclip.document',fromlist=['Segment']).Segment(id='b',start=2,end=3)]
    doc.words[0].text='Revisado'
    doc.volume=.5
    saved=await service.save(draft['id'],doc,draft['revision'])
    assert saved['revision']==draft['revision']+1
    with pytest.raises(HTTPException) as conflict:
        await service.save(draft['id'],doc,draft['revision'])
    assert conflict.value.status_code==409
    assert service.payload(await service.get_draft(draft['id']))['document']['words'][0]['text']=='Revisado'
    from backend.agents.job_helper import create_job
    job=await create_job('editor_export',input_data={'draft_id':draft['id']})
    await service.run_export(job.id,draft['id'],doc,saved['revision'])
    async with AsyncSessionLocal() as db:
        finished=await db.get(Job,job.id)
        assert finished.status=='success', finished.error_message
        row=await db.get(GeneratedVideo,json.loads(finished.output_json)['video_id'])
        result=service.safe_path(row.video_path)
        with pytest.raises(HTTPException) as pinned:
            await service.assert_not_pinned(db,source_id=downloaded.id)
        assert pinned.value.status_code==409
    info=service.probe(result)
    assert abs(info['duration']-2)<.15
    assert (info['width'],info['height'])==(1080,1920)
    subprocess.run(['ffmpeg','-v','error','-i',str(result),'-f','null','-'],check=True,capture_output=True)
    assert hashlib.sha256(source.read_bytes()).hexdigest()==before
    # An exported edit can be reopened with its clean source and exact document.
    reopened=await service.prepare(row.id)
    assert reopened['document']['words'][0]['text']=='Revisado'
    assert len(reopened['document']['segments'])==2
    # Joining drafts produces another clean, editable document, not burned text.
    combined=await create_job('editor_combine')
    await service.combine(combined.id,[draft['id'],reopened['id']])
    async with AsyncSessionLocal() as db:
        joined_job=await db.get(Job,combined.id)
        assert joined_job.status=='success',joined_job.error_message
    joined=await service.get_draft(json.loads(joined_job.output_json)['draft_id'])
    assert 3.8<joined.duration<4.4
    joined_doc=EditDocument.model_validate_json(joined.document_json)
    assert joined_doc.words[0].text=='Revisado'
    # The removed middle word must stay removed in both joined parts.
    assert len(joined_doc.words)==6
    assert all(word.text!='de' for word in joined_doc.words)
    # A cancelled task publishes no extra video or partial export.
    cancelled=await create_job('editor_export')
    from backend.agents.job_helper import update_job_status
    await update_job_status(cancelled.id,'cancelled')
    await service.run_export(cancelled.id,draft['id'],doc,saved['revision'])
    assert not (service.workspace(draft['id'])/'exports'/cancelled.id/f'export-{cancelled.id}.mp4').exists()


@pytest.mark.parametrize('value',[float('nan'),float('inf'),-1])
def test_editor_rejects_invalid_media_times(value):
    with pytest.raises(ValueError):
        EditDocument.model_validate({'segments':[{'id':'bad','start':value,'end':3}]})


def test_editor_rejects_paths_outside_storage():
    with pytest.raises(HTTPException) as error:
        service.safe_path(__file__)
    assert error.value.status_code==403


def test_real_yunet_and_reframe_export(tmp_path):
    from backend.services.supoclip.document import render_document
    from backend.services.supoclip.tracking import analyze_vertical_clip
    fixture=__import__('pathlib').Path(__file__).resolve().parents[2]/'Supoclip-Lab-20261017/evidence/input-30s.mp4'
    if not fixture.exists():
        import os
        fixture=__import__('pathlib').Path(os.environ.get('DECUPA_TEST_FACE_MEDIA','missing-real-media-fixture'))
    if not fixture.exists():pytest.skip('Configure DECUPA_TEST_FACE_MEDIA com mídia autorizada contendo rostos.')
    source=tmp_path/'clean.mp4'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(fixture),'-t','2','-c:v','libx264','-threads','2','-preset','ultrafast','-c:a','aac',str(source)],capture_output=True,check=True)
    track,cuts=analyze_vertical_clip(source)
    assert len(track)>=5
    assert any(center is not None for _,center,_ in track)
    doc=EditDocument.model_validate({'segments':[{'id':'face','start':0,'end':1.5}], 'framing':{'aspect':'vertical','mode':'face'}})
    render_document(tmp_path,'face-test',doc,'reels')
    output=tmp_path/'export-face-test.mp4'
    assert service.probe(output)['width']==1080
    subprocess.run(['ffmpeg','-v','error','-i',str(output),'-f','null','-'],capture_output=True,check=True)
