# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Macro tools — workflow shortcuts that compose several primitives.

Each macro does in one call what an MCP client would otherwise drive as a
chain (start job → poll → read → filter). The win is fewer tokens and no
chain for the model to remember.

They are synchronous: the scout/analyze macros block the MCP request for the
duration of the underlying job (30s to a few minutes). That's acceptable for
streamable HTTP and spares the model a polling loop.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastmcp import FastMCP

from backend.mcp import client
from backend.mcp.tools.research import (
    DEFAULT_SCOUT_PLATFORMS,
    _validate_platforms,
    platform_coverage,
)
from backend.mcp.wait import wait_for_job_terminal as _wait_for_job_internal

logger = logging.getLogger(__name__)

# Inline transcript cap for analyze_competitor (~500 tokens). A 5-minute
# transcript runs 10-30KB, which eats the model's context for little gain —
# the AI insights already summarize it.
TRANSCRIPT_INLINE_CAP = 2000


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    async def find_breakouts(
        niche: str,
        threshold: float = 50.0,
        platforms: Optional[list[str]] = None,
        timeout_seconds: int = 120,
    ) -> dict:
        """Scout a niche and return ONLY the videos above a virality-score threshold.

        Composes scout_trending → wait_for_job → list_scout_results and filters
        on virality_score, so the model doesn't have to read and filter a
        50-row list. This is the entry point for "find me the best / most
        viral videos about X".

        virality_score (0-100) blends engagement rate, views per hour,
        recency, total views and likes.

        Args:
            niche: Search query (at least 2 characters).
            threshold: Minimum virality_score, 0-100. Default 50 keeps the
                strong performers; raise to 70+ for only the standouts, lower
                it when matched_count comes back 0.
            platforms: Subset of ["youtube", "tiktok", "douyin"]. Default
                ["youtube"]. Each needs its key/cookie configured in Settings.
            timeout_seconds: Max wait for the scout job (default 120).

        Returns:
            {
              "scout_job_id": str,
              "total_scouted": int,
              "matched_count": int,
              "threshold": float,
              "platforms_requested": [str], "platforms_used": [str],
              "platforms_missing": [str],   // 0 rows — usually no key/cookie
              "results": [<scout result rows above threshold, best first>]
            }

        Raises:
            TimeoutError: the scout didn't finish within timeout_seconds (it
                keeps running — read it later with list_scout_results).
        """
        if len((niche or "").strip()) < 2:
            raise ValueError("niche must be at least 2 characters")
        requested = _validate_platforms(platforms) or list(DEFAULT_SCOUT_PLATFORMS)
        scout_resp = await client.post(
            "/api/scout/start",
            json={"niche": niche.strip(), "platforms": requested},
        )
        job_id = scout_resp["job_id"]
        await _wait_for_job_internal(job_id, timeout_seconds=timeout_seconds)

        listing = await client.get(
            "/api/scout/results", params={"job_id": job_id, "limit": 200}
        )
        all_results = listing.get("results", []) or []
        matched = sorted(
            (r for r in all_results if (r.get("virality_score") or 0) >= threshold),
            key=lambda r: r.get("virality_score") or 0,
            reverse=True,
        )
        return {
            "scout_job_id": job_id,
            "total_scouted": len(all_results),
            "matched_count": len(matched),
            "threshold": threshold,
            **platform_coverage(requested, all_results),
            "results": matched,
        }

    @mcp.tool()
    async def recent_activity_summary(days: int = 7) -> dict:
        """Summarize the last N days of activity: videos generated and jobs run.

        One read for the "what have I been up to" snapshot, to ground
        recommendations ("you made 3 fitness Shorts this week — try a new
        niche?"). Pure read, no jobs dispatched. Counts come from the newest
        50 ready videos and 100 jobs.

        Args:
            days: Look-back window in days (at least 1, default 7).

        Returns:
            {
              "window_days": int,
              "cutoff": str,                  // ISO UTC, naive
              "videos_generated": int,
              "video_titles": [<up to 10 recent titles>],
              "jobs_total": int,
              "jobs_by_status": {"success": int, "failed": int, ...},
              "jobs_by_type": {"scout": int, "download": int, ...}
            }
            A failed read adds "videos_error" / "jobs_error" instead of
            failing the whole summary.
        """
        if days < 1:
            raise ValueError("days must be ≥ 1")
        # Rows store created_at as naive UTC and serialize without an offset,
        # so the cutoff must be naive too or the string compare mis-orders
        # rows at the boundary.
        cutoff_iso = (
            datetime.now(timezone.utc) - timedelta(days=days)
        ).replace(tzinfo=None).isoformat()

        videos_resp, jobs_resp = await asyncio.gather(
            client.get("/api/videos", params={"status": "ready", "limit": 50}),
            client.get("/api/jobs", params={"limit": 100}),
            return_exceptions=True,
        )

        result: dict = {"window_days": days, "cutoff": cutoff_iso}

        if isinstance(videos_resp, Exception):
            result["videos_error"] = str(videos_resp)[:200]
            result["videos_generated"] = 0
            result["video_titles"] = []
        else:
            recent = [
                v for v in videos_resp.get("videos", [])
                if (v.get("created_at") or "") >= cutoff_iso
            ]
            result["videos_generated"] = len(recent)
            result["video_titles"] = [
                v.get("title") or v.get("youtube_title") or v.get("id")
                for v in recent[:10]
            ]

        if isinstance(jobs_resp, Exception):
            result["jobs_error"] = str(jobs_resp)[:200]
            result["jobs_total"] = 0
            result["jobs_by_status"] = {}
            result["jobs_by_type"] = {}
        else:
            recent_jobs = [
                j for j in jobs_resp.get("jobs", [])
                if (j.get("created_at") or "") >= cutoff_iso
            ]
            by_status: dict = {}
            by_type: dict = {}
            for j in recent_jobs:
                s = j.get("status", "unknown")
                t = j.get("job_type", "unknown")
                by_status[s] = by_status.get(s, 0) + 1
                by_type[t] = by_type.get(t, 0) + 1
            result["jobs_total"] = len(recent_jobs)
            result["jobs_by_status"] = by_status
            result["jobs_by_type"] = by_type

        return result

    @mcp.tool()
    async def analyze_competitor(
        video_url: str,
        timeout_seconds: int = 300,
    ) -> dict:
        """Download a competitor's video, transcribe it, and return the AI analysis inline.

        Composes analyze_channel → wait_for_job → read the Library row. One
        call instead of four. Whisper runs locally; the insights are written
        on your configured AI provider key.

        Args:
            video_url: A single video URL on any yt-dlp-supported site
                (YouTube, TikTok, Bilibili, ...).
            timeout_seconds: Max wait for download + transcription + analysis
                (default 300 — long videos can take 1-3 min for Whisper alone).

        Returns:
            {
              "downloaded_video_id": str,
              "title": str,
              "duration_seconds": float | None,
              "transcript": str,            // capped at ~2KB inline
              "transcript_truncated": bool,
              "transcript_language": str | None,
              "insights": {...} | None,     // AI hook / structure / tone /
                                            // angle, as the analyzer wrote it
              "video_path": str | None
            }
            On a failed job: {"job_id", "status", "error", "current_step"}.

        Raises:
            TimeoutError: the pipeline didn't finish within timeout_seconds.
                It keeps running in the background — find it later with
                list_downloaded.
        """
        url = (video_url or "").strip()
        if not url:
            raise ValueError("video_url is required")
        analyze_resp = await client.post("/api/channels/analyze", json={"video_url": url})
        job_id = analyze_resp["job_id"]
        final = await _wait_for_job_internal(job_id, timeout_seconds=timeout_seconds)

        if final.get("status") != "success":
            return {
                "job_id": job_id,
                "status": final.get("status"),
                "error": final.get("error_message"),
                "current_step": final.get("current_step"),
            }

        # The download runner records the new rows as output.downloaded_ids.
        out = final.get("output")
        if out is None and final.get("output_json"):
            try:
                out = json.loads(final["output_json"])
            except (TypeError, ValueError):
                out = None
        ids = (out or {}).get("downloaded_ids") or []
        downloaded_id: Optional[str] = ids[0] if ids else None
        if not downloaded_id:
            return {
                "job_id": job_id,
                "status": "success",
                "warning": "Analysis finished but the job recorded no downloaded video id.",
                "raw_output": final.get("output_json"),
            }

        video = await client.get(f"/api/downloaded/{downloaded_id}")
        full = video.get("transcript") or ""
        truncated = len(full) > TRANSCRIPT_INLINE_CAP
        inline = (
            full[:TRANSCRIPT_INLINE_CAP]
            + f"\n…[truncated — {len(full) - TRANSCRIPT_INLINE_CAP} more chars]"
            if truncated else full
        )
        return {
            "downloaded_video_id": downloaded_id,
            "title": video.get("title"),
            "duration_seconds": video.get("duration_seconds"),
            "transcript": inline,
            "transcript_truncated": truncated,
            "transcript_language": video.get("transcript_language"),
            "insights": video.get("insights"),
            "video_path": video.get("video_path"),
        }
