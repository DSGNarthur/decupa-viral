# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""MCP research / acquire / intelligence / macros tool modules.

Every tool is a thin wrapper over the REST API, so the tests check two
things: (1) each tool sends the right METHOD + PATH + body/params, and
(2) every route a tool calls really exists on the FastAPI app — a tool that
wraps a missing route only fails when a model calls it.

The self-HTTP client is stubbed; nothing reaches the network or an AI API.
"""
from __future__ import annotations

import json

import pytest
from fastmcp import FastMCP

from backend.mcp.tools import acquire, intelligence, macros, research


# ── harness ────────────────────────────────────────────────────────────────

class Recorder:
    """Stands in for backend.mcp.client; records calls, answers by route."""

    def __init__(self):
        self.calls: list[tuple[str, str, dict]] = []
        self.routes: dict[tuple[str, str], object] = {}

    def on(self, method: str, path: str, response):
        self.routes[(method, path)] = response

    async def _answer(self, method, path, kwargs):
        self.calls.append((method, path, kwargs))
        resp = self.routes.get((method, path), {})
        if callable(resp):
            resp = resp()
        if isinstance(resp, Exception):
            raise resp
        return resp

    async def get(self, path, **kw):
        return await self._answer("GET", path, kw)

    async def post(self, path, **kw):
        return await self._answer("POST", path, kw)

    async def post_file(self, path, file_path, **kw):
        return await self._answer("POST", path, {"file_path": file_path, **kw})


@pytest.fixture
def rec(monkeypatch):
    r = Recorder()
    from backend.mcp import client
    for name in ("get", "post", "post_file"):
        monkeypatch.setattr(client, name, getattr(r, name))
    return r


@pytest.fixture(scope="module")
def mcp():
    m = FastMCP("test")
    for mod in (macros, research, acquire, intelligence):
        mod.register(m)
    return m


async def _call(mcp, name, args=None):
    result = await mcp.call_tool(name, args or {})
    return result.structured_content


async def _call_raises(mcp, name, args):
    with pytest.raises(Exception) as ei:
        await mcp.call_tool(name, args)
    return str(ei.value)


# ── research ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_scout_trending_posts_niche_and_platforms(mcp, rec):
    rec.on("POST", "/api/scout/start", {"job_id": "j1"})
    out = await _call(mcp, "scout_trending", {"niche": " ai tools ", "platforms": ["YouTube", "tiktok"]})
    assert out == {"job_id": "j1"}
    assert rec.calls == [("POST", "/api/scout/start",
                          {"json": {"niche": "ai tools", "platforms": ["youtube", "tiktok"]}})]


@pytest.mark.asyncio
async def test_scout_trending_rejects_unknown_platform(mcp, rec):
    msg = await _call_raises(mcp, "scout_trending", {"niche": "ai", "platforms": ["reddit"]})
    assert "reddit" in msg
    assert rec.calls == []


@pytest.mark.asyncio
async def test_list_scout_results_with_job_reports_coverage(mcp, rec):
    rec.on("GET", "/api/scout/results",
           {"total": 1, "results": [{"id": "r", "platform": "youtube"}]})
    rec.on("GET", "/api/jobs/j1", {"input_json": json.dumps({"platforms": ["youtube", "tiktok"]})})
    out = await _call(mcp, "list_scout_results", {"job_id": "j1", "limit": 10})
    assert rec.calls[0] == ("GET", "/api/scout/results",
                            {"params": {"limit": 10, "offset": 0, "job_id": "j1"}})
    assert out["platforms_used"] == ["youtube"]
    assert out["platforms_missing"] == ["tiktok"]


@pytest.mark.asyncio
async def test_list_scout_results_without_job_is_passthrough(mcp, rec):
    rec.on("GET", "/api/scout/results", {"total": 0, "results": []})
    out = await _call(mcp, "list_scout_results")
    assert out == {"total": 0, "results": []}
    assert len(rec.calls) == 1


@pytest.mark.asyncio
async def test_get_search_demand(mcp, rec):
    await _call(mcp, "get_search_demand", {"niche": " cooking "})
    assert rec.calls == [("GET", "/api/scout/search-demand",
                          {"params": {"niche": "cooking", "lang": "en"}})]
    assert "2 characters" in await _call_raises(mcp, "get_search_demand", {"niche": "x"})


@pytest.mark.asyncio
async def test_scout_news_body_and_source_validation(mcp, rec):
    await _call(mcp, "scout_news", {"query": "nvidia", "expanded_queries": ["nvda"],
                                    "sources": ["Google", "reddit"]})
    assert rec.calls == [("POST", "/api/news/scout",
                          {"json": {"query": "nvidia", "expanded_queries": ["nvda"],
                                    "sources": ["google", "reddit"]}})]
    assert "bogus" in await _call_raises(mcp, "scout_news", {"query": "x", "sources": ["bogus"]})


@pytest.mark.asyncio
async def test_save_news_articles(mcp, rec):
    await _call(mcp, "save_news_articles", {"article_ids": ["a", "b"]})
    assert rec.calls == [("POST", "/api/news/save", {"json": {"article_ids": ["a", "b"]}})]
    await _call_raises(mcp, "save_news_articles", {"article_ids": []})


@pytest.mark.asyncio
async def test_analyze_channel(mcp, rec):
    await _call(mcp, "analyze_channel", {"video_url": "https://youtu.be/x", "title": "T"})
    assert rec.calls == [("POST", "/api/channels/analyze",
                          {"json": {"video_url": "https://youtu.be/x", "title": "T"}})]


# ── acquire ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_download_video_urls_path_with_options(mcp, rec):
    await _call(mcp, "download_video", {"urls": ["https://a/1"], "quality": "720p",
                                        "thumbnail": True, "analyze": False})
    assert rec.calls == [("POST", "/api/downloaded/batch-download", {"json": {
        "urls": [{"url": "https://a/1"}],
        "options": {"quality": "720p", "thumbnail": True},
        "analyze": False,
    }})]


@pytest.mark.asyncio
async def test_download_video_scout_path(mcp, rec):
    await _call(mcp, "download_video", {"scout_result_ids": ["s1"]})
    assert rec.calls == [("POST", "/api/scout/download", {"json": {"scout_result_ids": ["s1"]}})]


@pytest.mark.asyncio
async def test_download_video_requires_exactly_one_source(mcp, rec):
    await _call_raises(mcp, "download_video", {})
    await _call_raises(mcp, "download_video", {"urls": ["u"], "scout_result_ids": ["s"]})
    await _call_raises(mcp, "download_video", {"urls": [f"https://a/{i}" for i in range(21)]})
    assert rec.calls == []


@pytest.mark.asyncio
async def test_list_downloaded_clamps_limit(mcp, rec):
    await _call(mcp, "list_downloaded", {"limit": 999, "offset": 5})
    assert rec.calls == [("GET", "/api/downloaded", {"params": {"limit": 200, "offset": 5}})]


@pytest.mark.asyncio
async def test_analyze_downloaded_hits_reanalyze(mcp, rec):
    await _call(mcp, "analyze_downloaded", {"downloaded_video_id": "dv1", "whisper_quality": "Accurate"})
    assert rec.calls == [("POST", "/api/downloaded/dv1/reanalyze",
                          {"json": {"whisper_quality": "accurate"}})]
    await _call_raises(mcp, "analyze_downloaded", {"downloaded_video_id": "dv1", "whisper_quality": "huge"})


@pytest.mark.asyncio
async def test_import_local_video_uses_multipart(mcp, rec):
    await _call(mcp, "import_local_video", {"file_path": "/tmp/x.mp4", "title": "Mine"})
    method, path, kw = rec.calls[0]
    assert (method, path) == ("POST", "/api/downloaded/import")
    assert kw["file_path"] == "/tmp/x.mp4"
    assert kw["file_field"] == "file"
    assert kw["form"] == {"title": "Mine"}


@pytest.mark.asyncio
async def test_channel_list_and_videos(mcp, rec):
    await _call(mcp, "list_connected_channels", {"platform": "YouTube"})
    await _call(mcp, "list_channel_videos", {"channel_db_id": "c1", "refresh": True})
    assert rec.calls == [
        ("GET", "/api/channels/list", {"params": {"platform": "youtube"}}),
        ("GET", "/api/channels/videos/c1", {"params": {"refresh": "true"}}),
    ]
    await _call_raises(mcp, "list_connected_channels", {"platform": "vimeo"})


@pytest.mark.asyncio
async def test_connect_channel_infers_platform(mcp, rec):
    await _call(mcp, "connect_channel", {"url": "https://www.youtube.com/@mkbhd"})
    await _call(mcp, "connect_channel", {"url": "https://www.tiktok.com/@x"})
    await _call(mcp, "connect_channel", {"url": "@x", "platform": "tiktok"})
    assert [c[2]["json"]["platform"] for c in rec.calls] == ["youtube", "tiktok", "tiktok"]
    # The endpoint requires a platform; an ambiguous handle must not be sent.
    msg = await _call_raises(mcp, "connect_channel", {"url": "@x"})
    assert "platform" in msg
    assert len(rec.calls) == 3


def test_detect_channel_platform():
    d = acquire.detect_channel_platform
    assert d("youtu.be/abc") == "youtube"
    assert d("https://m.youtube.com/channel/UC1") == "youtube"
    assert d("tiktok.com/@a") == "tiktok"
    assert d("https://example.com/youtube.com") is None
    assert d("@handle") is None


# ── intelligence ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_intelligence_tools(mcp, rec):
    await _call(mcp, "score_keyword", {"keyword": " vegan "})
    await _call(mcp, "rising_keywords", {"niche": "vegan"})
    await _call(mcp, "trend_velocity", {"keyword": "vegan"})
    await _call(mcp, "trend_velocity")
    await _call(mcp, "list_viral_formulas", {"niche": "vegan"})
    await _call(mcp, "generate_viral_formula", {"niche": "vegan", "video_ids": ["a", "b", "c"]})
    assert rec.calls == [
        ("GET", "/api/scout/keyword-score", {"params": {"keyword": "vegan"}}),
        ("GET", "/api/scout/rising-keywords", {"params": {"niche": "vegan"}}),
        ("GET", "/api/scout/trend-velocity", {"params": {"keyword": "vegan"}}),
        ("GET", "/api/scout/trend-velocity", {"params": {}}),
        ("GET", "/api/scout/viral-formulas", {"params": {"niche": "vegan"}}),
        ("POST", "/api/scout/viral-formula", {"json": {"niche": "vegan", "video_ids": ["a", "b", "c"]}}),
    ]
    await _call_raises(mcp, "score_keyword", {"keyword": "a"})
    await _call_raises(mcp, "generate_viral_formula", {"niche": " "})


# ── macros ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_find_breakouts_filters_sorts_and_reports_coverage(mcp, rec):
    rec.on("POST", "/api/scout/start", {"job_id": "jb"})
    rec.on("GET", "/api/jobs/jb", {"id": "jb", "status": "success"})
    rec.on("GET", "/api/scout/results", {"results": [
        {"id": "r1", "virality_score": 60, "platform": "youtube"},
        {"id": "r2", "virality_score": 20, "platform": "youtube"},
        {"id": "r3", "virality_score": 90, "platform": "youtube"},
    ]})
    out = await _call(mcp, "find_breakouts", {"niche": "ai", "platforms": ["youtube", "tiktok"]})
    assert rec.calls[0] == ("POST", "/api/scout/start",
                            {"json": {"niche": "ai", "platforms": ["youtube", "tiktok"]}})
    assert [r["id"] for r in out["results"]] == ["r3", "r1"]
    assert out["total_scouted"] == 3 and out["matched_count"] == 2
    assert out["platforms_missing"] == ["tiktok"]


@pytest.mark.asyncio
async def test_recent_activity_summary_counts_window(mcp, rec):
    from datetime import datetime
    now = datetime.utcnow().isoformat()
    rec.on("GET", "/api/videos", {"videos": [
        {"id": "v1", "title": "New", "created_at": now},
        {"id": "v2", "title": "Old", "created_at": "2000-01-01T00:00:00"},
    ]})
    rec.on("GET", "/api/jobs", RuntimeError("boom"))
    out = await _call(mcp, "recent_activity_summary", {"days": 3})
    assert out["videos_generated"] == 1 and out["video_titles"] == ["New"]
    assert out["jobs_total"] == 0 and "boom" in out["jobs_error"]
    assert "balance" not in out


@pytest.mark.asyncio
async def test_analyze_competitor_reads_downloaded_ids(mcp, rec):
    rec.on("POST", "/api/channels/analyze", {"job_id": "ja"})
    rec.on("GET", "/api/jobs/ja", {"id": "ja", "status": "success",
                                   "output_json": json.dumps({"downloaded_ids": ["dv9"]})})
    rec.on("GET", "/api/downloaded/dv9", {"title": "Comp", "transcript": "x" * 2500,
                                          "insights": {"hook": "h"}, "video_path": "/v.mp4"})
    out = await _call(mcp, "analyze_competitor", {"video_url": "https://youtu.be/q"})
    assert out["downloaded_video_id"] == "dv9"
    assert out["transcript_truncated"] is True
    assert out["insights"] == {"hook": "h"}


@pytest.mark.asyncio
async def test_analyze_competitor_surfaces_failure(mcp, rec):
    rec.on("POST", "/api/channels/analyze", {"job_id": "jf"})
    rec.on("GET", "/api/jobs/jf", {"id": "jf", "status": "failed", "error_message": "geo-blocked"})
    out = await _call(mcp, "analyze_competitor", {"video_url": "https://youtu.be/q"})
    assert out["status"] == "failed" and out["error"] == "geo-blocked"


# ── every wrapped route exists on the real app ─────────────────────────────

# tool name → (METHOD, route path as declared on the app)
ROUTES = {
    "research": {
        "scout_trending": ("POST", "/api/scout/start"),
        "list_scout_results": ("GET", "/api/scout/results"),
        "list_scout_results:job": ("GET", "/api/jobs/{job_id}"),
        "get_search_demand": ("GET", "/api/scout/search-demand"),
        "scout_news": ("POST", "/api/news/scout"),
        "save_news_articles": ("POST", "/api/news/save"),
        "analyze_channel": ("POST", "/api/channels/analyze"),
    },
    "acquire": {
        "download_video:urls": ("POST", "/api/downloaded/batch-download"),
        "download_video:scout": ("POST", "/api/scout/download"),
        "list_downloaded": ("GET", "/api/downloaded"),
        "analyze_downloaded": ("POST", "/api/downloaded/{video_id}/reanalyze"),
        "import_local_video": ("POST", "/api/downloaded/import"),
        "list_connected_channels": ("GET", "/api/channels/list"),
        "list_channel_videos": ("GET", "/api/channels/videos/{channel_db_id}"),
        "connect_channel": ("POST", "/api/channels/connect"),
    },
    "intelligence": {
        "score_keyword": ("GET", "/api/scout/keyword-score"),
        "rising_keywords": ("GET", "/api/scout/rising-keywords"),
        "trend_velocity": ("GET", "/api/scout/trend-velocity"),
        "list_viral_formulas": ("GET", "/api/scout/viral-formulas"),
        "generate_viral_formula": ("POST", "/api/scout/viral-formula"),
    },
    "macros": {
        "find_breakouts:start": ("POST", "/api/scout/start"),
        "find_breakouts:results": ("GET", "/api/scout/results"),
        "recent_activity_summary:videos": ("GET", "/api/videos"),
        "recent_activity_summary:jobs": ("GET", "/api/jobs"),
        "analyze_competitor:analyze": ("POST", "/api/channels/analyze"),
        "analyze_competitor:row": ("GET", "/api/downloaded/{video_id}"),
        "wait:job": ("GET", "/api/jobs/{job_id}"),
    },
}


@pytest.fixture(scope="module")
def app_routes():
    # app.openapi(), not app.routes: included routers are resolved lazily, so
    # walking app.routes misses them; openapi() returns fully-prefixed paths.
    from backend.main import app
    found = set()
    for path, ops in (app.openapi().get("paths") or {}).items():
        for method in ops:
            found.add((method.upper(), path))
    return found


@pytest.mark.parametrize("module_name", sorted(ROUTES))
def test_wrapped_routes_exist_on_app(module_name, app_routes):
    missing = {k: v for k, v in ROUTES[module_name].items() if v not in app_routes}
    assert not missing, f"{module_name} wraps routes the app doesn't serve: {missing}"


@pytest.mark.asyncio
@pytest.mark.parametrize("module", [research, acquire, intelligence, macros])
async def test_route_table_covers_every_registered_tool(module):
    m = FastMCP("cov")
    module.register(m)
    names = {t.name for t in await m.list_tools()}
    covered = {k.split(":")[0] for k in ROUTES[module.__name__.rsplit(".", 1)[1]]} - {"wait"}
    assert names == covered
