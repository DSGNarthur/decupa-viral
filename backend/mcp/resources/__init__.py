# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""MCP resources — read-only data an MCP client can pull for grounding.

  viralmint://recent_videos      — last 10 generated videos
  viralmint://connected_channels — YouTube / TikTok channels the user linked
  viralmint://niches             — niches the user has scouted / generated
                                   in, ranked by recency × frequency
  viralmint://downloaded/{downloaded_video_id}/transcript
                                 — full Whisper transcript of one download

Unlike the tools, these read the local DB directly: they are pure reads with
no side effects, so there is no middleware for a loopback call to reuse. A
failure to load returns a JSON error envelope instead of raising, so one bad
source never breaks the resources surface.
"""
from __future__ import annotations

import json
import logging
from collections import Counter

from fastmcp import FastMCP

logger = logging.getLogger(__name__)


def _err(msg: str) -> str:
    """Wrap an error into a stable JSON envelope so the LLM sees
    structured data instead of an exception trace."""
    return json.dumps({"ok": False, "error": msg})


def register(mcp: FastMCP) -> None:
    @mcp.resource(
        "viralmint://recent_videos",
        name="Recent generated videos",
        description="Last 10 generated videos (Smart / AI / clip-extraction), JSON.",
        mime_type="application/json",
    )
    async def recent_videos_resource() -> str:
        """Lightweight projection — Claude doesn't need the full row,
        just enough to ground recommendations ('you've been making
        cooking shorts; want to extend that?')."""
        try:
            from sqlalchemy import select, desc
            from backend.database import AsyncSessionLocal
            from backend.models.generated_video import GeneratedVideo

            async with AsyncSessionLocal() as db:
                rows = (await db.execute(
                    select(GeneratedVideo)
                    .where(GeneratedVideo.user_id == "local")
                    .order_by(desc(GeneratedVideo.created_at))
                    .limit(10)
                )).scalars().all()
            videos = [
                {
                    "id": r.id,
                    "title": r.title,
                    "status": r.status,
                    "duration_seconds": r.duration_seconds,
                    "aspect_ratio": r.aspect_ratio,
                    "gen_tier": r.gen_tier,
                    "source_type": r.source_type,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
            return json.dumps({"ok": True, "count": len(videos), "videos": videos})
        except Exception as e:
            logger.warning("recent_videos resource failed: %s", e)
            return _err(f"recent_videos unavailable: {e}")

    @mcp.resource(
        "viralmint://connected_channels",
        name="Connected channels",
        description="YouTube / TikTok channels linked through the desktop UI.",
        mime_type="application/json",
    )
    async def connected_channels_resource() -> str:
        """Lets Claude reference the user's own channel(s) — analyze
        my recent uploads, suggest follow-ups, etc."""
        try:
            from sqlalchemy import select
            from backend.database import AsyncSessionLocal
            from backend.models.connected_channel import ConnectedChannel

            async with AsyncSessionLocal() as db:
                rows = (await db.execute(
                    select(ConnectedChannel)
                    .where(ConnectedChannel.user_id == "local")
                )).scalars().all()
            channels = [
                {
                    "id": r.id,
                    "platform": r.platform,
                    # Model field is channel_name; keep the resource
                    # JSON key as "channel_title" so the LLM contract
                    # stays stable (and matches what task_runner emits
                    # in scout/analyze events).
                    "channel_title": r.channel_name,
                    "channel_url": r.channel_url,
                    "subscriber_count": r.subscriber_count,
                    "video_count": r.video_count,
                }
                for r in rows
            ]
            return json.dumps({"ok": True, "count": len(channels), "channels": channels})
        except Exception as e:
            logger.warning("connected_channels resource failed: %s", e)
            return _err(f"connected_channels unavailable: {e}")

    @mcp.resource(
        "viralmint://niches",
        name="Recent niches",
        description="Niches the user has scouted or generated in, ranked by recency × frequency.",
        mime_type="application/json",
    )
    async def niches_resource() -> str:
        """Synthetic — derived from scout_results.niche + downloaded_videos.
        Gives Claude a "the user works on X" signal without making it
        guess from video titles."""
        try:
            from sqlalchemy import select, desc
            from backend.database import AsyncSessionLocal
            from backend.models.scout_result import ScoutResult
            from backend.models.generated_video import GeneratedVideo

            async with AsyncSessionLocal() as db:
                scouted = (await db.execute(
                    select(ScoutResult.niche)
                    .where(ScoutResult.user_id == "local")
                    .where(ScoutResult.niche.isnot(None))
                    .order_by(desc(ScoutResult.created_at))
                    .limit(100)
                )).scalars().all()
                generated = (await db.execute(
                    select(GeneratedVideo.niche)
                    .where(GeneratedVideo.user_id == "local")
                    .where(GeneratedVideo.niche.isnot(None))
                    .order_by(desc(GeneratedVideo.created_at))
                    .limit(100)
                )).scalars().all()

            # Weight scouted=1, generated=3 — actually producing in a
            # niche is a stronger signal than just looking around in
            # it. Cap at top 10 to keep payload small.
            counts: Counter[str] = Counter()
            for n in scouted:
                if n:
                    counts[n.strip().lower()] += 1
            for n in generated:
                if n:
                    counts[n.strip().lower()] += 3
            ranked = counts.most_common(10)
            niches = [{"niche": n, "score": s} for n, s in ranked]
            return json.dumps({"ok": True, "count": len(niches), "niches": niches})
        except Exception as e:
            logger.warning("niches resource failed: %s", e)
            return _err(f"niches unavailable: {e}")

    @mcp.resource(
        "viralmint://downloaded/{downloaded_video_id}/transcript",
        name="Downloaded video transcript",
        description=(
            "Full Whisper transcript of a downloaded video by id. "
            "Use when a tool's truncated inline transcript isn't enough."
        ),
        mime_type="text/plain",
    )
    async def transcript_resource(downloaded_video_id: str) -> str:
        """Pure read — fetches the transcript text from the downloaded
        row. Returns plain text (not JSON) because the consumer is
        usually pasting it into a prompt; JSON-wrapping it just makes
        the LLM strip quotes.

        Missing/unknown id returns an empty string rather than a 404 —
        fastmcp surfaces the error to the LLM as a tool error which
        reads worse than "transcript not available for this id".
        """
        try:
            from sqlalchemy import select
            from backend.database import AsyncSessionLocal
            from backend.models.downloaded_video import DownloadedVideo

            async with AsyncSessionLocal() as db:
                row = (await db.execute(
                    select(DownloadedVideo)
                    .where(DownloadedVideo.id == downloaded_video_id)
                    .where(DownloadedVideo.user_id == "local")
                )).scalar_one_or_none()
            if not row:
                return f"(no downloaded video with id {downloaded_video_id})"
            return row.transcript or "(transcript not available — "\
                "the analyze job may not have completed Whisper yet)"
        except Exception as e:
            logger.warning("transcript resource failed: %s", e)
            return f"(error loading transcript: {e})"
