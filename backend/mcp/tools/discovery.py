# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Discovery tools — enumerate the values other tools take as arguments.

Several tools take ids the model would otherwise have to guess — a caption
style, a TTS voice id — and a guessed value fails the whole job. These tools
list the real vocabulary, plus what is already in the user's Library.

All read-only and local. Registered LAST so they sit after the workflow tools
in tools/list; an LLM scanning the surface should meet the doing-tools first.
"""
from __future__ import annotations

from typing import Literal, Optional

from fastmcp import FastMCP

from backend.mcp import client


def searchable_text(entry: dict) -> str:
    """Lowercased haystack for the `search` filters — every scalar value in the
    row joined together, so a match on id, display name, category or locale all
    work without the caller having to know which field holds what."""
    return " ".join(
        str(v).lower() for v in (entry or {}).values() if isinstance(v, (str, int, float))
    )


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    async def list_caption_styles() -> dict:
        """List the caption styles the captioning tools accept.

        Use it to pick a style instead of guessing one. Pass a built-in
        style's `id` as `style` to tool_captions or `caption_style` to
        tool_translate.

        Returns:
            {"builtin": [{"id": "viral", "name": "Viral", "description": …,
                          "font": …, …}, …],
             "custom":  [{"id": …, "name": …, …}, …]}
            Read the ids rather than assuming the list. Custom styles are
            the user's own presets and are not accepted by tool_captions /
            tool_translate.
        """
        return await client.get("/api/captions/styles")

    @mcp.tool()
    async def list_tts_voices(
        provider: Literal["edge_tts", "openai_tts"] = "edge_tts",
        locale: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 30,
    ) -> dict:
        """List the voice ids a text-to-speech provider accepts.

        tool_voiceover and tool_translate (full_dub) take a `voice_id`, and
        Edge TTS alone ships 300+ voices across 100+ languages — an invented
        id fails the job. Call this first whenever the user asks for a
        specific language, gender or accent.

        FILTER, don't dump: the unfiltered Edge list is tens of thousands of
        characters. Pass `locale` (or `search`) to get the few you need.

        Args:
            provider: "edge_tts" (free, local, 300+ voices) or "openai_tts"
                (six voices; runs on the user's own OpenAI key).
            locale: BCP-47 prefix match, case-insensitive — "ja", "es-MX",
                "en-GB". The most useful filter (Edge voices only carry a
                locale).
            search: Substring match over the voice id, name and category,
                e.g. "female", "multilingual", "Xiaoxiao".
            limit: Max voices to return, 1-100 (default 30).

        Returns:
            {"provider": str, "voices": [{"voice_id": "ja-JP-NanamiNeural",
             "name": …, "category": "Female", "locale": "ja-JP"}, …],
             "total_matching": int, "returned": int, "truncated": bool}
            Pass a `voice_id` verbatim.
        """
        data = await client.get(f"/api/config/voices/{provider}")
        voices = data.get("voices") or []

        if locale:
            want = str(locale).strip().lower()
            voices = [v for v in voices
                      if str(v.get("locale") or "").lower().startswith(want)]
        if search:
            needle = str(search).strip().lower()
            voices = [v for v in voices if needle in searchable_text(v)]

        limit = max(1, min(int(limit or 30), 100))
        total = len(voices)
        return {
            "provider": data.get("provider", provider),
            "voices": voices[:limit],
            "total_matching": total,
            "returned": min(total, limit),
            "truncated": total > limit,
        }

    @mcp.tool()
    async def list_library_items(
        media: Optional[str] = None,
        origin: Optional[str] = None,
        producer: Optional[str] = None,
        q: Optional[str] = None,
        sort: Literal["newest", "oldest", "longest", "title"] = "newest",
        limit: int = 25,
        offset: int = 0,
    ) -> dict:
        """List what is in the user's Library — videos, audio, images, files.

        One view over generated videos, downloads/imports, tool outputs and
        music tracks. Use it to answer "what have I made" or to find an
        existing result instead of re-running a tool. Rows whose file is gone
        are left out.

        Args:
            media: Comma-separated filter over what a file is: "video",
                "image", "audio", "doc" (transcripts, subtitles, JSON).
            origin: Comma-separated filter over where it came from:
                "created" (made from a script/prompt), "edited" (a tool or
                clip cut applied to something), "imported" (downloads and
                uploads).
            producer: Comma-separated producer keys, e.g. "tool:captions",
                "clip_extraction", "download".
            q: Substring match on title / tool / niche.
            sort: "newest" (default) / "oldest" / "longest" / "title".
            limit: Max rows, 1-200 (default 25).
            offset: Pagination offset, >= 0.

        Returns:
            {"items": [{"key", "source", "id", "media", "origin",
                        "producer_key", "producer", "title", "stream_url",
                        "duration_seconds", "size_mb", "ext", "parent_key",
                        "created_at", …}, …],
             "total": int, "limit": int, "offset": int, "facets": {…},
             "library_total": int}
            `key` is store-prefixed: "gv:<id>" a generated video (use the id
            with get_video), "dl:<id>" a download/import (list_downloaded),
            "job:<id>" a job's output (the id is a job id; for a "tool:*"
            producer, tool_download_result fetches it), "trk:<name>" a music
            track.
        """
        params: dict = {
            "sort": sort,
            "limit": max(1, min(int(limit or 25), 200)),
            "offset": max(0, int(offset or 0)),
        }
        for name, value in (("media", media), ("origin", origin),
                            ("producer", producer), ("q", q)):
            if value:
                params[name] = value
        return await client.get("/api/library/items", params=params)
