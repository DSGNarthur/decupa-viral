from fastapi import APIRouter, HTTPException, Request
from backend.config import settings
from backend.core import companion

router = APIRouter()


@router.post('/companion/link')
async def pairing_link(request: Request):
    if not companion.enabled():
        raise HTTPException(503, 'O acesso pela Vercel não foi ativado neste inicializador.')
    if request.client.host not in ('127.0.0.1', '::1') or not companion.local_origin(request.headers.get('origin') or request.headers.get('referer'), settings.PORT):
        raise HTTPException(403, 'O pareamento deve ser iniciado pelo aplicativo neste PC.')
    return {'url': companion.link()}


@router.get('/companion/status')
async def companion_status():
    return {'ok': True, 'runtime': 'pc', 'app': 'Decupa Viral', 'port': settings.PORT}
