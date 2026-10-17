# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""MCP single-purpose tools + discovery tools.

The tools wrap multipart /api/tools/* endpoints over loopback HTTP. FastAPI
ignores form fields an endpoint doesn't declare, so a misnamed field is an
option the agent believes it set and never did — the request still returns a
job_id. The drift tests here hold every tool to the LIVE route: each field it
sends must be declared there, each file part must be a File param, and every
Literal value it can send must be one the endpoint accepts.

No network, no AI: the loopback client is stubbed.
"""
from __future__ import annotations

import typing
from pathlib import Path

import pytest
from fastmcp import FastMCP

from backend.mcp import client as mcp_client
from backend.mcp.tools import discovery, tools as tools_module
from backend.mcp.tools.discovery import searchable_text


# ── fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def mcp():
    m = FastMCP("test")
    tools_module.register(m)
    discovery.register(m)
    return m


class Recorder:
    """Captures every loopback call the tools make."""

    def __init__(self, get_responses: dict | None = None):
        self.calls: list[dict] = []
        self.get_responses = get_responses or {}

    async def post_file(self, path, file_path, *, file_field="file", form=None,
                        extra_files=None, timeout=600.0):
        p = Path(file_path).expanduser().resolve()
        if not p.is_file():
            raise FileNotFoundError(f"File not found: {p}")
        files = [file_field] + list((extra_files or {}).keys())
        self.calls.append({"method": "POST", "path": path, "form": dict(form or {}),
                           "files": files})
        return {"job_id": "job-1"}

    async def post(self, path, **kw):
        files = [f[0] for f in kw.get("files") or []]
        self.calls.append({"method": "POST", "path": path,
                           "form": dict(kw.get("data") or {}),
                           "json": kw.get("json"), "files": files})
        return {"job_id": "job-1"}

    async def get(self, path, **kw):
        self.calls.append({"method": "GET", "path": path, "params": kw.get("params")})
        for prefix, payload in self.get_responses.items():
            if path.startswith(prefix):
                return payload
        raise AssertionError(f"unexpected GET {path}")

    async def stream_to_file(self, method, path, output_path, **kw):
        self.calls.append({"method": method, "path": path, "output_path": output_path})
        return {"output_path": output_path, "size_bytes": 1, "content_type": "x"}


@pytest.fixture
def rec(monkeypatch):
    r = Recorder()
    for name in ("post_file", "post", "get", "stream_to_file"):
        monkeypatch.setattr(mcp_client, name, getattr(r, name))
    return r


@pytest.fixture
def media(tmp_path):
    files = {}
    for name in ("in.mp4", "b.mp4", "c.mp4", "logo.png", "song.mp3"):
        p = tmp_path / name
        p.write_bytes(b"\x00" * 16)
        files[name] = str(p)
    return files


async def _call(mcp, name, **kwargs):
    tool = await mcp.get_tool(name)
    assert tool is not None, f"{name} not registered"
    return await tool.fn(**kwargs)


# ── the surface ─────────────────────────────────────────────────────────────

FILE_TOOLS = {
    "tool_captions", "tool_reframe", "tool_audio_enhance", "tool_watermark",
    "tool_remove_silence", "tool_translate", "tool_hook_analysis",
    "tool_voiceover", "tool_metadata", "tool_auto_chapters", "tool_gif",
    "tool_speed", "tool_trim", "tool_subtitles", "tool_transcript",
    "tool_auto_zoom", "tool_compress", "tool_crop", "tool_transform",
    "tool_music_visualizer", "tool_merge_clips", "tool_download_result",
}
DISCOVERY_TOOLS = {"list_caption_styles", "list_tts_voices", "list_library_items"}


async def test_registered_surface_is_exact(mcp):
    names = {t.name for t in await mcp.list_tools()}
    assert names == FILE_TOOLS | DISCOVERY_TOOLS


async def test_docstrings_carry_no_money_or_hosted_only_references(mcp):
    import re
    banned = (r"\bcents?\b", r"\$", r"\bbalance\b", r"\bbill", r"\bcredits?\b",
              r"top.?up", r"\bcharged?\b", r"\bcosts?\b", r"\bpaid\b", "openrouter",
              "run_tool_on_asset", "tool_chain", "list_music_library", "gemini",
              "brand kit", "library-native")
    for t in await mcp.list_tools():
        text = (t.description or "").lower()
        for pattern in banned:
            assert not re.search(pattern, text), f"{t.name} description matches {pattern!r}"


# ── drift against the live FastAPI routes ───────────────────────────────────

def _iter_routes(routes):
    """Flatten the app's routes. Newer FastAPI keeps included routers lazily
    (`_IncludedRouter`) and exposes the prefixed routes via
    `effective_route_contexts()`; older versions list APIRoutes directly."""
    for r in routes:
        contexts = getattr(r, "effective_route_contexts", None)
        if callable(contexts):
            yield from contexts()
        else:
            yield r


def _route(method: str, path: str):
    """The live route (with its `dependant`) for METHOD path on the real app."""
    from backend.main import app
    for r in _iter_routes(app.routes):
        if getattr(r, "path", None) == path and method in (getattr(r, "methods", None) or ()):
            return r
    return None


def _body_params(route) -> dict:
    """{field name: (is_file, annotation)} for the route's Form/File params."""
    from fastapi.params import File as FileParam
    out = {}
    for f in route.dependant.body_params:
        info = f.field_info
        out[f.alias] = (isinstance(info, FileParam), info.annotation)
    return out


def _literal_values(annotation) -> set | None:
    """Allowed values of a Literal (unwrapping Optional); None if not a Literal."""
    if typing.get_origin(annotation) is typing.Literal:
        return set(typing.get_args(annotation))
    for arg in typing.get_args(annotation) or ():
        vals = _literal_values(arg)
        if vals is not None:
            return vals
    return None


def _calls_for(media):
    """One representative invocation per write tool, plus option variants."""
    m = media
    return [
        ("tool_captions", {"file_path": m["in.mp4"]}),
        ("tool_reframe", {"file_path": m["in.mp4"]}),
        ("tool_audio_enhance", {"file_path": m["song.mp3"]}),
        ("tool_watermark", {"file_path": m["in.mp4"], "logo_path": m["logo.png"]}),
        ("tool_remove_silence", {"file_path": m["in.mp4"]}),
        ("tool_translate", {"file_path": m["in.mp4"], "target_language": "es",
                            "mode": "full_dub", "voice_id": "es-ES-ElviraNeural"}),
        ("tool_hook_analysis", {"file_path": m["in.mp4"]}),
        ("tool_voiceover", {"text": "hello", "voice_id": "en-US-AvaNeural"}),
        ("tool_voiceover", {"text": "hello", "video_path": m["in.mp4"]}),
        ("tool_metadata", {"topic": "AI startups"}),
        ("tool_metadata", {"file_path": m["in.mp4"]}),
        ("tool_auto_chapters", {"file_path": m["in.mp4"], "target_count": 5}),
        ("tool_gif", {"file_path": m["in.mp4"], "start_seconds": 1, "duration_seconds": 5}),
        ("tool_speed", {"file_path": m["in.mp4"], "speed": 2.0, "keep_pitch": False}),
        ("tool_trim", {"file_path": m["in.mp4"], "start_seconds": 1, "end_seconds": 4}),
        ("tool_subtitles", {"file_path": m["in.mp4"], "format": "vtt"}),
        ("tool_transcript", {"url": "https://youtu.be/x", "language": "en"}),
        ("tool_auto_zoom", {"file_path": m["in.mp4"]}),
        ("tool_compress", {"file_path": m["in.mp4"], "resolution": "854x480"}),
        ("tool_crop", {"file_path": m["in.mp4"], "x": 0.2, "y": 0, "w": 0.5, "h": 1}),
        ("tool_transform", {"file_path": m["in.mp4"], "operation": "loop", "amount": "3"}),
        ("tool_music_visualizer", {"file_path": m["song.mp3"], "palette": "neon"}),
        ("tool_merge_clips", {"file_paths": [m["in.mp4"], m["b.mp4"], m["c.mp4"]],
                              "transition": "crossfade"}),
    ]


async def test_every_sent_field_is_declared_by_the_endpoint(mcp, rec, media):
    for name, kwargs in _calls_for(media):
        rec.calls.clear()
        assert await _call(mcp, name, **kwargs) == {"job_id": "job-1"}
        assert len(rec.calls) == 1, name
        call = rec.calls[0]
        route = _route(call["method"], call["path"])
        assert route is not None, f"{name}: no route {call['method']} {call['path']}"
        declared = _body_params(route)
        for field, value in call["form"].items():
            assert field in declared, f"{name}: sends {field!r}, endpoint ignores it"
            is_file, annotation = declared[field]
            assert not is_file, f"{name}: {field!r} is a File param, sent as form"
            allowed = _literal_values(annotation)
            if allowed is not None:
                assert value in allowed, f"{name}: {field}={value!r} not in {allowed}"
        for field in call["files"]:
            assert field in declared and declared[field][0], (
                f"{name}: file part {field!r} is not a File param on the endpoint")


async def test_literal_options_are_a_subset_of_the_endpoint(mcp, rec, media):
    """Every value a tool's Literal parameter offers must be accepted by the
    endpoint field of the same name — an offered value the route 422s is a lie
    in the schema."""
    pairs = {
        "tool_captions": ("/api/tools/captions", {"style": "style", "emoji_style": "emoji_style"}),
        "tool_watermark": ("/api/tools/watermark", {"position": "position"}),
        "tool_translate": ("/api/tools/translate", {"mode": "mode"}),
        "tool_subtitles": ("/api/tools/subtitles", {"format": "format"}),
        "tool_transcript": ("/api/tools/transcript", {"format": "format"}),
        "tool_compress": ("/api/tools/compress", {"resolution": "resolution", "level": "level"}),
        "tool_transform": ("/api/tools/transform", {"operation": "operation"}),
        "tool_music_visualizer": ("/api/tools/music-visualizer",
                                  {"style": "style", "aspect": "aspect"}),
        "tool_merge_clips": ("/api/tools/merge-clips",
                             {"target_aspect": "target_aspect", "transition": "transition"}),
    }
    for name, (path, mapping) in pairs.items():
        tool = await mcp.get_tool(name)
        props = tool.parameters["properties"]
        declared = _body_params(_route("POST", path))
        for tool_arg, field in mapping.items():
            offered = set(props[tool_arg].get("enum") or [])
            assert offered, f"{name}.{tool_arg} is not an enum"
            accepted = _literal_values(declared[field][1])
            assert offered <= accepted, f"{name}.{tool_arg}: {offered - accepted}"


async def test_visualizer_palette_enum_matches_the_runner(mcp):
    """`palette` is a plain str on the endpoint (an unknown value silently
    becomes "sunset"), so the enum is pinned to the runner's palette table."""
    from backend.core.tool_runners import _VIZ_PALETTES
    tool = await mcp.get_tool("tool_music_visualizer")
    assert set(tool.parameters["properties"]["palette"]["enum"]) == set(_VIZ_PALETTES)


async def test_caption_style_enum_is_the_engine_vocabulary(mcp):
    from backend.services.caption_service import CAPTION_STYLES
    expected = {k for k in CAPTION_STYLES if k != "brainrot"}
    for name, arg in (("tool_captions", "style"), ("tool_translate", "caption_style")):
        tool = await mcp.get_tool(name)
        assert set(tool.parameters["properties"][arg]["enum"]) == expected


async def test_download_route_exists():
    assert _route("GET", "/api/tools/download/{job_id}") is not None
    assert _route("GET", "/api/tools/download-meta/{job_id}") is not None


async def test_discovery_routes_exist():
    assert _route("GET", "/api/captions/styles") is not None
    assert _route("GET", "/api/config/voices/{provider}") is not None
    assert _route("GET", "/api/library/items") is not None


async def test_library_items_params_are_declared_query_params(mcp, rec):
    rec.get_responses = {"/api/library/items": {"items": []}}
    await _call(mcp, "list_library_items", media="video", origin="edited",
                producer="tool:captions", q="cat", sort="oldest", limit=999, offset=-3)
    params = rec.calls[-1]["params"]
    route = _route("GET", "/api/library/items")
    declared = {p.alias for p in route.dependant.query_params}
    assert set(params) <= declared
    assert params["limit"] == 200 and params["offset"] == 0


# ── per-tool behaviour ──────────────────────────────────────────────────────

async def test_watermark_requires_logo_and_bounds(mcp, rec, media):
    with pytest.raises(TypeError):
        await _call(mcp, "tool_watermark", file_path=media["in.mp4"])
    for bad in ({"opacity": 0.0}, {"opacity": 1.5}, {"size_pct": 1.0}, {"size_pct": 41.0}):
        with pytest.raises(ValueError):
            await _call(mcp, "tool_watermark", file_path=media["in.mp4"],
                        logo_path=media["logo.png"], **bad)
    assert not rec.calls


async def test_missing_local_file_fails_before_sending(mcp, rec, tmp_path):
    with pytest.raises(FileNotFoundError):
        await _call(mcp, "tool_captions", file_path=str(tmp_path / "nope.mp4"))
    with pytest.raises(FileNotFoundError):
        await _call(mcp, "tool_merge_clips",
                    file_paths=[str(tmp_path / "a.mp4"), str(tmp_path / "b.mp4")])


async def test_merge_clips_sends_repeated_files_field_in_order(mcp, rec, media):
    order = [media["c.mp4"], media["in.mp4"]]
    await _call(mcp, "tool_merge_clips", file_paths=order)
    call = rec.calls[-1]
    assert call["path"] == "/api/tools/merge-clips"
    assert call["files"] == ["files", "files"]
    with pytest.raises(ValueError):
        await _call(mcp, "tool_merge_clips", file_paths=[media["in.mp4"]])
    with pytest.raises(ValueError):
        await _call(mcp, "tool_merge_clips", file_paths=[media["in.mp4"]] * 11)


@pytest.mark.parametrize("name,kwargs", [
    ("tool_gif", {"fps": 4}),
    ("tool_gif", {"width": 2000}),
    ("tool_gif", {"duration_seconds": 61}),
    ("tool_gif", {"start_seconds": float("nan")}),
    ("tool_speed", {"speed": 1.0}),
    ("tool_speed", {"speed": 5.0}),
    ("tool_trim", {"start_seconds": 2, "end_seconds": 2.2}),
    ("tool_trim", {"start_seconds": float("nan"), "end_seconds": 3}),
    ("tool_trim", {"start_seconds": 0, "end_seconds": float("nan")}),
    ("tool_auto_zoom", {"zoom_factor": 2.0}),
    ("tool_auto_zoom", {"words_per_group": 7}),
    ("tool_auto_chapters", {"target_count": 21}),
    ("tool_crop", {"x": 0, "y": 0, "w": 0, "h": 1}),
    ("tool_crop", {"x": 1.2, "y": 0, "w": 0.5, "h": 1}),
])
async def test_out_of_range_args_rejected_locally(mcp, rec, media, name, kwargs):
    base = {"file_path": media["in.mp4"]}
    if name == "tool_trim":
        base.update({"start_seconds": 0, "end_seconds": 5})
    with pytest.raises(ValueError):
        await _call(mcp, name, **{**base, **kwargs})
    assert not rec.calls


async def test_text_inputs_validated(mcp, rec):
    with pytest.raises(ValueError):
        await _call(mcp, "tool_voiceover", text="   ")
    with pytest.raises(ValueError):
        await _call(mcp, "tool_voiceover", text="x" * 10_001)
    with pytest.raises(ValueError):
        await _call(mcp, "tool_metadata")
    with pytest.raises(ValueError):
        await _call(mcp, "tool_transcript", url="ftp://x")
    with pytest.raises(ValueError):
        await _call(mcp, "tool_transcript", url="https://x", language="eng")
    assert not rec.calls


async def test_voiceover_without_video_posts_form_only(mcp, rec):
    await _call(mcp, "tool_voiceover", text=" hi ", provider="openai_tts")
    call = rec.calls[-1]
    assert call["path"] == "/api/tools/voiceover"
    assert call["form"] == {"text": "hi", "provider": "openai_tts"}
    assert call["files"] == []


async def test_voiceover_with_video_uses_video_part(mcp, rec, media):
    await _call(mcp, "tool_voiceover", text="hi", video_path=media["in.mp4"])
    assert rec.calls[-1]["files"] == ["video"]


async def test_download_result_names_file_by_real_extension(mcp, rec):
    rec.get_responses = {"/api/tools/download-meta/": {"ready": True, "ext": ".gif"}}
    out = await _call(mcp, "tool_download_result", job_id="abc")
    assert out["output_path"].endswith("tools-out/abc.gif")
    assert rec.calls[-1]["path"] == "/api/tools/download/abc"


async def test_download_result_not_ready_raises(mcp, rec):
    rec.get_responses = {"/api/tools/download-meta/": {"ready": False, "status": "running"}}
    with pytest.raises(ValueError, match="running"):
        await _call(mcp, "tool_download_result", job_id="abc")


async def test_download_result_explicit_path_skips_meta(mcp, rec, tmp_path):
    dest = str(tmp_path / "x.mp4")
    out = await _call(mcp, "tool_download_result", job_id="abc", output_path=dest)
    assert out["output_path"] == dest
    assert [c["method"] for c in rec.calls] == ["GET"]
    assert rec.calls[0]["path"] == "/api/tools/download/abc"


# ── discovery ───────────────────────────────────────────────────────────────

VOICES = {"provider": "edge_tts", "voices": [
    {"voice_id": "ja-JP-NanamiNeural", "name": "Nanami", "category": "Female", "locale": "ja-JP"},
    {"voice_id": "ja-JP-KeitaNeural", "name": "Keita", "category": "Male", "locale": "ja-JP"},
    {"voice_id": "en-AU-WilliamMultilingualNeural", "name": "William",
     "category": "Male", "locale": "en-AU"},
    {"voice_id": "es-MX-DaliaNeural", "name": "Dalia", "category": "Female", "locale": "es-MX"},
]}


async def test_list_tts_voices_filters_and_truncates(mcp, rec):
    rec.get_responses = {"/api/config/voices/": VOICES}
    out = await _call(mcp, "list_tts_voices", locale="JA")
    assert [v["voice_id"] for v in out["voices"]] == ["ja-JP-NanamiNeural", "ja-JP-KeitaNeural"]
    out = await _call(mcp, "list_tts_voices", search="multilingual")
    assert out["total_matching"] == 1
    out = await _call(mcp, "list_tts_voices", limit=1)
    assert out["returned"] == 1 and out["truncated"] and out["total_matching"] == 4
    assert rec.calls[-1]["path"] == "/api/config/voices/edge_tts"


async def test_list_tts_voices_provider_enum_matches_engine(mcp):
    from backend.services.tts_service import TTSProvider
    tool = await mcp.get_tool("list_tts_voices")
    assert set(tool.parameters["properties"]["provider"]["enum"]) == {p.value for p in TTSProvider}
    vo = await mcp.get_tool("tool_voiceover")
    assert set(vo.parameters["properties"]["provider"]["enum"]) == {p.value for p in TTSProvider}


async def test_list_caption_styles_passthrough(mcp, rec):
    rec.get_responses = {"/api/captions/styles": {"builtin": [{"id": "viral"}], "custom": []}}
    out = await _call(mcp, "list_caption_styles")
    assert out["builtin"][0]["id"] == "viral"


def test_searchable_text_joins_scalars():
    assert searchable_text({"a": "Foo", "b": 3, "c": None, "d": ["x"]}) == "foo 3"


# ── tool_download_result never clobbers ─────────────────────────────────────

def _download_tool():
    import asyncio
    from fastmcp import FastMCP
    from backend.mcp.tools import tools as tools_module
    mcp = FastMCP("t")
    tools_module.register(mcp)
    return asyncio.run(mcp.get_tool("tool_download_result")).fn


def test_download_result_refuses_an_existing_file(tmp_path, monkeypatch):
    import asyncio
    from backend.mcp import client
    called = []
    monkeypatch.setattr(client, "stream_to_file", lambda *a, **k: called.append(k))
    existing = tmp_path / "keep.mp4"
    existing.write_bytes(b"precious")
    fn = _download_tool()
    with pytest.raises(ValueError, match="already exists"):
        asyncio.run(fn(job_id="abc123", output_path=str(existing)))
    assert existing.read_bytes() == b"precious" and not called


def test_download_result_rejects_a_path_shaped_job_id():
    import asyncio
    fn = _download_tool()
    with pytest.raises(ValueError, match="Invalid job_id"):
        asyncio.run(fn(job_id="../../etc/x"))
