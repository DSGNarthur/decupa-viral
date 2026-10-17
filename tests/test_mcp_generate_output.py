# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""MCP generate + output tools: each hits the right OSS route with the right shape.

The self-HTTP client is stubbed (no network, no AI); a final test checks every
route the tools call is actually registered on the FastAPI app, so a renamed
endpoint fails here instead of at a user's first call.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastmcp import FastMCP

from backend.mcp.tools import generate, output

# tool name → (METHOD, route template as registered on the app)
ROUTES = {
    "generate_script_from_topic": ("POST", "/api/downloaded/generate-script-from-topic"),
    "polish_script": ("POST", "/api/downloaded/polish-script"),
    "split_scenes": ("POST", "/api/generate/split-scenes"),
    "generate_smart_video": ("POST", "/api/generate/stock"),
    "generate_from_downloaded": ("POST", "/api/downloaded/{video_id}/generate"),
    "batch_generate": ("POST", "/api/downloaded/batch-generate"),
    "motion_compose": ("POST", "/api/generate/motion/studio/author"),
    "motion_stage_asset": ("POST", "/api/generate/motion/studio/assets"),
    "motion_list_comps": ("GET", "/api/generate/motion/studio/comps"),
    "motion_cleanup_comps": ("POST", "/api/generate/motion/studio/comps/cleanup"),
    "motion_sync_renders": ("POST", "/api/generate/motion/studio/sync-renders"),
    "motion_submit_composition": ("POST", "/api/generate/motion/studio/submit"),
    "motion_render": ("POST", "/api/generate/motion/studio/export"),
    "list_videos": ("GET", "/api/videos"),
    "get_video": ("GET", "/api/videos/{video_id}"),
    "suggest_clips": ("POST", "/api/downloaded/{video_id}/suggest-clips"),
    "extract_viral_clips": ("POST", "/api/downloaded/{video_id}/extract-clips"),
    "extract_manual_clips": ("POST", "/api/downloaded/{video_id}/extract-clips"),
    "export_video": ("POST", "/api/videos/{video_id}/export"),
}


@pytest.fixture(scope="module")
def mcp():
    m = FastMCP("test")
    generate.register(m)
    output.register(m)
    return m


@pytest.fixture
def calls(monkeypatch):
    """Capture every client call as (METHOD, path, kwargs)."""
    class _Log(list):
        reply: dict

    log = _Log()
    reply: dict = {"value": {"job_id": "j1"}}

    def make(method):
        async def fn(path, **kw):
            log.append((method, path, kw))
            return reply["value"]
        return fn

    for name in ("get", "post", "put", "patch", "delete"):
        monkeypatch.setattr(f"backend.mcp.client.{name}", make(name.upper()))

    async def post_file(path, file_path, **kw):
        log.append(("POST_FILE", path, {"file_path": file_path, **kw}))
        return reply["value"]

    async def stream_to_file(method, path, output_path, **kw):
        log.append(("STREAM_" + method, path, {"output_path": output_path, **kw}))
        return {"output_path": output_path, "size_bytes": 1, "content_type": "video/mp4"}

    monkeypatch.setattr("backend.mcp.client.post_file", post_file)
    monkeypatch.setattr("backend.mcp.client.stream_to_file", stream_to_file)
    log.reply = reply
    return log


async def _call(mcp, name, args=None):
    res = await mcp.call_tool(name, args or {})
    return res.structured_content


async def _raises(mcp, name, args):
    with pytest.raises(Exception):
        await mcp.call_tool(name, args)


def test_tool_surface_is_exactly_the_ported_set(mcp):
    import asyncio
    names = {t.name for t in asyncio.run(mcp.list_tools())}
    assert names == set(ROUTES)


# ── scripts ──────────────────────────────────────────────────────────────────

async def test_generate_script_from_topic(mcp, calls):
    await _call(mcp, "generate_script_from_topic",
                {"topic": "AI chips", "user_instructions": "punchy"})
    assert calls[-1] == ("POST", "/api/downloaded/generate-script-from-topic",
                         {"json": {"topic": "AI chips", "aspect_ratio": "9:16",
                                   "user_instructions": "punchy"}})
    await _raises(mcp, "generate_script_from_topic", {"topic": "  "})


