from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from backend.config import settings
from backend.core import companion

router = APIRouter()


@router.post('/companion/connect')
async def connect(request: Request):
    # Origin cannot be chosen by browser JS. JSON plus a custom header force
    # a CORS preflight, preventing a form from obtaining this capability.
    if (not companion.enabled() or not request.client
            or request.client.host not in ('127.0.0.1', '::1')
            or not companion.trusted_origin(request.headers.get('origin'))
            or request.headers.get('x-decupa-connect') != '1'
            or request.headers.get('content-type', '').split(';')[0].strip().lower() != 'application/json'):
        raise HTTPException(403, 'Conexão permitida apenas ao site autorizado neste computador.')
    return JSONResponse(companion.credentials(), headers={'Cache-Control': 'no-store'})


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
