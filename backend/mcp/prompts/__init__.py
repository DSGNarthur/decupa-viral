# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""MCP prompts — pre-built workflow recipes an MCP client can invoke.

Tools are actions the model calls; prompts are recipes the user (or the
model) pulls to seed a conversation with a known-good workflow. Clients show
them as slash-commands (Claude Code: /mcp__viralmint__<name>) or quick-replies.

Without a recipe the model composes ~60 tool descriptions into a workflow on
the fly — workable, but brittle: the wrong tool, the wrong order, a missing
wait_for_job. Every tool a recipe names must exist on this server;
tests/test_mcp_prompts.py fails when one doesn't.
"""
from __future__ import annotations

import logging

from fastmcp import FastMCP

logger = logging.getLogger(__name__)


def register(mcp: FastMCP) -> None:
    @mcp.prompt(
        name="viralmint:create_viral_short",
        description=(
            "Find a breakout video in the user's niche and make an original "
            "60-second Short inspired by it: find_breakouts → analyze_competitor "
            "→ generate_smart_video. Pass the niche, or omit to infer it from "
            "recent activity."
        ),
    )
    def create_viral_short(niche: str = "", aspect_ratio: str = "9:16") -> str:
        niche_clause = (
            f"The user's chosen niche: \"{niche}\"."
            if niche
            else (
                "No niche was given. Call `recent_activity_summary` first, infer "
                "a likely niche from the user's recent video titles, and confirm "
                "it with the user before going further."
            )
        )
        return f"""You're going to make a viral short for the user with ViralMint's MCP tools.

{niche_clause}

Run this workflow:

1. **Find a breakout to learn from.**
   Call `find_breakouts(niche=<the niche>)`. Results come back best first
   (virality score 0-100). Pick the top one and tell the user what you picked
   and why.

2. **Analyze it.**
   Call `analyze_competitor(video_url=<its video_url>)`. This downloads the
   video, transcribes it locally with Whisper and returns the transcript plus
   AI insights (hook, structure, tone). Use them to write an ORIGINAL 35-50 s
   script that borrows the hook pattern — never copy the transcript.

3. **Generate the video.**
   Show the user the script first. Once they're happy, call
   `generate_smart_video(script=<your script>, source_id=<the
   downloaded_video_id from step 2>, aspect_ratio="{aspect_ratio}")`.
   It returns a job_id at once.

4. **Wait for the render.**
   `wait_for_job(job_id=<the job_id>, timeout_seconds=1200)`. The result
   carries `output_path`, the finished mp4.

5. **Hand it over.**
   Call `get_video(video_id=<output.generated_video_id>)` and give the user
   the file path plus the AI-drafted titles, descriptions and tags. They post
   it themselves.

Key constraints:
- This takes several minutes end to end. Say so up front.
- If `find_breakouts` returns nothing, lower `threshold` or try a related
  niche before bothering the user.
- If a step fails or times out, report it plainly and offer to re-run just
  that step — don't start over.
"""

    @mcp.prompt(
        name="viralmint:analyze_my_channel",
        description=(
            "Pull the user's recent uploads and find the hook / structure / tone "
            "patterns that work, then recommend what to make next. Optionally "
            "pass a channel_url; otherwise connected channels are listed first."
        ),
    )
    def analyze_my_channel(channel_url: str = "", n_videos: int = 5) -> str:
        channel_clause = (
            f"Target channel URL: {channel_url}. If it isn't connected yet, call "
            f"`connect_channel(url=\"{channel_url}\")` first."
            if channel_url
            else (
                "No channel URL was given. Call `list_connected_channels`; if the "
                "user has channels connected, ask which one to analyze. If none, "
                "ask for the channel URL and connect it with `connect_channel`."
            )
        )
        return f"""You're going to find what works on the user's channel.

{channel_clause}

Run this workflow:

1. **Pull the recent uploads.**
   `list_channel_videos(channel_db_id=<the channel's id>)` returns the newest
   uploads with their view counts. Take the {n_videos} most recent.

2. **Analyze each one.**
   For each, call `analyze_competitor(video_url=<url>)`. Each takes a minute
   or two — tell the user you're working through them.

3. **Synthesize across the {n_videos}.**
   Compare hooks (question / bold claim / pattern interrupt), structure
   (story, listicle, comparison), tone, and which topics outperform on views.