async def test_polish_script(mcp, calls):
    await _call(mcp, "polish_script", {"script": "  hello  "})
    assert calls[-1] == ("POST", "/api/downloaded/polish-script", {"json": {"script": "hello"}})
    await _raises(mcp, "polish_script", {"script": ""})
    await _raises(mcp, "polish_script", {"script": "x" * 8001})


async def test_split_scenes_sends_no_mode(mcp, calls):
    await _call(mcp, "split_scenes", {"script": "a b c", "source_id": "dv1"})
    assert calls[-1] == ("POST", "/api/generate/split-scenes",
                         {"json": {"script": "a b c", "aspect_ratio": "9:16", "source_id": "dv1"}})


# ── Smart Video ──────────────────────────────────────────────────────────────

async def test_generate_smart_video_body_matches_stock_request(mcp, calls, tmp_path):
    img = tmp_path / "a.png"
    img.write_bytes(b"x")
    await _call(mcp, "generate_smart_video", {
        "script": " Hello world. ", "visual_style": "noir", "transition_style": "fade",
        "user_images": [str(img), "/api/media/up.png"], "tts_voice": "en-US-X",
    })
    method, path, kw = calls[-1]
    assert (method, path) == ("POST", "/api/generate/stock")
    body = kw["json"]
    assert body == {
        "script": "Hello world.", "aspect_ratio": "9:16", "tts_provider": "edge_tts",
        "caption_enabled": True, "caption_style": "viral", "music_enabled": True,
        "music_genre": "lofi", "tts_voice": "en-US-X", "visual_style": "noir",
        "transition_style": "fade",
        "user_images": [str(img.resolve()), "/api/media/up.png"],
    }
    # Every key must be a field of the OSS request model.
    from backend.api.generate import StockGenerateRequest
    assert set(body) <= set(StockGenerateRequest.model_fields)


async def test_generate_smart_video_validation(mcp, calls, tmp_path):
    await _raises(mcp, "generate_smart_video", {"script": "   "})
    await _raises(mcp, "generate_smart_video",
                  {"script": "x", "start_image": str(tmp_path / "missing.png")})
    await _raises(mcp, "generate_smart_video",
                  {"script": "x", "user_images": ["/api/media/a.png"] * 13})
    assert calls == []


async def test_generate_from_downloaded_forwards_only_set_fields(mcp, calls):
    await _call(mcp, "generate_from_downloaded",
                {"downloaded_video_id": "dv1", "custom_script": "s", "caption_enabled": False})
    assert calls[-1] == ("POST", "/api/downloaded/dv1/generate",
                         {"json": {"aspect_ratio": "9:16", "custom_script": "s",
                                   "caption_enabled": False}})


async def test_batch_generate(mcp, calls):
    items = [{"downloaded_video_id": "a"}, {"downloaded_video_id": "b", "aspect_ratio": "16:9"}]
    calls.reply["value"] = {"job_id": "p", "count": 2}
    out = await _call(mcp, "batch_generate",
                      {"items": items, "shared_settings": {"caption_style": "bold"}})
    assert out == {"job_id": "p", "count": 2}
    assert calls[-1] == ("POST", "/api/downloaded/batch-generate",
                         {"json": {"items": items, "shared_settings": {"caption_style": "bold"}}})


async def test_batch_generate_rejects_knobs_the_runner_ignores(mcp, calls):
    await _raises(mcp, "batch_generate", {"items": []})
    await _raises(mcp, "batch_generate", {"items": [{"downloaded_video_id": "a"}] * 11})
    await _raises(mcp, "batch_generate", {"items": [{"aspect_ratio": "9:16"}]})
    await _raises(mcp, "batch_generate",
                  {"items": [{"downloaded_video_id": "a", "gen_tier": "premium"}]})
    await _raises(mcp, "batch_generate",
                  {"items": [{"downloaded_video_id": "a"}],
                   "shared_settings": {"video_model": "veo"}})
    assert calls == []


