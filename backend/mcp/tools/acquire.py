# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Content acquisition — get source videos into the local Library.

  - download_video: from a URL list (/api/downloaded/batch-download) or from
    scout results (/api/scout/download). Both return a job_id; pair with
    wait_for_job.
  - import_local_video: upload a file already on disk.
  - analyze_downloaded: (re)run transcription + AI insights on a Library row.
  - connected channels: connect / list / read recent uploads.
"""
from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

from fastmcp import FastMCP

from backend.mcp import client

CHANNEL_PLATFORMS = ("youtube", "tiktok")
WHISPER_QUALITIES = ("fast", "balanced", "accurate", "best")


def _download_options(quality, subtitles, sub_langs, container, thumbnail, metadata) -> dict:
    """Collapse the flat MCP params into the endpoint's nested `options` dict.

    MCP tools take FLAT scalars because that keeps the parameter schema
    legible to a model; the endpoint speaks the nested shape. No validation
    here on purpose: `download_options.normalize()` on the server is the one
    authority on what is accepted, and it drops unknown values instead of
    failing, so the endpoint echoes back what it actually applied.
    """
    raw = {
        "quality": quality,
        "subtitles": subtitles,
        "sub_langs": sub_langs,
        "container": container,
        "thumbnail": thumbnail or None,
        "metadata": metadata or None,
    }
    return {k: v for k, v in raw.items() if v}


def detect_channel_platform(url: str) -> Optional[str]:
    """Guess youtube / tiktok from a channel URL's hostname; None if unclear."""
    candidate = url if "://" in url else f"https://{url}"
    host = (urlparse(candidate).hostname or "").lower()
    if host == "youtu.be" or host.endswith("youtube.com"):
        return "youtube"
    if host.endswith("tiktok.com"):
        return "tiktok"
    return None


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    async def download_video(
        urls: Optional[list[str]] = None,
        scout_result_ids: Optional[list[str]] = None,
        quality: Optional[str] = None,
        subtitles: Optional[str] = None,
        sub_langs: Optional[list[str]] = None,
        container: Optional[str] = None,
        thumbnail: bool = False,
        metadata: bool = False,
        analyze: bool = True,
    ) -> dict:
        """Download one or more videos via yt-dlp into the local Library.

        Exactly one of `urls` or `scout_result_ids` must be provided. Runs as
        a background job and, by default, chains into Whisper transcription
        + AI insight extraction (on your configured AI provider key).

        Supported sources: YouTube, TikTok, Bilibili, X, Reddit and the other
        ~1000 sites yt-dlp handles.

        Args:
            urls: Full http(s) video URLs to download directly. Max 20.
            scout_result_ids: Scout result ids from list_scout_results.
                Max 20. Always downloads + analyzes.
            quality: Max resolution — "best", "2160p", "1440p", "1080p",
                "720p" or "480p". A cap DEGRADES to the closest available
                rather than failing. Omit for the default ladder.
            subtitles: "embed" muxes subtitles into the video as a selectable
                track; "file" keeps a sidecar .srt beside it. Omit for neither.
            sub_langs: Up to 5 language codes, e.g. ["en", "es"]. Defaults to
                ["en"] when subtitles are requested.
            container: "mp4" or "mkv" — a preference: codec pairs that can't
                be stream-copied into mp4 come out as mkv instead of failing.
            thumbnail: Embed the cover art into the file.
            metadata: Embed title/artist metadata and chapter markers.
            analyze: Run transcription + AI insights after downloading
                (default true). Pass false to just land the files on disk.

        Note: quality/subtitles/container/thumbnail/metadata/analyze apply
        ONLY to the `urls` path. The scout_result_ids path ignores them — do
        not tell the user a scout download honoured a quality request.

        Returns:
            urls path: {"job_id": str, "count": int, "options": {...}} where
            `options` is what was actually APPLIED after validation (unknown
            values are dropped, not errors) — compare it with what you asked
            for. scout path: {"job_id": str, "count": int}. Poll with
            wait_for_job(job_id); the finished job's `output.downloaded_ids`
            lists the new Library rows, and for the urls path
            `output.videos` carries per-video delivery receipts (delivered
            height / ext) — report what was DELIVERED.
        """
        if (urls is None) == (scout_result_ids is None):
            raise ValueError("Provide exactly one of: urls, scout_result_ids")
        if urls is not None:
            if not urls:
                raise ValueError("urls list is empty")
            if len(urls) > 20:
                raise ValueError("Maximum 20 URLs per batch")
            body: dict = {"urls": [{"url": u} for u in urls]}
            opts = _download_options(
                quality, subtitles, sub_langs, container, thumbnail, metadata
            )
            if opts:
                body["options"] = opts
            if not analyze:
                body["analyze"] = False
            return await client.post("/api/downloaded/batch-download", json=body)
        if not scout_result_ids:
            raise ValueError("scout_result_ids list is empty")
        if len(scout_result_ids) > 20:
            raise ValueError("Maximum 20 scout results per batch")
        return await client.post(
            "/api/scout/download",
            json={"scout_result_ids": scout_result_ids},
        )

    @mcp.tool()
    async def list_downloaded(
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """List downloaded / imported source videos in the local Library.

        Use this to find a downloaded_video_id for generate_from_downloaded,
        suggest_clips / extract_viral_clips, or analyze_downloaded. Rows are
        newest first.

        Args:
            limit: Page size (default 50, max 200).
            offset: Pagination offset.

        Returns:
            {"total": int, "videos": [{
                "id": str, "title": str, "platform": str, "source_url": str|None,
                "video_path": str|None, "audio_path": str|None,
                "file_exists": bool, "transcript": str|None (first 200 chars;
                null = not transcribed yet), "transcript_language": str|None,
                "insights": {...}|None (AI hook / structure / tone),
                "duration_seconds": float|None, "created_at": str, ...
            }, ...]}
        """
        limit = max(1, min(int(limit or 50), 200))
        return await client.get(
            "/api/downloaded", params={"limit": limit, "offset": offset}
        )

    @mcp.tool()
    async def analyze_downloaded(
        downloaded_video_id: str,
        whisper_quality: str = "balanced",
    ) -> dict:
        """Re-run transcription + AI insights on a video already in the Library.

        Use it when a row has no transcript / insights yet (e.g. downloaded
        with analyze=false), or to re-transcribe with a more accurate Whisper
        model. Whisper runs locally; the insight step runs on your configured
        AI provider key. Returns a job_id immediately — pair with
        wait_for_job, then read the row via list_downloaded.

        Args:
            downloaded_video_id: Library row id from list_downloaded or a
                finished download job's `output.downloaded_ids`.
            whisper_quality: "fast", "balanced" (default), "accurate" or
                "best" — larger models are slower but more accurate.

        Returns:
            {"job_id": str}

        Raises:
            httpx.HTTPStatusError: 404 when the id is unknown.
        """
        vid = (downloaded_video_id or "").strip()
        if not vid:
            raise ValueError("downloaded_video_id is required")
        q = (whisper_quality or "balanced").strip().lower()
        if q not in WHISPER_QUALITIES:
            raise ValueError(f"whisper_quality must be one of {list(WHISPER_QUALITIES)}")
        return await client.post(
            f"/api/downloaded/{vid}/reanalyze", json={"whisper_quality": q}
        )

    @mcp.tool()
    async def import_local_video(
        file_path: str,
        title: Optional[str] = None,
    ) -> dict:
        """Import a local video or audio file into the ViralMint Library.

        Uploads the file to the backend, which stores it under the data
        directory, creates a Library row and starts transcription + AI
        insights in the background (job_id in the response). The row can then
        be used like any download — clips, Smart Video, tools.

        Supported: mp4, mov, avi, mkv, webm (video); mp3, wav, m4a, aac, flac
        (audio). Max 2GB; empty files are rejected.

        Args:
            file_path: Absolute or ~-expanded path to a local file.
            title: Display title — defaults to the filename stem.

        Returns:
            {"id": str, "job_id": str, "title": str, "file_size_mb": float,
             "message": str}
        """
        return await client.post_file(
            "/api/downloaded/import",
            file_path=file_path,
            file_field="file",
            form={"title": title or ""},
        )

    @mcp.tool()
    async def list_connected_channels(
        platform: Optional[str] = None,
    ) -> dict:
        """List the YouTube / TikTok channels the user has connected.

        Args:
            platform: Optional filter — "youtube" or "tiktok". Omit for all.

        Returns:
            {"channels": [{
                "id": str,            // pass to list_channel_videos
                "platform": "youtube" | "tiktok",
                "channel_id": str | None,
                "channel_url": str,
                "channel_name": str | None,
                "thumbnail_url": str | None,
                "subscriber_count": int | None,
                "video_count": int | None,
            }, ...]}
        """
        params: dict = {}
        if platform:
            p = platform.strip().lower()
            if p not in CHANNEL_PLATFORMS:
                raise ValueError("platform must be 'youtube' or 'tiktok'")
            params["platform"] = p
        return await client.get("/api/channels/list", params=params)

    @mcp.tool()
    async def list_channel_videos(
        channel_db_id: str,
        page_token: Optional[str] = None,
        refresh: bool = False,
    ) -> dict:
        """Fetch the recent uploads of a connected channel.

        Pass the `id` from list_connected_channels. YouTube channels are read
        through the YouTube Data API (needs the YouTube API key in Settings)
        and each video carries an outlier score — views vs the channel's own
        median. TikTok profiles are read with yt-dlp. Results are cached
        server-side; `refresh=True` bypasses the cache.

        Args:
            channel_db_id: ConnectedChannel id from list_connected_channels.
            page_token: Continuation token (YouTube only).
            refresh: Force a fresh fetch. Use sparingly — the YouTube API
                quota is the user's own.

        Returns:
            YouTube: {"connected": true, "channel": {..., "median_views",
              "avg_views"}, "videos": [{"video_id", "title", "url",
              "thumbnail_url", "published_at", "view_count", "like_count",
              "comment_count", "duration", "outlier_score": float|None,
              "outlier_label": str|None}, ...], "next_page_token": str|None,
              "total": int}
            TikTok: {"connected": true, "user": {...}, "videos": [{"video_id",
              "title", "url", "cover_url", "view_count", "like_count",
              "comment_count", "share_count", "duration", ...}],
              "has_more": bool}
        """
        cid = (channel_db_id or "").strip()
        if not cid:
            raise ValueError("channel_db_id is required (see list_connected_channels)")
        params: dict = {}
        if page_token:
            params["page_token"] = page_token
        if refresh:
            params["refresh"] = "true"
        return await client.get(f"/api/channels/videos/{cid}", params=params or None)

    @mcp.tool()
    async def connect_channel(
        url: str,
        platform: Optional[str] = None,
    ) -> dict:
        """Connect a YouTube or TikTok channel by URL for outlier analytics.

        Once connected, the channel's recent uploads are readable via
        list_channel_videos. The connection persists across restarts. No
        OAuth: YouTube uses the YouTube Data API key from Settings; TikTok
        uses public profile data.

        Args:
            url: Channel URL — YouTube ``https://www.youtube.com/@handle``,
                ``/channel/UC...`` or a video URL; TikTok
                ``https://www.tiktok.com/@handle`` or a bare ``@handle``.
            platform: "youtube" or "tiktok". Optional when the URL's host
                makes it obvious; REQUIRED for a bare ``@handle``.

        Returns:
            {"ok": true, "channel": {"id": str (pass to list_channel_videos),
             "platform": str, "channel_id": str|None, "channel_url": str,
             "channel_name": str|None, "thumbnail_url": str|None,
             "subscriber_count": int, "video_count": int}}

        Raises:
            httpx.HTTPStatusError: 400 when the URL can't be resolved, the
                YouTube API key is missing, or the channel is already
                connected (call list_connected_channels to find its id).
        """
        url = (url or "").strip()
        if not url:
            raise ValueError("url is required")
        if platform:
            p = platform.strip().lower()
            if p not in CHANNEL_PLATFORMS:
                raise ValueError("platform must be 'youtube' or 'tiktok' when set")
        else:
            # The endpoint requires an explicit platform, so infer it here.
            p = detect_channel_platform(url)
            if not p:
                raise ValueError(
                    "Couldn't tell the platform from this URL — pass "
                    "platform='youtube' or platform='tiktok'."
                )
        return await client.post(
            "/api/channels/connect", json={"url": url, "platform": p}
        )
