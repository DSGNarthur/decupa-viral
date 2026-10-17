# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from backend.services.global_clip_selector import windows,select_global


def test_windows_cover_video_with_overlap():
    assert list(windows(1400))==[(0,720),(600,1320),(1200,1400)]


@pytest.mark.asyncio
async def test_global_ranker_can_only_choose_valid_candidates(monkeypatch):
    from backend.services import clip_extractor
    from backend.core import ai_provider
    async def candidates(segments,*args,**kwargs):
        first=segments[0]['start']
        return [{'start':first,'end':first+20,'virality_score':7,'title':'Fonte preservada','score_breakdown':{'flow':6}}]
    class Client:
        async def chat(self,**kwargs):return '[1,0,1]'
    monkeypatch.setattr(clip_extractor,'_select_clip_windows',candidates)
    monkeypatch.setattr(ai_provider,'get_ai_client',lambda _:Client())
    result=await select_global([{'start':0,'end':30,'text':'primeiro'},{'start':800,'end':840,'text':'segundo'}],'teste',1400,2,None)
    assert [c['start'] for c in result]==[800,0]
    assert result[0]['score_breakdown']=={'flow':6}


@pytest.mark.asyncio
async def test_global_ranker_rejects_invented_ids(monkeypatch):
    from backend.services import clip_extractor
    from backend.core import ai_provider
    async def candidates(*args,**kwargs):return [{'start':0,'end':20,'virality_score':7}]
    class Client:
        async def chat(self,**kwargs):return '[99]'
    monkeypatch.setattr(clip_extractor,'_select_clip_windows',candidates)
    monkeypatch.setattr(ai_provider,'get_ai_client',lambda _:Client())
    with pytest.raises(ValueError,match='IDs válidos'):
        await select_global([{'start':0,'end':30,'text':'fonte'}],'teste',60,2,None)


@pytest.mark.asyncio
async def test_global_strategy_honors_duration_and_requires_title_review(monkeypatch):
    from backend.services import clip_extractor
    from backend.core import ai_provider
    async def candidates(*args,**kwargs):
        return [{'start':0,'end':12,'hook':'Sem revisão'},{'start':20,'end':55,'hook':'Título sugerido','virality_score':7}]
    class Client:
        async def chat(self,**kwargs):return '[0]'
    monkeypatch.setattr(clip_extractor,'_select_clip_windows',candidates)
    monkeypatch.setattr(ai_provider,'get_ai_client',lambda _:Client())
    result=await select_global([{'start':0,'end':60,'text':'fonte'}],'teste',60,2,None,min_duration=30,max_duration=40)
    assert len(result)==1
    assert result[0]['start']==20
    assert result[0]['hook']==''
