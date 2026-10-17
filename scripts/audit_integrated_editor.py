"""Verify native HTTP -> SQLite -> real FFmpeg -> authenticated media download."""
from pathlib import Path
import hashlib
import json
import subprocess
import time
import httpx

root=Path(__file__).resolve().parents[1]
evidence=root.parent/'.runtime-decupa/validation'
evidence.mkdir(exist_ok=True,parents=True)
report={'scope':'Native HTTP API, SQLite, jobs and media; browser acceptance is separate','checks':[]}


def check(name,passed,**facts):
    report['checks'].append({'name':name,'passed':bool(passed),**facts})
    if not passed:raise AssertionError(name)


with httpx.Client(base_url='http://127.0.0.1:16889',timeout=180) as client:
    health=client.get('/api/health');health.raise_for_status()
    clips=client.get('/api/videos?limit=100').json()
    rows=clips.get('videos',[]) if isinstance(clips,dict) else clips
    clip=next(c for c in rows if c.get('source_downloaded_video_id')=='ee3f8277-4933-4884-b7b9-c31198475733')
    prepared=client.post('/api/editor/prepare/'+clip['id']);prepared.raise_for_status()
    draft=prepared.json();document=draft['document']
    document['segments']=[{'id':'um','start':0,'end':2},{'id':'dois','start':4,'end':6}]
    if document['words']:document['words'][0]['text']=document['words'][0]['text'].strip()
    document['captions']['background']=True
    document['framing'].update(aspect='vertical',mode='face')
    document['volume']=.5
    saved=client.put('/api/editor/drafts/'+draft['id'],json={'revision':draft['revision'],'document':document})
    saved.raise_for_status();saved=saved.json()
    stale=client.put('/api/editor/drafts/'+draft['id'],json={'revision':draft['revision'],'document':document})
    check('stale_revision_rejected',stale.status_code==409)
    loaded=client.get('/api/editor/drafts/'+draft['id']).json()
    check('reload_preserves_document',loaded['document']==saved['document'])
    stream=client.get('/api/editor/drafts/'+draft['id']+'/stream',headers={'Range':'bytes=0-1023'})
    check('source_supports_range',stream.status_code==206 and len(stream.content)==1024)
    denied=client.get('/api/editor/drafts/'+draft['id']+'/stream',headers={'Origin':'https://decupa-viral.vercel.app'})
    check('unpaired_origin_denied',denied.status_code==401)
    forbidden=client.put('/api/editor/drafts/'+draft['id'],json={'revision':loaded['revision'],'document':document},headers={'Origin':'https://example.invalid'})
    check('cross_origin_mutation_denied',forbidden.status_code==403)
    # The pairing link is local-only; the capability never enters the report.
    link=client.post('/api/companion/link').json()['url']
    token=link.split('#pc=')[1]
    headers={'Origin':'https://decupa-viral.vercel.app','Authorization':'Bearer '+token}
    paired=client.get('/api/editor/drafts/'+draft['id'],headers=headers)
    check('paired_vercel_origin_reads_draft',paired.status_code==200)
    result=client.post('/api/editor/drafts/'+draft['id']+'/export',json={'revision':loaded['revision'],'document':loaded['document']},headers=headers)
    result.raise_for_status();job_id=result.json()['job_id']
    started=time.monotonic()
    while time.monotonic()-started<240:
        job=client.get('/api/jobs/'+job_id).json()
        if job['status'] not in ('running','pending'):break
        time.sleep(.5)
    check('export_job_succeeded',job['status']=='success',status=job['status'],error=job.get('error_message'))
    out=json.loads(job['output_json']);video_id=out['video_id']
    media=client.get('/api/videos/'+video_id+'/stream',headers=headers)
    media.raise_for_status()
    destination=evidence/'Decupa-edicao-integrada-verificada.mp4'
    destination.write_bytes(media.content)
    decoded=subprocess.run(['ffmpeg','-v','error','-i',str(destination),'-f','null','-'],capture_output=True)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(destination)]))
    video=next(s for s in probe['streams'] if s['codec_type']=='video')
    check('download_full_decode',decoded.returncode==0,bytes=len(media.content),sha256=hashlib.sha256(media.content).hexdigest())
    check('output_geometry_and_duration',video['width']==1080 and video['height']==1920 and abs(float(probe['format']['duration'])-4)<.15,
          width=video['width'],height=video['height'],duration=probe['format']['duration'])
    check('download_content_disposition',bool(media.headers.get('Content-Disposition')))
    # Never probe a destructive operation on the user's real source. The
    # rejection is exercised with disposable media in test_clip_editor_integration.
    report.update(draft_id=draft['id'],export_video_id=video_id,output=str(destination),passed=True)

(evidence/'supoclip-integrated-http.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
