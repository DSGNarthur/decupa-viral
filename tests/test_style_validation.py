# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Writers refuse a caption style / emoji style / palette they can't render.

The renderers fall back silently — the ASS builder to "viral", the visualizer
to "sunset" — which is right at render time (never crash a job) and wrong at
the door: a typo, or a custom preset deleted since the page loaded, was
accepted and rendered as something the user never picked. Every route that
STORES or QUEUES one of these values now answers 400/422 instead.
"""
from __future__ import annotations

import asyncio
import io
import uuid

import pytest
from starlette.testclient import TestClient

from backend.main import create_app
from backend.messaging import manager as messaging_manager
from backend.services.caption_service import CAPTION_STYLES, style_id_known


@pytest.fixture(scope="module")
def custom_style_id():
    """A saved custom preset — valid on every str-typed caption route."""
    async def go():
        from backend.database import AsyncSessionLocal, init_db
        from backend.models.caption_style import CaptionStyle
        await init_db()
        sid = str(uuid.uuid4())
        async with AsyncSessionLocal() as db:
            db.add(CaptionStyle(id=sid, user_id="local", name="Mine", font="Arial",
                                primary_color="#FFFFFF", highlight_color="#FFFF00",
                                outline_color="#000000"))
            await db.commit()
        return sid
    return asyncio.run(go())


@pytest.fixture(scope="module")
def seeded_video(tmp_path_factory):
    media = tmp_path_factory.mktemp("media") / "src.mp4"
    media.write_bytes(b"\x00" * 2048)

    async def go():
        from backend.database import AsyncSessionLocal, init_db
        from backend.models.downloaded_video import DownloadedVideo
        await init_db()
        async with AsyncSessionLocal() as db:
            v = DownloadedVideo(user_id="local", title="src", platform="youtube",
                                video_path=str(media), duration_seconds=600,
                                transcript="hello world")
            db.add(v)
            await db.commit()
            return v.id
    return asyncio.run(go())


@pytest.fixture(scope="module")
def client():
    async def _noop(*a, **k):
        return None
    messaging_manager.messaging.start_all = _noop      # type: ignore[assignment]
    messaging_manager.messaging.stop_all = _noop       # type: ignore[assignment]
    with TestClient(create_app(), client=("127.0.0.1", 50000)) as c:
        yield c


@pytest.fixture(autouse=True)
def no_dispatch(monkeypatch):
    def fake_dispatch(coro, *a, **k):
        coro.close()
    monkeypatch.setattr("backend.core.task_runner.dispatch", fake_dispatch)


def _mp4():
    return {"file": ("in.mp4", io.BytesIO(b"\x00" * 4096), "video/mp4")}


# ── the helper ──────────────────────────────────────────────────────────────

def test_every_builtin_is_known():
    for sid in CAPTION_STYLES:
        assert asyncio.run(style_id_known(sid)), sid


def test_a_saved_custom_preset_is_known(custom_style_id):
    assert asyncio.run(style_id_known(custom_style_id))


@pytest.mark.parametrize("sid", ["", None, "viarl", "pop", str(uuid.uuid4())])
def test_unknown_ids_are_not(sid):
    assert not asyncio.run(style_id_known(sid))


def test_off_sentinels_only_where_asked():
    assert not asyncio.run(style_id_known("none"))
    assert asyncio.run(style_id_known("none", allow_off=True))


# ── the routes ──────────────────────────────────────────────────────────────

def test_stock_refuses_an_unknown_style(client):
    r = client.post("/api/generate/stock", json={"script": "Hello there.", "caption_style": "viarl"})
    assert r.status_code == 400 and "viarl" in r.json()["detail"]


def test_stock_ignores_the_style_when_captions_are_off(client):
    """A render with captions off never reads the style."""
    r = client.post("/api/generate/stock", json={
        "script": "Hello there.", "caption_enabled": False, "caption_style": "whatever"})
    assert r.status_code == 200, r.text


def test_stock_accepts_a_custom_preset(client, custom_style_id):
    r = client.post("/api/generate/stock", json={"script": "Hello there.",
                                                 "caption_style": custom_style_id})
    assert r.status_code == 200, r.text


def test_generate_from_downloaded_refuses_an_unknown_style(client, seeded_video):
    r = client.post(f"/api/downloaded/{seeded_video}/generate", json={"caption_style": "viarl"})
    assert r.status_code == 400


def test_batch_generate_refuses_an_unknown_style_anywhere(client, seeded_video):
    shared = client.post("/api/downloaded/batch-generate", json={
        "items": [{"downloaded_video_id": seeded_video}],
        "shared_settings": {"caption_style": "viarl"}})
    per_item = client.post("/api/downloaded/batch-generate", json={
        "items": [{"downloaded_video_id": seeded_video, "caption_style": "viarl"}]})
    assert shared.status_code == 400 and per_item.status_code == 400


def test_extract_clips_refuses_unknown_but_honours_none(client, seeded_video):
    bad = client.post(f"/api/downloaded/{seeded_video}/extract-clips",
                      json={"caption_style": "viarl"})
    assert bad.status_code == 400
    off = client.post(f"/api/downloaded/{seeded_video}/extract-clips",
                      json={"caption_style": "none"})
    assert off.status_code != 400 or "caption style" not in off.text.lower(), off.text


def test_settings_refuses_an_unknown_default_style(client, custom_style_id):
    assert client.post("/api/settings", json={"caption_style": "viarl"}).status_code == 400
    assert client.post("/api/settings", json={"caption_style": "bold"}).status_code == 200
    assert client.post("/api/settings", json={"caption_style": custom_style_id}).status_code == 200


def test_translate_refuses_unknown_caption_and_emoji_styles(client):
    form = {"target_language": "es"}
    bad_style = client.post("/api/tools/translate", data={**form, "caption_style": "viarl"}, files=_mp4())
    bad_emoji = client.post("/api/tools/translate", data={**form, "emoji_style": "lots"}, files=_mp4())
    assert bad_style.status_code == 400
    assert bad_emoji.status_code == 422


def test_translate_accepts_a_custom_preset(client, custom_style_id):
    r = client.post("/api/tools/translate",
                    data={"target_language": "es", "caption_style": custom_style_id}, files=_mp4())
    assert r.status_code == 200, r.text


def test_visualizer_refuses_an_unknown_palette(client):
    audio = {"file": ("a.mp3", io.BytesIO(b"\x00" * 4096), "audio/mpeg")}
    assert client.post("/api/tools/music-visualizer", data={"palette": "rainbow"},
                       files=audio).status_code == 422


def test_visualizer_palettes_are_the_runners_own():
    import typing
    from backend.api.tools import VizPalette
    from backend.core.tool_runners import _VIZ_PALETTES
    assert set(typing.get_args(VizPalette)) == set(_VIZ_PALETTES)


def test_a_db_failure_never_reports_a_real_preset_as_unknown(monkeypatch):
    """Refusing a valid preset with "unknown style" because the lookup itself
    failed would send the user after the wrong cause."""
    import backend.database as database

    class _Broken:
        async def __aenter__(self):
            raise RuntimeError("database is locked")

        async def __aexit__(self, *a):
            return False

    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: _Broken())
    assert asyncio.run(style_id_known("some-saved-preset-id"))
