"""Exercise the installed native tools through their real HTTP/job/download flow.

Writes only audit inputs and evidence, never sends social posts or messages.
Run against the independent Decupa instance, not an upstream installation.
"""
import argparse
import asyncio
import hashlib
import json
import shutil
import subprocess
import time
from pathlib import Path

import httpx


def probe(path):
    r = subprocess.run([shutil.which('ffprobe'), '-v', 'error', '-show_format',
                        '-show_streams', '-of', 'json', str(path)],
                       capture_output=True, text=True, timeout=30)
    if r.returncode:
        raise RuntimeError(r.stderr[-1000:])
    data = json.loads(r.stdout)
    return {'duration': float(data.get('format', {}).get('duration', 0)),
            'streams': [{k: s[k] for k in ('codec_type', 'codec_name', 'width',
                        'height', 'sample_rate') if k in s} for s in data['streams']]}


async def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--evidence', type=Path, required=True)
    p.add_argument('--only', default='')
    args = p.parse_args()
    out = args.evidence.resolve()
    out.mkdir(parents=True, exist_ok=True)
    sample, audio, logo = out/'audit-speech.mp4', out/'audit-audio.wav', out/'audit-logo.png'
    ff = shutil.which('ffmpeg')
    if not sample.exists():
        subprocess.run([ff, '-v', 'error', '-nostdin', '-y', '-ss', '101.5', '-i',
                        str(args.source), '-t', '8', '-vf', 'scale=640:360,setsar=1',
                        '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
                        str(sample)], check=True)
    if not audio.exists():
        subprocess.run([ff, '-v', 'error', '-nostdin', '-y', '-i', str(sample),
                        '-vn', '-ar', '24000', str(audio)], check=True)
    if not logo.exists():
        subprocess.run([ff, '-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i',
                        'color=c=yellow:s=64x64', '-frames:v', '1', str(logo)], check=True)
    cases = [
        ('trim', {'start_seconds':'1', 'end_seconds':'4'}, [('file',sample)]),
        ('compress', {'resolution':'640x360','level':'high'}, [('file',sample)]),
        ('crop', {'x':'.1','y':'.1','w':'.8','h':'.8'}, [('file',sample)]),
        ('speed', {'speed':'2','keep_pitch':'true'}, [('file',sample)]),
        ('gif', {'width':'240','fps':'10','duration_seconds':'2'}, [('file',sample)]),
        ('transform', {'operation':'rotate_cw'}, [('file',sample)]),
        ('watermark', {}, [('file',sample),('logo',logo)]),
        ('merge-clips', {'target_aspect':'16:9'}, [('files',sample),('files',sample)]),
        ('audio-enhance', {}, [('file',sample)]),
        ('remove-silence', {}, [('file',sample)]),
        ('music-visualizer', {'style':'waves','aspect':'1:1'}, [('file',audio)]),
        ('reframe', {}, [('file',sample)]),
        ('subtitles', {'format':'srt'}, [('file',sample)]),
        ('captions', {'style':'viral','emoji_style':'none'}, [('file',sample)]),
        ('auto-zoom', {}, [('file',sample)]),
        ('metadata', {'text':'Neste teste do Decupa Viral verificamos a importação de um vídeo, a seleção de um trecho e a exportação do corte.','topic':'Auditoria do editor'}, []),
        ('hook-analysis', {}, [('file',sample)]),
        ('auto-chapters', {}, [('file',sample)]),
        ('translate', {'target_language':'English','mode':'captions_only','emoji_style':'none'}, [('file',sample)]),
        ('voiceover', {'text':'Este é um teste de narração em português do Decupa Viral.','provider':'edge_tts','voice_id':'pt-BR-AntonioNeural'}, []),
    ]
    selected = set(args.only.split(',')) if args.only else None
    report = {'base_url':'http://127.0.0.1:16889', 'sample':probe(sample), 'cases':[]}
    report_path = out/'audit-native-tools.json'
    if selected and report_path.exists():
        report = json.loads(report_path.read_text(encoding='utf-8'))
        report['cases'] = [r for r in report['cases'] if r['tool'] not in selected]
    async with httpx.AsyncClient(base_url=report['base_url'], timeout=120) as client:
        health = (await client.get('/api/health')).json()
        if health.get('app') != 'Decupa Viral':
            raise RuntimeError('Refusing to test another installation')
        config = (await client.get('/api/settings')).json()
        report['configuration'] = {k:v for k,v in config.items() if k.endswith('_set') or k.endswith('_connected') or k in ('ai_provider','ai_model','tts_provider')}
        for name, fields, inputs in cases:
            if selected and name not in selected:
                continue
            case = {'tool':name}
            started = time.monotonic()
            try:
                files = [(key,(path.name,path.read_bytes())) for key,path in inputs]
                r = await client.post('/api/tools/'+name, data=fields, files=files or None)
                r.raise_for_status()
                case['job_id'] = r.json()['job_id']
                print(name, case['job_id'], 'started', flush=True)
                for _ in range(240):
                    job = (await client.get('/api/jobs/'+case['job_id'])).json()
                    if job['status'] in ('success','failed','cancelled'):
                        break
                    await asyncio.sleep(2)
                case.update(status=job['status'], error=job.get('error_message'))
                if case['status'] == 'success' and name == 'hook-analysis':
                    data = json.loads(job['output_json'])
                    case['structured_result_ok'] = (isinstance(data.get('score'), (int,float))
                        and isinstance(data.get('strengths'), list) and bool(data.get('alternatives')))
                    case['result'] = data
                elif case['status'] == 'success':
                    meta = (await client.get('/api/tools/download-meta/'+case['job_id'])).json()
                    result = await client.get('/api/tools/download/'+case['job_id'])
                    result.raise_for_status()
                    ext = Path(json.loads(job['output_json'])['file']).suffix
                    artifact = out/(f'audit-{name}'+ext)
                    artifact.write_bytes(result.content)
                    case.update(bytes=artifact.stat().st_size, artifact=str(artifact),
                                sha256=hashlib.sha256(result.content).hexdigest(), meta=meta)
                    if ext in ('.mp4','.mp3','.wav','.gif','.webm'):
                        case['probe'] = probe(artifact)
                        decoded = await asyncio.to_thread(subprocess.run,
                            [ff,'-v','error','-nostdin','-i',str(artifact),'-f','null','-'],
                            capture_output=True, text=True, timeout=90)
                        case['decode_ok'] = decoded.returncode == 0
                        if decoded.returncode:
                            case['decode_error'] = decoded.stderr[-1500:]
                    else:
                        case['nonempty_text'] = bool(result.text.strip())
                else:
                    case['step'] = job.get('current_step')
            except Exception as exc:
                case.update(status='audit_error', error=str(exc))
            case['elapsed_seconds'] = round(time.monotonic()-started, 2)
            report['cases'].append(case)
            report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(name, case['status'], case.get('error') or '', flush=True)


if __name__ == '__main__':
    asyncio.run(main())
