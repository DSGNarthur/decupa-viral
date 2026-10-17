"""Real native package acceptance, without using the developer's installation.

Starts the packaged interpreter with an isolated database and free loopback
port, imports real media, edits, saves/reloads, exports Full HD and fully
decodes the result. UI acceptance is a separate required check.
"""
import argparse
import hashlib
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--payload', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--youtube', help='Optional live local-network YouTube test; not suitable for cloud CI IPs')
    parser.add_argument('--large-import', action='store_true', help='Exercise a valid MP4 larger than 512 MiB')
    parser.add_argument('--check-recovery', action='store_true', help='Crash only the disposable backend child and verify supervisor recovery')
    args = parser.parse_args()
    payload = args.payload.resolve()
    python = payload / ('python/python.exe' if os.name == 'nt' else 'python/bin/python3')
    app = payload / 'app'
    data = args.output.resolve().parent / 'acceptance-data'
    data.mkdir(parents=True, exist_ok=True)
    # Leave room for the supervisor's port+10000 single-instance sentinel.
    for candidate in range(17050, 17150):
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', candidate))
            except OSError:
                continue
            port = candidate
            break
    else:
        raise RuntimeError('Não foi possível reservar uma porta de teste.')
    env = {**os.environ, 'DECUPA_PORT': str(port), 'VIRALMINT_DATA_DIR': str(data), 'PYTHONUTF8': '1',
           'PATH': os.pathsep.join([str(payload/'bin'), str(payload/'node/bin'), str(payload/'node'), os.environ.get('PATH','')])}
    log = (data / 'smoke.log').open('w', encoding='utf-8')
    process = subprocess.Popen([str(python), str(app/'desktop/runtime.py'), '--background'], env=env, cwd=app, stdout=log, stderr=log)
    report = {'platform': sys.platform, 'scope': 'Packaged native HTTP + real media, excludes browser UI', 'checks': []}
    def check(name, passed, **facts):
        report['checks'].append({'name': name, 'passed': bool(passed), **facts})
        if not passed:
            raise AssertionError(name)
    # Use the dependencies from the package even when invoked by a CI Python.
    site = payload / ('python/Lib/site-packages' if os.name == 'nt' else 'python/lib/python3.11/site-packages')
    sys.path.insert(0, str(site))
    import httpx
    import psutil
    try:
        with httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=180) as client:
            for _ in range(90):
                try:
                    if client.get('/api/health', timeout=2).status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                if process.poll() is not None:
                    raise RuntimeError('O motor encerrou antes de iniciar. Consulte ' + str(data/'logs/launcher.log'))
                time.sleep(1)
            else:
                raise RuntimeError('O pacote não iniciou em 90 segundos.')
            origin = 'https://decupa-viral.vercel.app'
            connected = client.post('/api/companion/connect', headers={'Origin':origin,'X-Decupa-Connect':'1'}, json={})
            connected.raise_for_status()
            if args.check_recovery:
                previous_token = connected.json()['token']
                children = psutil.Process(process.pid).children(recursive=True)
                backends = [child for child in children if 'backend.main:app' in child.cmdline()]
                check('supervisor_owned_backend', len(backends) == 1)
                backends[0].kill()
                backends[0].wait(timeout=15)
                for _ in range(60):
                    try:
                        connected = client.post('/api/companion/connect', headers={'Origin':origin,'X-Decupa-Connect':'1'}, json={})
                        if connected.status_code == 200 and connected.json().get('token') != previous_token:
                            break
                    except (httpx.HTTPError, ValueError):
                        pass
                    if process.poll() is not None:
                        raise RuntimeError('O supervisor encerrou durante a recuperação.')
                    time.sleep(1)
                else:
                    raise RuntimeError('O motor de teste não se recuperou em 60 segundos.')
                check('background_crash_recovery_and_token_rotation', True)
            headers = {'Origin':origin,'Authorization':'Bearer '+connected.json()['token']}
            check('unpaired_blocked', client.get('/api/downloaded', headers={'Origin':origin}).status_code == 401)
            check('foreign_read_blocked', client.get('/api/health', headers={'Origin':'https://evil.example'}).status_code == 403)
            ffmpeg = payload / ('bin/ffmpeg.exe' if os.name == 'nt' else 'bin/ffmpeg')
            ffprobe = payload / ('bin/ffprobe.exe' if os.name == 'nt' else 'bin/ffprobe')
            source = data / 'input.mp4'
            subprocess.run([str(ffmpeg),'-v','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=25',
                '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','4','-c:v','libx264','-threads','2','-preset','ultrafast','-c:a','aac',str(source)], check=True)
            before = hashlib.sha256(source.read_bytes()).hexdigest()
            if args.large_import:
                # A valid MP4 free box adds actual transferred bytes without
                # pretending a short generated clip is a long source video.
                import struct
                with source.open('ab') as file:
                    padding = 600 * 1024 * 1024
                    file.write(struct.pack('>I4s', padding, b'free'))
                    file.truncate(file.tell() + padding - 8)
                with source.open('rb') as file:
                    before = hashlib.file_digest(file,'sha256').hexdigest()
            with source.open('rb') as file:
                imported = client.post('/api/downloaded/import', headers=headers, files={'file': ('Teste.mp4',file,'video/mp4')}, data={'title':'Teste do instalador', 'analyze':'false'})
            imported.raise_for_status()
            imported_id = imported.json()['id']
            if args.large_import:
                check('import_above_512_mib', imported.json()['file_size_mb'] > 512, mib=imported.json()['file_size_mb'])
            # Insert only the generated-clip fixture; import was the public API.
            seed = '''import asyncio,json,sys
from backend.database import AsyncSessionLocal
from backend.models.generated_video import GeneratedVideo
async def seed():
    async with AsyncSessionLocal() as db:
        clip=GeneratedVideo(title='Corte de instalação',source_downloaded_video_id=sys.argv[1],clip_start_seconds=0,clip_end_seconds=4,aspect_ratio='9:16',caption_status='skipped')
        db.add(clip);await db.commit();print(clip.id)
asyncio.run(seed())
'''
            seed_env = {**env, 'PORT':str(port), 'HOST':'127.0.0.1','DEBUG':'false', 'DECUPA_COMPANION':'1'}
            clip_id = subprocess.check_output([str(python),'-c',seed,imported_id],cwd=app,env=seed_env,text=True,encoding='utf-8').strip().splitlines()[-1]
            draft = client.post('/api/editor/prepare/'+clip_id, headers=headers)
            draft.raise_for_status()
            draft = draft.json()
            document = draft['document']
            document['segments'] = [{'id':'one','start':0,'end':1},{'id':'two','start':2,'end':3}]
            document['words'] = [{'id':'word','text':'Decupa','start':0.1,'end':0.8}]
            document['framing'].update(aspect='vertical',mode='manual')
            saved = client.put('/api/editor/drafts/'+draft['id'], headers=headers, json={'revision':draft['revision'],'document':document})
            saved.raise_for_status()
            saved = saved.json()
            reloaded = client.get('/api/editor/drafts/'+draft['id'], headers=headers).json()
            check('saved_and_reloaded', reloaded['document'] == saved['document'])
            ranged = client.get('/api/editor/drafts/'+draft['id']+'/stream', headers={**headers,'Range':'bytes=0-1023'})
            check('range_stream', ranged.status_code == 206 and len(ranged.content) == 1024)
            exported = client.post('/api/editor/drafts/'+draft['id']+'/export', headers=headers, json={'revision':saved['revision'],'document':saved['document']})
            exported.raise_for_status()
            job_id = exported.json()['job_id']
            for _ in range(240):
                job = client.get('/api/jobs/'+job_id, headers=headers).json()
                if job['status'] not in ('running','pending'):
                    break
                time.sleep(1)
            check('full_hd_export_job', job['status'] == 'success', error=job.get('error_message'))
            video_id = json.loads(job['output_json'])['video_id']
            output = data / 'export.mp4'
            with client.stream('GET','/api/videos/'+video_id+'/stream',headers=headers) as response:
                response.raise_for_status()
                with output.open('wb') as file:
                    for chunk in response.iter_bytes():
                        file.write(chunk)
            info = json.loads(subprocess.check_output([str(ffprobe),'-v','error','-show_streams','-show_format','-of','json',str(output)]))
            video = next(s for s in info['streams'] if s['codec_type']=='video')
            check('full_hd_dimensions', (video['width'],video['height']) == (1080,1920))
            subprocess.run([str(ffmpeg),'-v','error','-i',str(output),'-f','null','-'],check=True)
            check('fully_decoded', True, bytes=output.stat().st_size)
            with source.open('rb') as file:
                check('source_preserved', hashlib.file_digest(file,'sha256').hexdigest() == before)
            if args.youtube:
                requested = client.post('/api/downloaded/batch-download', headers=headers,
                    json={'urls':[args.youtube], 'analyze':False, 'options':{'quality':'1080p','container':'mp4'}})
                requested.raise_for_status()
                job_id = requested.json()['job_id']
                for _ in range(1200):
                    job = client.get('/api/jobs/'+job_id, headers=headers).json()
                    if job['status'] not in ('running','pending'):
                        break
                    time.sleep(1)
                check('live_youtube_download', job['status']=='success', status=job['status'], error=job.get('error_message'))
            report['passed'] = True
    finally:
        try:
            descendants = psutil.Process(process.pid).children(recursive=True)
        except psutil.NoSuchProcess:
            descendants = []
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        for child in reversed(descendants):
            try:
                child.terminate()
            except psutil.NoSuchProcess:
                pass
        _, alive = psutil.wait_procs(descendants, timeout=10)
        for child in alive:
            try:
                child.kill()
            except psutil.NoSuchProcess:
                pass
        log.close()
        args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__ == '__main__':
    main()
