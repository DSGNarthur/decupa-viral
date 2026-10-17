# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Output tools — list / inspect generated videos, cut clips, export.

The export endpoint streams raw mp4 bytes, so export_video saves them to a
local file and returns the path rather than pushing a binary blob over the
MCP transport.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from fastmcp import FastMCP

from backend.config import settings
from backend.mcp import client

_EXPORT_ASPECTS = ("9:16", "16:9", "1:1", "4:5")
_EXPORT_METHODS = ("auto", "letterbox", "crop", "blur_fill")


def _export_target(video_id: str, target_aspect: str,
                   output_path: Optional[str], overwrite: bool) -> Path:
    """Where export_video writes. Never clobbers a file the caller didn't name.

    - No output_path → STORAGE_ROOT/exports/<id>_<aspect>.mp4 (ViralMint's own
      export folder; re-exporting the same video+aspect replaces it).
    - output_path is an existing directory → the default filename inside it.
    - Otherwise output_path is the file. An existing file there is refused
      unless overwrite=True, so a typo can't silently replace user data.
    """
    if not re.fullmatch(r"[A-Za-z0-9_-]+", video_id):
        raise ValueError(f"Invalid video_id {video_id!r}")
    filename = f"{video_id}_{target_aspect.replace(':', 'x')}.mp4"
    if not output_path:
        return (settings.STORAGE_ROOT / "exports" / filename).resolve()
    out = Path(output_path).expanduser().resolve()
    if out.is_dir():
        out = out / filename
    if out.suffix.lower() != ".mp4":
        raise ValueError(f"output_path must end in .mp4 (got {out.name!r})")
    if out.exists() and not overwrite:
        raise ValueError(
            f"{out} already exists — pass overwrite=True to replace it, "
            "or choose another path."
        )
    return out


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    async def list_videos(
        status: Optional[str] = None,
        source_type: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> dict:
        """List generated videos, newest first — renders, motion graphics and extracted clips.

        Videos whose file is missing on disk are left out of the list (and of
        `total`); listing never deletes anything.

        Args:
            status: Filter to "ready" (rendered), "draft" (still in
                progress) or "failed".
            source_type: Filter by origin, e.g. "clip_extraction" for clips
                cut by extract_viral_clips / extract_manual_clips (the
                clip_* fields are filled on those rows).
            limit: Page size, 1-100 (default 20).
            offset: Pagination offset.

        Returns:
            {"total": int, "videos": [{
                "id", "title", "niche", "status", "aspect_ratio",
                "video_path", "thumbnail_path", "duration_seconds",
                "youtube_title", "youtube_description", "youtube_tags",
                "tiktok_title", "tiktok_description", "source_type",
                "source_downloaded_video_id", "clip_start_seconds",
                "clip_end_seconds", "clip_virality_score" (0-10),
                "clip_hook_score", "clip_hook_type", "clip_virality_reason",
                "clip_selection" ("ai" | "manual" | "duration_fallback" |
                null), "caption_status", "metadata_status", "created_at", ...
            }, ...]}
        """
        if not (1 <= int(limit) <= 100):
            raise ValueError("limit must be between 1 and 100")
        params: dict = {"limit": int(limit), "offset": int(offset)}
        if status:
            params["status"] = status
        if source_type:
            params["source_type"] = source_type
        return await client.get("/api/videos", params=params)

    @mcp.tool()
    async def get_video(video_id: str) -> dict:
        """Fetch the full record for one generated video (or extracted clip).

        Includes the local mp4 path, thumbnail path, the script, and the
        AI-drafted YouTube title / description / tags and TikTok caption —
        everything needed to hand the result to the user for posting.

        Args:
            video_id: Generated video id from list_videos (or a job's
                output.generated_video_id).

        Returns:
            The GeneratedVideo record: {"id", "title", "script", "status",
            "aspect_ratio", "video_path", "audio_path", "thumbnail_path",
            "duration_seconds", "youtube_title", "youtube_description",
            "youtube_tags", "tiktok_title", "tiktok_description",
            "source_type", "source_downloaded_video_id", clip_* fields,
            "created_at", ...}. 404 when unknown.
        """
        if not (video_id or "").strip():
            raise ValueError("video_id is required")
        return await client.get(f"/api/videos/{video_id.strip()}")

    @mcp.tool()
    async def suggest_clips(
        downloaded_video_id: str,
        max_clips: Optional[int] = None,
        min_duration: Optional[int] = None,
        max_duration: Optional[int] = None,
        user_query: Optional[str] = None,
        target_platform: Optional[str] = None,
        genre: Optional[str] = None,
        whisper_quality: Optional[str] = None,
        force_retranscribe: Optional[bool] = None,
    ) -> dict:
        """Find the strongest moments in a long video WITHOUT cutting them.

        The plan half of extract_viral_clips: the same transcript load and
        the same AI window selection (on the user's configured AI provider
        key), stopped before any ffmpeg runs. Nothing is cut and no clip row
        is written. Feed the windows you keep to extract_manual_clips, which
        cuts them verbatim.

        Prefer extract_viral_clips when the picks should be cut immediately.

        Args:
            downloaded_video_id: Source id from list_downloaded. Its file
                must be on disk (400 otherwise).
            max_clips: How many moments to propose, clamped to 1-10 (every
                proposal must fit through extract_manual_clips). Omitted →
                ~1 per 30s of source, capped at 10.
            min_duration: Per-clip floor in seconds (raised to ≥10).
            max_duration: Per-clip ceiling in seconds (raised to ≥15). When
                both are set, min must be < max (400 otherwise).
            user_query: What to look for (e.g. "only the parts about the
                launch"). Treated as a filter: if nothing matches, no
                moments come back.
            target_platform: "tiktok" / "youtube_shorts" / "reels" /
                "linkedin" / "twitter" — biases hook-type selection.
            genre: "podcast" / "interview" / "qa" / "vlog" / "tutorial" /
                "gaming" / "reaction" / "lecture".
            whisper_quality: "fast" / "balanced" (default) / "accurate" /
                "best". Used only when the source has no cached transcript.
            force_retranscribe: Re-run Whisper even if a transcript is cached.

        Returns:
            {"job_id": str}. Pair with wait_for_job. On success the output is
            {"type": "clip_suggestions", "downloaded_video_id": str,
             "suggestions": [{"start": float, "end": float, "title": str,
             "score": float, "hook_score": float, "hook_type": str,
             "reason": str}, ...]} — start/end are seconds, already in the
            shape extract_manual_clips takes as time_ranges.
        """
        if not (downloaded_video_id or "").strip():
            raise ValueError("downloaded_video_id is required")
        body: dict = {}
        for key, value in {
            "max_clips": max_clips,
            "min_duration": min_duration,
            "max_duration": max_duration,
            "user_query": user_query or None,
            "target_platform": target_platform or None,
            "genre": genre or None,
            "whisper_quality": whisper_quality or None,
        }.items():
            if value is not None:
                body[key] = value
        if force_retranscribe is not None:
            body["force_retranscribe"] = bool(force_retranscribe)
        return await client.post(
            f"/api/downloaded/{downloaded_video_id.strip()}/suggest-clips", json=body,
        )

    @mcp.tool()
    async def extract_viral_clips(
        downloaded_video_id: str,
        max_clips: Optional[int] = None,
        caption_style: str = "viral",
        min_duration: Optional[int] = None,
        max_duration: Optional[int] = None,
        remove_silence: bool = False,
        force_vertical: bool = False,
        user_query: Optional[str] = None,
        target_platform: Optional[str] = None,
        emoji_style: str = "moderate",
        genre: Optional[str] = None,
        whisper_quality: str = "balanced",
        force_retranscribe: bool = False,
        allow_duration_fallback: bool = True,
    ) -> dict:
        """Cut N viral short-form clips from a long downloaded video.

        Whisper transcribes the source locally, the AI (on the user's
        configured provider key) picks the strongest moments, and each one is
        rendered as its own mp4 with burned-in captions. Clips are Library
        videos with source_type="clip_extraction" —
        list_videos(source_type="clip_extraction").

        Typical chain: download_video → wait_for_job → extract_viral_clips →
        wait_for_job → list_videos(source_type="clip_extraction").

        Args:
            downloaded_video_id: Source id from list_downloaded (file must be
                on disk). A source under ~20s becomes one whole-video clip.
            max_clips: 1-99. Omitted → ~1 per 30s of source (min 3, max 99).
            caption_style: "viral" (default), "classic", "bold", "brainrot",
                "neon", "minimal", "karaoke", "glow", "urban", "warm",
                "mono", a custom preset id from list_caption_styles, or
                "none" for no burned-in text.
            min_duration: Per-clip floor in seconds (raised to ≥10).
            max_duration: Per-clip ceiling in seconds (raised to ≥15). Both
                set → min must be < max (400 otherwise).
            remove_silence: Strip silent gaps + filler words before
                captioning.
            force_vertical: False (default) keeps the source aspect. True
                converts landscape to 9:16 (face-tracking crop or blur fill,
                per the user's auto-reframe setting).
            user_query: What to look for. Treated as a filter: if nothing in
                the transcript matches, no clips are cut.
            target_platform: "tiktok" / "youtube_shorts" / "reels" /
                "linkedin" / "twitter" (aliases youtube, instagram, x).
                Unknown values fall back to plain virality ranking.
            emoji_style: "none" / "minimal" / "moderate" (default) / "heavy"
                — emoji density in captions. Unknown → "moderate".
            genre: "podcast" / "interview" / "qa" / "vlog" / "tutorial" /
                "gaming" / "reaction" / "lecture". Unknown → no genre bias.
            whisper_quality: "fast" / "balanced" (default) / "accurate" /
                "best". Higher is slower but better on noisy audio.
            force_retranscribe: Re-run Whisper even if a transcript is cached
                (needed for a whisper_quality change to take effect).
            allow_duration_fallback: When the AI picker finds nothing, True
                (default) cuts evenly-spaced time slices so you still get
                clips (they can land on intros/ads); False fails the job.

        Returns:
            {"job_id": str}. Pair with wait_for_job (a 10-min source takes a
            few minutes). When the duration fallback ran, the job output
            carries "picker_fallback": true and "fallback_count": N, and those
            clips have clip_selection="duration_fallback".
        """
        if not (downloaded_video_id or "").strip():
            raise ValueError("downloaded_video_id is required")
        body: dict = {
            "caption_style": caption_style,
            "emoji_style": emoji_style,
            "whisper_quality": whisper_quality,
        }
        for key, value in {
            "max_clips": max_clips,
            "min_duration": min_duration,
            "max_duration": max_duration,
            "user_query": user_query or None,
            "target_platform": target_platform or None,
            "genre": genre or None,
        }.items():
            if value is not None:
                body[key] = value
        if remove_silence:
            body["remove_silence"] = True
        if force_vertical:
            body["force_vertical"] = True
        if force_retranscribe:
            body["force_retranscribe"] = True
        if not allow_duration_fallback:
            body["allow_duration_fallback"] = False
        return await client.post(
            f"/api/downloaded/{downloaded_video_id.strip()}/extract-clips", json=body,
        )

    @mcp.tool()
    async def extract_manual_clips(
        downloaded_video_id: str,
        time_ranges: list[dict],
        caption_style: str = "viral",
        emoji_style: str = "moderate",
        whisper_quality: str = "balanced",
        force_retranscribe: bool = False,
        remove_silence: bool = False,
        force_vertical: bool = False,
    ) -> dict:
        """Cut exact time ranges from a downloaded video — no AI picker.

        Each range is cut verbatim, captioned, and saved as a Library video
        with source_type="clip_extraction". AI-drafted YouTube/TikTok
        metadata is still written (one call on the user's configured AI
        provider key). Pairs with suggest_clips: review its proposals, then
        cut the ones you keep here.

        Args:
            downloaded_video_id: Source id from list_downloaded.
            time_ranges: 1-10 {"start", "end"} dicts. Values are seconds
                (number) or "SS" / "MM:SS" / "HH:MM:SS" strings (optional
                ".fff"). E.g. [{"start": 18, "end": 38}] or
                [{"start": "10:38", "end": "10:58"}]. Ranges are sorted by
                start; each must be ≥1s, end within the source duration, and
                ranges may touch but must NOT overlap (400 names the range).
            caption_style: Same ids as extract_viral_clips, incl. "none".
            emoji_style: "none" / "minimal" / "moderate" (default) / "heavy".
            whisper_quality: Same as extract_viral_clips (captions need
                word timings, so the transcript is still loaded).
            force_retranscribe: Re-run Whisper even if cached.
            remove_silence: Strip silent gaps + filler words from each clip.
            force_vertical: False keeps the source aspect; True converts
                landscape to 9:16.

        Returns:
            {"job_id": str}. Pair with wait_for_job, then
            list_videos(source_type="clip_extraction"). Manual clips have
            clip_selection="manual" and no virality/hook scores.
        """
        if not (downloaded_video_id or "").strip():
            raise ValueError("downloaded_video_id is required")
        if not isinstance(time_ranges, list) or not time_ranges:
            raise ValueError("time_ranges must be a non-empty list of {start, end} dicts")
        if len(time_ranges) > 10:
            raise ValueError("at most 10 time_ranges per call")
        body: dict = {
            "mode": "manual",
            "time_ranges": time_ranges,
            "caption_style": caption_style,
            "emoji_style": emoji_style,
            "whisper_quality": whisper_quality,
        }
        if remove_silence:
            body["remove_silence"] = True
        if force_vertical:
            body["force_vertical"] = True
        if force_retranscribe:
            body["force_retranscribe"] = True
        return await client.post(
            f"/api/downloaded/{downloaded_video_id.strip()}/extract-clips", json=body,
        )

    @mcp.tool()
    async def export_video(
        video_id: str,
        target_aspect: str = "16:9",
        method: str = "auto",
        output_path: Optional[str] = None,
        overwrite: bool = False,
    ) -> dict:
        """Export a generated video at another aspect ratio and save the mp4 locally.

        The backend re-encodes with FFmpeg (the 16:9 version is cached; a
        video already at the target aspect is returned as-is). This tool
        streams the result to disk and returns the path to show the user.

        Args:
            video_id: Generated video id from list_videos.
            target_aspect: "9:16", "16:9" (default), "1:1" or "4:5".
            method: "auto" (default — crop when widening, blur fill when
                narrowing), "letterbox", "crop" or "blur_fill".
            output_path: Optional destination: an .mp4 file path, or an
                existing directory (the file is named <video_id>_<aspect>.mp4
                inside it). Default:
                <data dir>/storage/exports/<video_id>_<aspect>.mp4.
            overwrite: Replace an existing file at a caller-chosen
                output_path. Default False — an existing file is refused.

        Returns:
            {"output_path": <absolute path>, "size_bytes": int,
             "content_type": str}.
        """
        if not (video_id or "").strip():
            raise ValueError("video_id is required")
        if target_aspect not in _EXPORT_ASPECTS:
            raise ValueError(f"target_aspect must be one of {', '.join(_EXPORT_ASPECTS)}")
        if method not in _EXPORT_METHODS:
            raise ValueError(f"method must be one of {', '.join(_EXPORT_METHODS)}")
        vid = video_id.strip()
        out = _export_target(vid, target_aspect, output_path, overwrite)
        return await client.stream_to_file(
            "POST",
            f"/api/videos/{vid}/export",
            output_path=str(out),
            json_body={"target_aspect": target_aspect, "method": method},
        )
