# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Research tools — discover what's worth making.

Wraps /api/scout/*, /api/news/* and /api/channels/analyze. Scout jobs are
long-running (10-90s depending on platforms requested), so every start
endpoint returns a job_id; pair it with wait_for_job.
"""
from __future__ import annotations

import json
from typing import Optional

from fastmcp import FastMCP

from backend.mcp import client

# Platforms the scout searches natively. Anything else is answered with
# YouTube cross-posts about the niche, which is rarely what a caller wants,
# so the tool rejects unknown names up front instead.
SCOUT_PLATFORMS = ("youtube", "tiktok", "douyin")

# Mirrors the default of ScoutStartRequest in backend/api/scout.py — used to
# report platform coverage when the job row can't be read.
DEFAULT_SCOUT_PLATFORMS = ["youtube"]

NEWS_SOURCES = (
    "google", "bing", "hackernews", "reddit", "cnbc", "bbc", "reuters",
    "nytimes", "guardian", "aljazeera", "techcrunch", "yahoo",
)


def _validate_platforms(platforms: Optional[list[str]]) -> Optional[list[str]]:
    if not platforms:
        return None
    cleaned = [str(p).strip().lower() for p in platforms if str(p).strip()]
    unknown = [p for p in cleaned if p not in SCOUT_PLATFORMS]
    if unknown:
        raise ValueError(
            f"Unknown platform(s): {unknown}. Supported: {list(SCOUT_PLATFORMS)}"
        )
    return cleaned or None


def platform_coverage(requested: list[str], results: list[dict]) -> dict:
    """Which requested platforms actually returned rows.

    A platform with zero rows usually means its key/cookie isn't configured
    (the scout skips it with a warning rather than failing the whole job).
    """
    seen = {r.get("platform") for r in results if r.get("platform")}
    return {
        "platforms_requested": list(requested),
        "platforms_used": [p for p in requested if p in seen],
        "platforms_missing": [p for p in requested if p not in seen],
    }


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    async def scout_trending(
        niche: str,
        platforms: Optional[list[str]] = None,
    ) -> dict:
        """Start a multi-platform trend scout for a niche.

        Do NOT use this when the user wants the strongest / breakout videos —
        the `find_breakouts` macro composes scout + wait + filter in one call.
        Reach for scout_trending only when you need the raw scouted set (e.g.
        a cross-platform comparison or a custom threshold per platform).

        Returns a job_id immediately. Call wait_for_job(job_id) to block until
        the scout completes, then list_scout_results(job_id=...) to read the
        surfaced videos with their virality scores.

        Each platform needs its own access configured in Settings: YouTube a
        YouTube Data API key; TikTok / Douyin a TikHub API key or a session
        cookie. A platform without one is skipped (it returns 0 results) rather
        than failing the scout — list_scout_results reports which ones.

        Args:
            niche: Search query (e.g., "Tesla earnings", "AI tools 2026").
            platforms: Subset of ["youtube", "tiktok", "douyin"]. Default
                ["youtube"].

        Returns:
            {"job_id": "<uuid>"}
        """
        if len((niche or "").strip()) < 2:
            raise ValueError("niche must be at least 2 characters")
        body: dict = {"niche": niche.strip()}
        cleaned = _validate_platforms(platforms)
        if cleaned:
            body["platforms"] = cleaned
        return await client.post("/api/scout/start", json=body)

    @mcp.tool()
    async def list_scout_results(
        job_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """List scouted videos, optionally filtered to one scout job.

        Do NOT use this to START a search — there is nothing to list until a
        scout has run. Start with `find_breakouts` (strongest videos) or
        `scout_trending` (the raw set). Use list_scout_results to page through
        a finished scout's results, or to read past scout history.

        Each row includes virality_score (0-100), platform, video_url, author,
        view/like/comment counts and `is_downloaded` / `is_analyzed` flags, so
        top results can be piped into download_video(scout_result_ids=[...]).

        Args:
            job_id: Limit to results from this scout run. Omit to read the
                full history. When provided, the response also reports which
                requested platforms returned data and which returned nothing
                (usually a missing key or cookie for that platform).
            limit: Page size (default 50).
            offset: Pagination offset.

        Returns:
            {
              "total": int,
              "results": [{
                "id": str, "platform": str, "video_url": str, "title": str,
                "author": str, "views": int, "likes": int, "comments": int,
                "virality_score": float, "niche": str,
                "is_downloaded": bool, "is_analyzed": bool, ...
              }, ...],
              # only when job_id is provided:
              "platforms_requested": [str, ...],
              "platforms_used": [str, ...],
              "platforms_missing": [str, ...]
            }
        """
        params: dict = {"limit": limit, "offset": offset}
        if job_id:
            params["job_id"] = job_id
        listing = await client.get("/api/scout/results", params=params)

        if not job_id:
            return listing

        # The platforms the scout was asked for live on the job row's
        # input_json. If the job can't be read, omit the coverage fields
        # rather than invent them.
        try:
            job_row = await client.get(f"/api/jobs/{job_id}")
            job_input = json.loads(job_row.get("input_json") or "{}")
            requested = job_input.get("platforms") or DEFAULT_SCOUT_PLATFORMS
        except Exception:
            return listing

        return {**listing, **platform_coverage(requested, listing.get("results", []))}

    @mcp.tool()
    async def get_search_demand(niche: str, lang: str = "en") -> dict:
        """Pull live YouTube Search Suggest demand for a niche.

        Returns what real users type into YouTube search. Use it before
        scout_trending to check the niche has demand, or before
        generate_smart_video to ground a script in actual search queries.
        Needs no API key.

        Args:
            niche: Search query stem (e.g., "ai tools"). At least 2 characters.
            lang: Suggest language code (default "en").

        Returns:
            {"niche": str, "primary_suggestions": [str], "question_keywords":
             [str], "long_tail_keywords": [str], "top_keywords": [str],
             "demand_summary": str}
        """
        if len((niche or "").strip()) < 2:
            raise ValueError("niche must be at least 2 characters")
        return await client.get(
            "/api/scout/search-demand",
            params={"niche": niche.strip(), "lang": lang or "en"},
        )

    @mcp.tool()
    async def scout_news(
        query: str,
        expanded_queries: Optional[list[str]] = None,
        sources: Optional[list[str]] = None,
    ) -> dict:
        """Start a news-article scout — finds recent articles on a topic.

        Different from scout_trending (short-form video platforms): this
        targets news sources. Use it for news-driven content — pair with
        save_news_articles, then generate_smart_video to turn a headline into
        a Short. The article summaries are written on your configured AI
        provider key.

        Args:
            query: Topic (e.g., "Nvidia earnings").
            expanded_queries: Extra query variants to widen recall; results
                are combined across all queries.
            sources: Subset of ["google", "bing", "hackernews", "reddit",
                "cnbc", "bbc", "reuters", "nytimes", "guardian", "aljazeera",
                "techcrunch", "yahoo"]. Default ["google", "bing",
                "hackernews", "reddit"].

        Returns:
            {"job_id": str}. Pair with wait_for_job; results are read with
            list_scout_results(job_id=...) — each row has platform="news",
            `video_url` = the article URL and `description` = the extracted
            summary. Then pass the ids you want to save_news_articles.
        """
        if not (query or "").strip():
            raise ValueError("query is required")
        body: dict = {"query": query.strip()}
        if expanded_queries:
            body["expanded_queries"] = expanded_queries
        if sources:
            cleaned = [s.strip().lower() for s in sources if s and s.strip()]
            unknown = [s for s in cleaned if s not in NEWS_SOURCES]
            if unknown:
                raise ValueError(
                    f"Unknown news source(s): {unknown}. Supported: {list(NEWS_SOURCES)}"
                )
            if cleaned:
                body["sources"] = cleaned
        return await client.post("/api/news/scout", json=body)

    @mcp.tool()
    async def save_news_articles(article_ids: list[str]) -> dict:
        """Copy scouted news articles into the Library for video generation.

        Pair after scout_news + list_scout_results. Each article becomes a
        Library source (platform="news") whose transcript is the article
        text, so generate_from_downloaded can script a video from it.

        Idempotent: articles that are already saved are skipped, and unknown
        ids are ignored (so `saved` can be lower than the number of ids sent).

        Args:
            article_ids: ScoutResult ids from list_scout_results, from a
                scout_news job (platform="news").

        Returns:
            {"saved": int, "articles": [{"id": str, "title": str}, ...]}
            — `id` is the new downloaded-video id.
        """
        if not article_ids:
            raise ValueError("article_ids must be non-empty")
        return await client.post("/api/news/save", json={"article_ids": article_ids})

    @mcp.tool()
    async def analyze_channel(
        video_url: str,
        title: Optional[str] = None,
    ) -> dict:
        """Download + transcribe + AI-analyze a single video (returns a job_id).

        Do NOT use this when you want the transcript and insights back in one
        call — the `analyze_competitor` macro waits and returns them inline.
        Use this primitive to fire several analyses in parallel and wait on
        them together.

        Runs the yt-dlp download → Whisper transcription → AI insight
        extraction pipeline (insights on your configured AI provider key).
        A channel or playlist URL downloads and analyzes its top 5 videos.

        Args:
            video_url: Video URL on any yt-dlp-supported site (YouTube,
                TikTok, Bilibili, X, ...).
            title: Optional display title for the job row; the real title
                comes from the source.

        Returns:
            {"job_id": "<uuid>", "message": str}. Pair with wait_for_job;
            the finished job's `output.downloaded_ids` lists the new Library
            rows, also visible via list_downloaded.
        """
        if not (video_url or "").strip():
            raise ValueError("video_url is required")
        body: dict = {"video_url": video_url.strip()}
        if title:
            body["title"] = title
        return await client.post("/api/channels/analyze", json=body)