# ── Motion Graphics ──────────────────────────────────────────────────────────

async def test_motion_compose_body(mcp, calls):
    await _call(mcp, "motion_compose", {"topic": "launch", "headline": "Hi", "duration_seconds": 10})
    method, path, kw = calls[-1]
    assert (method, path) == ("POST", "/api/generate/motion/studio/author")
    assert kw["json"] == {"accent": "#ffd60a", "aspect_ratio": "9:16",
                          "duration_seconds": 10, "topic": "launch", "headline": "Hi"}
    from backend.api.generate import MotionComposeRequest
    assert set(kw["json"]) <= set(MotionComposeRequest.model_fields)
    await _raises(mcp, "motion_compose", {})


async def test_motion_install_envelope_passes_through(mcp, calls):
    env = {"ok": False, "error_code": "hyperframes_not_installed",
           "message": "m", "action_url": "/settings#motion-graphics"}
    calls.reply["value"] = env
    assert await _call(mcp, "motion_compose", {"topic": "x"}) == env
    assert await _call(mcp, "motion_stage_asset", {"file_path": "/tmp/a.png"}) == env
    assert await _call(mcp, "motion_render", {}) == env


async def test_motion_misc_routes(mcp, calls):
    calls.reply["value"] = {}
    await _call(mcp, "motion_stage_asset", {"file_path": "/tmp/a.png"})
    assert calls[-1][:2] == ("POST_FILE", "/api/generate/motion/studio/assets")
    await _call(mcp, "motion_list_comps")
    assert calls[-1][:2] == ("GET", "/api/generate/motion/studio/comps")
    await _call(mcp, "motion_cleanup_comps", {"files": ["comp_ab12cd34.html"]})
    assert calls[-1] == ("POST", "/api/generate/motion/studio/comps/cleanup",
                         {"json": {"files": ["comp_ab12cd34.html"]}})
    await _call(mcp, "motion_cleanup_comps")
    assert calls[-1][2] == {"json": {"files": None}}
    await _call(mcp, "motion_sync_renders")
    assert calls[-1][:2] == ("POST", "/api/generate/motion/studio/sync-renders")
    await _call(mcp, "motion_submit_composition", {"html": "<html></html>", "title": "T"})
    assert calls[-1] == ("POST", "/api/generate/motion/studio/submit",
                         {"json": {"html": "<html></html>", "render": True,
                                   "aspect_ratio": "9:16", "title": "T"}})
    await _call(mcp, "motion_render", {"quality": "standard"})
    assert calls[-1] == ("POST", "/api/generate/motion/studio/export",
                         {"json": {"aspect_ratio": "9:16", "quality": "standard"}})
    await _raises(mcp, "motion_render", {"quality": "ultra"})
    await _raises(mcp, "motion_submit_composition", {"html": "  "})


# ── output ───────────────────────────────────────────────────────────────────

async def test_list_and_get_videos(mcp, calls):
    calls.reply["value"] = {"total": 0, "videos": []}
    await _call(mcp, "list_videos", {"source_type": "clip_extraction", "status": "ready"})
    assert calls[-1] == ("GET", "/api/videos",
                         {"params": {"limit": 20, "offset": 0, "status": "ready",
                                     "source_type": "clip_extraction"}})
    await _raises(mcp, "list_videos", {"limit": 101})
    await _call(mcp, "get_video", {"video_id": " v1 "})
    assert calls[-1][:2] == ("GET", "/api/videos/v1")


async def test_suggest_clips_body_fits_the_request_model(mcp, calls):
    await _call(mcp, "suggest_clips", {"downloaded_video_id": "v1", "max_clips": 4,
                                       "user_query": "pricing", "force_retranscribe": False})
    method, path, kw = calls[-1]
    assert (method, path) == ("POST", "/api/downloaded/v1/suggest-clips")
    assert kw["json"] == {"max_clips": 4, "user_query": "pricing", "force_retranscribe": False}
    from backend.api.downloaded import SuggestClipsRequest
    assert set(kw["json"]) <= set(SuggestClipsRequest.model_fields)


