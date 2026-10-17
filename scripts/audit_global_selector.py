"""Read the existing transcript and evaluate native global selection with BYOK."""
import asyncio,json,os
from pathlib import Path
root=Path(__file__).resolve().parents[1]
runtime=root.parent/'.runtime-decupa'
os.environ['VIRALMINT_DATA_DIR']=str(runtime/'data')
os.environ['DEBUG']='false'


async def main():
    from sqlalchemy import select
    from backend.database import AsyncSessionLocal
    from backend.models.user_settings import UserSettings
    from backend.models.downloaded_video import DownloadedVideo
    from backend.services.global_clip_selector import select_global
    async with AsyncSessionLocal() as db:
        user=(await db.execute(select(UserSettings).where(UserSettings.user_id=='local'))).scalar_one()
        source=await db.get(DownloadedVideo,'ee3f8277-4933-4884-b7b9-c31198475733')
    result=await select_global(json.loads(source.transcript_segments_json),source.title,source.duration_seconds,3,user,min_duration=30,max_duration=60)
    print(json.dumps({'intervals':[{'start':c['start'],'end':c['end']} for c in result]}))
    assert 0<len(result)<=3
    assert all(0<=c['start']<c['end']<=source.duration_seconds and 30<=c['end']-c['start']<=60 for c in result)
    report={'passed':True,'scope':'Native Decupa window selection and global reranking with configured BYOK provider',
        'count':len(result),'intervals':[{'start':c['start'],'end':c['end'],'duration':c['end']-c['start']} for c in result],
        'note':'Editorial choices remain suggestions; scores are not measured audience performance.'}
    (runtime/'validation/supoclip-native-global-ai.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))


asyncio.run(main())
