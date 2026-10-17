# SPDX-License-Identifier: AGPL-3.0-only
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import json
from sqlalchemy import select
from backend.database import AsyncSessionLocal
from backend.models.editor_draft import EditorDraft
from backend.services import clip_editor as service
from backend.services.supoclip.document import EditDocument

router=APIRouter(prefix='/editor',tags=['editor'])


class SaveDraft(BaseModel):
    revision: int = Field(ge=1)
    document: EditDocument


class CombineDrafts(BaseModel):
    draft_ids: list[str] = Field(min_length=2,max_length=8)


@router.post('/combine')
async def combine(request: CombineDrafts):
    if len(set(request.draft_ids))!=len(request.draft_ids):
        raise HTTPException(422,'Selecione rascunhos diferentes.')
    for draft_id in request.draft_ids:await service.get_draft(draft_id)
    from backend.agents.job_helper import create_job
    from backend.core.task_runner import dispatch
    job=await create_job('editor_combine',input_data={'draft_ids':request.draft_ids})
    dispatch(service.combine(job.id,request.draft_ids))
    return {'job_id':job.id}


@router.get('/drafts')
async def list_drafts():
    async with AsyncSessionLocal() as db:
        rows=(await db.execute(select(EditorDraft).where(EditorDraft.user_id=='local').order_by(EditorDraft.updated_at.desc()))).scalars().all()
    return {'drafts':[{'id':r.id,'title':r.title,'revision':r.revision,'duration':r.duration,'clip_id':r.generated_video_id,'updated_at':r.updated_at.isoformat()} for r in rows]}


@router.post('/prepare/{clip_id}')
async def prepare(clip_id: str):
    return await service.prepare(clip_id)


@router.get('/drafts/{draft_id}')
async def get_draft(draft_id: str):
    return service.payload(await service.get_draft(draft_id))


@router.put('/drafts/{draft_id}')
async def save_draft(draft_id: str, request: SaveDraft):
    try:
        return await service.save(draft_id,request.document,request.revision)
    except ValueError as exc:
        raise HTTPException(422,str(exc)) from exc


@router.get('/drafts/{draft_id}/stream')
async def stream(draft_id: str):
    row=await service.get_draft(draft_id)
    return FileResponse(service.safe_path(row.source_path),media_type='video/mp4',headers={'Cache-Control':'private, no-store'})


@router.post('/drafts/{draft_id}/export')
async def export(draft_id: str, request: SaveDraft):
    row=await service.get_draft(draft_id)
    if row.revision != request.revision or request.document.model_dump() != __import__('json').loads(row.document_json):
        raise HTTPException(409,'Salve a edição atual antes de exportar.')
    try: request.document.validate_duration(row.duration)
    except ValueError as exc: raise HTTPException(422,str(exc)) from exc
    from backend.agents.job_helper import create_job
    from backend.core.task_runner import dispatch
    job=await create_job('editor_export',input_data={'draft_id':draft_id,'revision':request.revision})
    dispatch(service.run_export(job.id,draft_id,request.document,request.revision))
    return {'job_id':job.id}


@router.delete('/drafts/{draft_id}')
async def delete(draft_id: str):
    row=await service.get_draft(draft_id)
    # Keep exported media in the workspace: library references must remain valid.
    async with AsyncSessionLocal() as db:
        from backend.models.job import Job
        jobs=(await db.execute(select(Job).where(Job.status.in_(('pending','running')),Job.job_type.in_(('editor_export','editor_combine'))))).scalars().all()
        if any(draft_id in (json.loads(job.input_json or '{}').get('draft_ids',[])+[json.loads(job.input_json or '{}').get('draft_id')]) for job in jobs):
            raise HTTPException(409,'Aguarde a tarefa do editor terminar antes de excluir o rascunho.')
        await db.delete(await db.get(EditorDraft,row.id))
        await db.commit()
    return {'ok':True}