4. **Recommend the next move.**
   Two or three specific next-video ideas grounded in what's working, each
   citing the upload that backs it ("your question hooks did 3× the views of
   your statement hooks — try one on topic X").

Key constraints:
- Don't dump transcripts back to the user; the value is the synthesis.
- If the channel has fewer than 3 uploads, say the sample is too small.
"""

    @mcp.prompt(
        name="viralmint:repurpose_long_form",
        description=(
            "Turn a long video or podcast (URL or downloaded_video_id) into "
            "3-5 captioned vertical clips with the AI viral-clip picker."
        ),
    )
    def repurpose_long_form(source: str = "", n_clips: int = 5) -> str:
        source_clause = (
            f"Source: `{source}`. A URL needs downloading first; an id-shaped "
            "string is an existing downloaded_video_id."
            if source
            else (
                "Ask the user for the source — a video URL, or an existing "
                "downloaded_video_id from `list_downloaded`."
            )
        )
        return f"""You're going to repurpose a long video into {n_clips} short clips.

{source_clause}

Run this workflow:

1. **Get the source into the library.**
   For a URL: `download_video(urls=[<url>])`, then `wait_for_job` (allow 10
   minutes for long sources). Skip this for an existing id.

2. **Check it's long enough.**
   `list_downloaded` shows duration_seconds. A source under ~2 minutes won't
   yield {n_clips} good clips — tell the user.

3. **Optionally preview the picks for free.**
   If the user wants a say before anything is cut, call
   `suggest_clips(downloaded_video_id=<id>, max_clips={n_clips})` — it
   PROPOSES time ranges without cutting. Cut the ones they keep with
   `extract_manual_clips(downloaded_video_id=<id>, time_ranges=[...])`.

4. **Or cut directly.**
   `extract_viral_clips(downloaded_video_id=<id>, max_clips={n_clips},
   caption_style="viral")` — add `remove_silence=True` for podcasts. Then
   `wait_for_job` (allow 15 minutes).

5. **Report the clips.**
   `list_videos(source_type="clip_extraction")` lists them, newest first,
   with each clip's virality score, hook type and the reason it was picked.
   Give the user the file paths and the AI-drafted titles per clip.

Key constraints:
- {n_clips} is a cap, not a target. If the source only supports fewer good
  clips, say so rather than padding.
- Each clip must stand alone: a viewer dropped into it with no context should
  still want to finish it.
"""

    @mcp.prompt(
        name="viralmint:daily_content_workflow",
        description=(
            "What should I make today? Checks rising searches in the user's "
            "niches, validates with a breakout scan, and recommends ONE video."
        ),
    )
    def daily_content_workflow() -> str:
        return """You're going to plan today's video for the user.

Run this workflow:

1. **Read recent context.**
   `recent_activity_summary(days=14)` — the recent video titles tell you
   which niches the user works in.

2. **See what's rising.**
   For up to 3 of those niches, call `get_search_demand(niche=<niche>)` and
   `rising_keywords(niche=<niche>)`. Look for queries that are new or
   accelerating.

3. **Validate with a breakout scan.**
   For the most promising query, `find_breakouts(niche=<query>)`. Nothing
   back means it isn't there yet — try the next one.

4. **Recommend ONE video.**
   Not a list. "Make a video about <topic>. Hook it with <pattern>. The
   reference is <breakout url> — its hook is <…>."

5. **Offer to make it.**
   Ask whether to run the `viralmint:create_viral_short` recipe on it, or
   whether they'd rather write the script and have you call
   `generate_smart_video`.

Key constraints:
- Ground every recommendation in a tool result — never invent a trend.
"""

    @mcp.prompt(
        name="viralmint:news_to_short",
        description=(
            "Pull a fresh news story in the user's niche and turn it into a "
            "60-second explainer Short — no competitor scouting needed."
        ),
    )
    def news_to_short(niche: str = "", angle: str = "") -> str:
        niche_clause = (
            f"The user's niche: \"{niche}\"."
            if niche
            else (
                "No niche was given. Infer one from `recent_activity_summary` "
                "and confirm it with the user."
            )
        )
        angle_clause = f"The user's preferred angle: \"{angle}\"." if angle else ""
        return f"""You're going to turn today's news into a 60-second Short.

{niche_clause}
{angle_clause}

Run this workflow:

1. **Scout fresh articles.**
   `scout_news(query=<the niche>)`, then `wait_for_job`, then
   `list_scout_results(job_id=<that job>)` to read them.

2. **Pick ONE story.**
   Fresh, with a clear factual hook (a number, a contrast, a surprise). Tell
   the user which and why, with the source URL so they can fact-check.

3. **Save it as a source.**
   `save_news_articles(article_ids=[<its id>])` puts the article in the
   library so the generator can ground its visuals in the article's facts.

4. **Write the script.**
   `generate_script_from_topic(topic=<the headline>, user_instructions="35-50
   second Short, strong first-2-seconds hook, specific numbers from the
   article, end with a follow-for-updates line")`. Show it to the user.

5. **Generate.**
   Once approved: `generate_smart_video(script=<script>, source_id=<the saved
   id>, aspect_ratio="9:16")`, then `wait_for_job(timeout_seconds=1200)` and
   report `output_path` with the drafted titles.

Key constraints:
- Never state a fact the article doesn't support; always cite the URL.
- If scout_news finds nothing, try a related query or `get_search_demand`.
"""

    @mcp.prompt(
        name="viralmint:channel_improvement",
        description=(
            "Review the user's last N uploads and give exactly three specific, "
            "evidence-backed improvements for their next video."
        ),
    )
    def channel_improvement(n_videos: int = 5) -> str:
        return f"""You're going to find tactical improvements for the user's next video.

Run this workflow:

1. **Find their uploads.**
   `list_connected_channels`. If a channel is connected, use
   `list_channel_videos` and take the {n_videos} newest. If not, ask for the
   channel URL and `connect_channel` it.

2. **Analyze each upload.**
   `analyze_competitor(video_url=<url>)` for each.

3. **Find the patterns.**
   Which hooks are strongest and weakest? Is the structure consistent? Is the
   tone consistent or drifting? Which uploads outperformed on views?

4. **Give exactly three improvements.**
   Specific, each citing an upload as evidence: "open on a counterintuitive
   number like you did in <title> (2.4× your median) instead of the question
   hook in <title>." Generic advice ("post more consistently") is banned.

5. **Offer to draft the next video** with `viralmint:create_viral_short`.

Key constraints:
- Don't flatter. Under 3 uploads, say the sample is too small.
- Three recommendations, no more.
"""