async def test_extract_viral_clips(mcp, calls):
    await _call(mcp, "extract_viral_clips", {"downloaded_video_id": "v1", "force_vertical": True,
                                             "allow_duration_fallback": False, "genre": "podcast"})
    method, path, kw = calls[-1]
    assert (method, path) == ("POST", "/api/downloaded/v1/extract-clips")
    assert kw["json"] == {"caption_style": "viral", "emoji_style": "moderate",
                          "whisper_quality": "balanced", "genre": "podcast",
                          "force_vertical": True, "allow_duration_fallback": False}
    from backend.api.downloaded import ExtractClipsRequest
    assert set(kw["json"]) <= set(ExtractClipsRequest.model_fields)


async def test_extract_manual_clips(mcp, calls):
    rng = [{"start": "0:10", "end": 20}]
    await _call(mcp, "extract_manual_clips", {"downloaded_video_id": "v1", "time_ranges": rng})
    method, path, kw = calls[-1]
    assert (method, path) == ("POST", "/api/downloaded/v1/extract-clips")
    assert kw["json"]["mode"] == "manual" and kw["json"]["time_ranges"] == rng
    from backend.api.downloaded import ExtractClipsRequest
    assert set(kw["json"]) <= set(ExtractClipsRequest.model_fields)
    await _raises(mcp, "extract_manual_clips", {"downloaded_video_id": "v1", "time_ranges": []})
    await _raises(mcp, "extract_manual_clips",
                  {"downloaded_video_id": "v1", "time_ranges": rng * 11})


async def test_export_video_default_path(mcp, calls):
    from backend.config import settings
    out = await _call(mcp, "export_video", {"video_id": "v1", "target_aspect": "1:1"})
    method, path, kw = calls[-1]
    assert (method, path) == ("STREAM_POST", "/api/videos/v1/export")
    assert kw["json_body"] == {"target_aspect": "1:1", "method": "auto"}
    expected = (settings.STORAGE_ROOT / "exports" / "v1_1x1.mp4").resolve()
    assert out["output_path"] == str(expected)


async def test_export_video_output_path_handling(mcp, calls, tmp_path):
    # A directory → default filename inside it.
    out = await _call(mcp, "export_video", {"video_id": "v1", "output_path": str(tmp_path)})
    assert out["output_path"] == str((tmp_path / "v1_16x9.mp4").resolve())
    # An existing file is not clobbered unless asked.
    existing = tmp_path / "keep.mp4"
    existing.write_bytes(b"user data")
    n = len(calls)
    await _raises(mcp, "export_video", {"video_id": "v1", "output_path": str(existing)})
    assert len(calls) == n
    await _call(mcp, "export_video",
                {"video_id": "v1", "output_path": str(existing), "overwrite": True})
    assert len(calls) == n + 1
    # Wrong suffix, bad aspect/method, path-like id.
    await _raises(mcp, "export_video", {"video_id": "v1", "output_path": str(tmp_path / "x.txt")})
    await _raises(mcp, "export_video", {"video_id": "v1", "target_aspect": "21:9"})
    await _raises(mcp, "export_video", {"video_id": "v1", "method": "stretch"})
    await _raises(mcp, "export_video", {"video_id": "../etc"})


# ── every called route exists on the OSS app ─────────────────────────────────

def test_every_tool_route_is_registered_on_the_app():
    from backend.main import app
    # The OpenAPI schema is the flattened view of every included router
    # (newer FastAPI wraps includes, so app.routes isn't flat).
    registered = {
        (method.upper(), path)
        for path, ops in app.openapi()["paths"].items()
        for method in ops
    }
    missing = [(name, m, p) for name, (m, p) in ROUTES.items() if (m, p) not in registered]
    assert not missing, f"tools call routes the app doesn't serve: {missing}"
