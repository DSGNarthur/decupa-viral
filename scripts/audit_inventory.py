"""Record engine provenance and runtime readiness without exporting secrets."""
import importlib.metadata
import json
import subprocess
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = Path(r'C:\Users\arthu\Documents\ChatGPT\Editor\.runtime-decupa\validation')
DATA = EVIDENCE.parent/'data'
BASE = '604d5f1a37900991217e1c7b06379c5f58e8c4dd'


def git(*args):
    return subprocess.check_output(['git','-c',f'safe.directory={ROOT.as_posix()}',
                                    '-c','core.safecrlf=false','-c','core.quotepath=false',*args],
                                   cwd=ROOT, text=True, encoding='utf-8')


base_files = git('ls-tree','-r','--name-only',BASE).splitlines()
changed = set(git('diff','--name-only',BASE).splitlines())
engines = [f for f in base_files if f.startswith(('backend/','motion_assets/'))]
report = {
    'upstream': 'https://github.com/openclaw-easy/ViralMint',
    'base_commit': BASE,
    'upstream_engine_files': len(engines),
    'missing_engine_files': [f for f in engines if not (ROOT/f).is_file()],
    'unchanged_engine_files': [f for f in engines if f not in changed],
    'changed_engine_files': [f for f in engines if f in changed],
    'packages': {}, 'optional_credentials': {},
}
for package in ('fastapi','uvicorn','yt-dlp','faster-whisper','ctranslate2','edge-tts',
                'mediapipe','opencv-python','Pillow','sqlalchemy','moviepy','numpy'):
    try:
        report['packages'][package] = importlib.metadata.version(package)
    except importlib.metadata.PackageNotFoundError:
        report['packages'][package] = None
package_file = DATA/'motion/hyperframes/node_modules/hyperframes/package.json'
report['hyperframes_version'] = json.loads(package_file.read_text(encoding='utf-8'))['version']
env = DATA/'.env'
if env.exists():
    from dotenv import dotenv_values
    values = dotenv_values(env)
    report['optional_credentials'] = {key:bool(values.get(key)) for key in (
        'PEXELS_API_KEY','TIKHUB_API_KEY','YOUTUBE_API_KEY','YOUTUBE_CLIENT_ID',
        'YOUTUBE_CLIENT_SECRET','TIKTOK_CLIENT_KEY','TIKTOK_CLIENT_SECRET','OPENAI_API_KEY')}
with httpx.Client(base_url='http://127.0.0.1:16889',timeout=90) as client:
    report['settings_flags'] = {k:v for k,v in client.get('/api/settings').json().items()
                               if k.endswith('_set') or k.endswith('_connected')}
    schema = client.get('/openapi.json').json()
    report['api_routes'] = [{'path':path,'methods':list(methods)} for path,methods in schema['paths'].items()]
    report['read_checks'] = []
    for url in ('/api/health','/api/scout/results?limit=1','/api/channels/list',
                '/api/library/items?limit=1','/api/config/voices/edge_tts',
                '/api/scout/suggest?q=podcast&lang=pt','/api/generate/motion/studio/comps',
                '/api/messaging/status'):
        r = client.get(url)
        entry = {'path':url,'status':r.status_code}
        entry['content_type'] = r.headers.get('content-type')
        if r.is_success and 'application/json' in r.headers.get('content-type',''):
            payload = r.json()
            entry['keys'] = list(payload) if isinstance(payload,dict) else ['list']
            if isinstance(payload,dict):
                entry['counts'] = {k:len(v) for k,v in payload.items() if isinstance(v,list)}
        report['read_checks'].append(entry)
EVIDENCE.mkdir(parents=True,exist_ok=True)
(EVIDENCE/'audit-inventory.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ('api_routes','unchanged_engine_files')},ensure_ascii=False,indent=2))
