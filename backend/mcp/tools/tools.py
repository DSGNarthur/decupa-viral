# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Single-purpose Tools-page utilities — each works on a local file.

Every /api/tools/* endpoint takes a multipart upload. The MCP tool reads the
local file, streams it as multipart/form-data, and the backend schedules a job
and returns {"job_id"}. Poll with wait_for_job: a tool job's terminal payload
carries `output_path` (the result file, already on local disk) and `output`
(the decoded job output). tool_download_result copies the file somewhere else
when the caller wants it at a specific path.

Contract rule for this module: every Form field a tool sends must be a field
the endpoint declares. FastAPI silently ignores unknown form fields, so a
misnamed or extra field is an option the caller thinks they set and never did.
tests/test_mcp_tools_discovery.py checks each tool against the live route.

Everything here runs locally (FFmpeg / Whisper / Edge TTS) except the steps
that need a language model — translate, hook analysis, metadata and chapters —
which run on the user's configured AI provider key.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Literal

from fastmcp import FastMCP

# The caption-style vocabulary is derived from the caption engine by the
# endpoint module itself; importing it (rather than re-listing the ids) keeps
# the MCP schema and the route in lock-step.
from backend.api.tools import CaptionStyleId
from backend.config import settings
from backend.mcp import client

logger = logging.getLogger(__name__)

EmojiStyle = Literal["none", "minimal", "moderate", "heavy"]

# /api/tools/merge-clips bounds (MERGE_CLIPS_MIN / MERGE_CLIPS_MAX there).
_MERGE_MIN = 2
_MERGE_MAX = 10


async def _post_multi_files(
    path: str,
    field: str,
    file_paths: list[str],
    form: dict,
    timeout: float = 600.0,
) -> dict:
    """POST several local files under ONE repeated multipart field.

    client.post_file keys files by field name, so it can't send the
    `files: list[UploadFile]` shape /merge-clips takes. Existence is checked
    for every path up front so a typo fails before any bytes are sent.
    """
    from contextlib import ExitStack

    resolved: list[Path] = []
    for raw in file_paths:
        p = Path(raw).expanduser().resolve()
        if not p.is_file():
            raise FileNotFoundError(f"File not found: {p}")
        resolved.append(p)
    with ExitStack() as stack:
        files = [
            (field, (p.name, stack.enter_context(p.open("rb"))))
            for p in resolved
        ]
        return await client.post(path, files=files, data=form, timeout=timeout)


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    async def tool_captions(
        file_path: str,
        style: CaptionStyleId = "viral",
        emoji_style: EmojiStyle = "moderate",
    ) -> dict:
        """Burn word-by-word animated captions into a local video.

        Pipeline: Whisper (local, word-level timestamps) → ASS caption
        rendering → FFmpeg burn-in. Fully local; no AI key needed. A video
        with no detectable speech fails with a clear reason.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).
            style: Built-in caption style id. Call list_caption_styles for
                each style's look; pass its `id` here. Custom styles are not
                accepted by this tool.
            emoji_style: "none" / "minimal" / "moderate" / "heavy" — how many
                emoji are inserted next to keywords.

        Returns:
            {"job_id": str}. Pair with wait_for_job; the captioned mp4 is at
            the terminal payload's `output_path`.
        """
        return await client.post_file(
            "/api/tools/captions",
            file_path=file_path,
            form={"style": style, "emoji_style": emoji_style},
        )

    @mcp.tool()
    async def tool_reframe(file_path: str) -> dict:
        """Convert a landscape/square video to vertical 9:16 (blur-fill).

        The full original frame is kept, scaled to the 9:16 width and centred
        over a blurred, zoomed copy of itself that fills the rest of the
        canvas. There is no face/subject tracking — for a manual crop use
        tool_crop. A source that is already 9:16 (or narrower) comes back
        unchanged.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).

        Returns:
            {"job_id": str}. Pair with wait_for_job; the portrait mp4 is at
            `output_path`.
        """
        return await client.post_file("/api/tools/reframe", file_path=file_path)

    @mcp.tool()
    async def tool_audio_enhance(file_path: str) -> dict:
        """Denoise the audio and normalize it to platform loudness.

        Pipeline: highpass/lowpass + FFT denoise → two-pass EBU R128 loudness
        normalization to -16 LUFS. Video is copied when the container allows
        it. Audio already at the target loudness comes back unchanged; a file
        with no audio track fails with a clear reason.

        Args:
            file_path: Local video (mp4/mov/mkv/webm/m4v) or audio
                (mp3/wav/m4a/aac/ogg/flac) path.

        Returns:
            {"job_id": str}. Pair with wait_for_job; the result is at
            `output_path` (video in → video out, audio in → audio out).
        """
        return await client.post_file("/api/tools/audio-enhance", file_path=file_path)

    @mcp.tool()
    async def tool_watermark(
        file_path: str,
        logo_path: str,
        position: Literal["top-left", "top-right", "bottom-left", "bottom-right"] = "bottom-right",
        opacity: float = 0.8,
        size_pct: float = 8.0,
    ) -> dict:
        """Overlay a logo / watermark onto a local video.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).
            logo_path: Local png/jpg logo (max 5 MB). Required. PNG
                transparency is honoured.
            position: "top-left" / "top-right" / "bottom-left" /
                "bottom-right" (default — outside most platform chrome).
            opacity: 0.05-1.0 (default 0.8).
            size_pct: Logo WIDTH as a percent of the video's width, 2-40
                (default 8). The renderer clamps to that range, so values
                outside it are rejected here instead of silently changed.

        Returns:
            {"job_id": str}. Pair with wait_for_job; the watermarked mp4 is at
            `output_path`.
        """
        if not 0.05 <= opacity <= 1.0:
            raise ValueError("opacity must be 0.05-1.0")
        if not 2.0 <= size_pct <= 40.0:
            raise ValueError("size_pct must be 2-40 (% of video width)")
        return await client.post_file(
            "/api/tools/watermark",
            file_path=file_path,
            extra_files={"logo": logo_path},
            form={
                "position": position,
                "opacity": str(opacity),
                "size_pct": str(size_pct),
            },
        )

    @mcp.tool()
    async def tool_remove_silence(file_path: str) -> dict:
        """Cut the silent gaps out of a recording.

        FFmpeg silence detection (below -35 dB for 0.6s or longer) → keep the
        spoken segments → one re-encode. Good for tightening a talking-head
        take or a podcast. Removes silence only, not filler words. A source
        with no removable silence comes back unchanged.

        Args:
            file_path: Local video (mp4/mov/mkv/webm/m4v) or audio
                (mp3/wav/m4a/aac/ogg/flac) path.

        Returns:
            {"job_id": str}. Pair with wait_for_job; the result is at
            `output_path` (mp4 for video input, mp3 for audio input).
        """
        return await client.post_file("/api/tools/remove-silence", file_path=file_path)

    @mcp.tool()
    async def tool_translate(
        file_path: str,
        target_language: str,
        mode: Literal["captions_only", "full_dub"] = "captions_only",
        voice_id: str = "",
        caption_style: CaptionStyleId = "viral",
        emoji_style: EmojiStyle = "moderate",
    ) -> dict:
        """Translate a video's speech into captions in another language, and
        optionally dub it.

        Whisper transcribes locally; the translation runs on the user's
        configured AI provider key; captions are burned in locally.

        Modes:
          - "captions_only" — original audio kept, translated captions burned
            on top.
          - "full_dub" — the translation is voiced with Edge TTS (free,
            local), replaces the original audio, and translated captions are
            burned on the dubbed video.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v) with speech.
            target_language: Target language — an ISO-639-1 code ("es",
                "ja") or a language name ("Brazilian Portuguese"). Required.
            mode: "captions_only" (default) or "full_dub".
            voice_id: full_dub only — an Edge TTS voice id that speaks the
                target language (e.g. "es-ES-ElviraNeural"; find one with
                list_tts_voices(provider="edge_tts", locale="es")). Empty
                uses the default multilingual Edge voice.
            caption_style: Built-in caption style id (see list_caption_styles).
            emoji_style: "none" / "minimal" / "moderate" / "heavy".

        Returns:
            {"job_id": str}. Pair with wait_for_job; the translated mp4 is at
            `output_path`.
        """
        target_language = (target_language or "").strip()
        if not target_language:
            raise ValueError("target_language is required")
        return await client.post_file(
            "/api/tools/translate",
            file_path=file_path,
            form={
                "target_language": target_language,
                "mode": mode,
                "voice_id": voice_id,
                "caption_style": caption_style,
                "emoji_style": emoji_style,
            },
        )

    @mcp.tool()
    async def tool_hook_analysis(file_path: str) -> dict:
        """Score the opening hook of a video (1-10) and suggest better openings.

        Whisper transcribes the first 10 seconds locally; the scoring runs on
        the user's configured AI provider key. Analysis only — no file is
        produced. A video with no speech in its first 10 seconds fails.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).

        Returns:
            {"job_id": str}. After wait_for_job the terminal payload's
            `output` is {"score": int 1-10, "verdict": str,
            "issues": [str], "suggested_hooks": [str]} (no `output_path`).
        """
        return await client.post_file("/api/tools/hook-analysis", file_path=file_path)

    @mcp.tool()
    async def tool_voiceover(
        text: str,
        provider: Literal["edge_tts", "openai_tts"] = "edge_tts",
        voice_id: str = "",
        video_path: str = "",
    ) -> dict:
        """Narrate a script with text-to-speech, optionally over a video.

        Args:
            text: Script to voice, 1-10,000 characters.
            provider: "edge_tts" (default — free, local, 300+ voices in 100+
                languages) or "openai_tts" (runs on the user's OpenAI key;
                without one it falls back to Edge TTS and warns).
            voice_id: Voice for the chosen provider — an Edge id like
                "en-US-AvaNeural" or an OpenAI voice like "nova". Call
                list_tts_voices to pick one. Empty uses the provider default.
            video_path: Optional local video (mp4/mov/mkv/webm/m4v). When
                given, its audio is replaced by the narration.

        Returns:
            {"job_id": str}. Pair with wait_for_job; `output_path` is an mp3,
            or an mp4 when video_path was given.
        """
        text = (text or "").strip()
        if not text:
            raise ValueError("text is empty")
        if len(text) > 10_000:
            raise ValueError("text too long (max 10,000 characters)")
        form = {"text": text, "provider": provider}
        if voice_id:
            form["voice_id"] = voice_id
        if video_path:
            return await client.post_file(
                "/api/tools/voiceover",
                file_path=video_path,
                file_field="video",
                form=form,
            )
        return await client.post("/api/tools/voiceover", data=form)

    @mcp.tool()
    async def tool_metadata(
        text: str = "",
        topic: str = "",
        file_path: str = "",
    ) -> dict:
        """Draft SEO metadata (YouTube title, description, tags, TikTok caption).

        Runs on the user's configured AI provider key. Provide at least one
        input:
          - text: a script or transcript (fastest)
          - topic: a bare topic ("AI startup ideas")
          - file_path: a local video — Whisper transcribes it first (local)

        Args:
            text: Script or transcript, up to 20,000 characters.
            topic: Topic string, up to 500 characters.
            file_path: Local video path (mp4/mov/mkv/webm/m4v).

        Returns:
            {"job_id": str}. After wait_for_job, `output.metadata` is
            {"youtube_title", "youtube_description", "tags": [str],
            "tiktok_caption"}; the same JSON is saved at `output_path`.
        """
        if not (text or topic or file_path):
            raise ValueError("Provide one of: text, topic, or file_path")
        if len(text) > 20_000:
            raise ValueError("text too long (max 20,000 characters)")
        if len(topic) > 500:
            raise ValueError("topic too long (max 500 characters)")
        form = {"text": text, "topic": topic}
        if file_path:
            return await client.post_file(
                "/api/tools/metadata", file_path=file_path, form=form,
            )
        return await client.post("/api/tools/metadata", data=form)

    @mcp.tool()
    async def tool_auto_chapters(file_path: str, target_count: int = 0) -> dict:
        """Generate YouTube chapter markers for a long-form video.

        Whisper transcribes locally; grouping the transcript into titled
        chapters runs on the user's configured AI provider key. The first
        chapter always starts at 00:00, as YouTube requires.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).
            target_count: 0 (default) lets the AI pick from the length;
                otherwise 1-20 chapters.

        Returns:
            {"job_id": str}. After wait_for_job, `output.chapters` is
            [{"start_seconds": int, "title": str}, …]; `output_path` is a
            .txt with one "MM:SS Title" line per chapter, ready to paste.
        """
        if not 0 <= target_count <= 20:
            raise ValueError("target_count must be 0-20 (0 = auto)")
        return await client.post_file(
            "/api/tools/auto-chapters",
            file_path=file_path,
            form={"target_count": str(target_count)},
        )

    @mcp.tool()
    async def tool_gif(
        file_path: str,
        fps: int = 15,
        width: int = 540,
        start_seconds: float = 0.0,
        duration_seconds: float = 0.0,
    ) -> dict:
        """Convert a video (or a slice of it) to an animated GIF.

        Local FFmpeg, two-pass palette generation for a smaller file at the
        same visual quality.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).
            fps: 5-30 (default 15).
            width: 240-1080 pixels (default 540); height keeps the ratio.
            start_seconds: Where the GIF starts, >= 0 (default 0).
            duration_seconds: 0-60; 0 (default) means the whole video.

        Returns:
            {"job_id": str}. Pair with wait_for_job; the .gif is at
            `output_path`.
        """
        if not 5 <= fps <= 30:
            raise ValueError("fps must be 5-30")
        if not 240 <= width <= 1080:
            raise ValueError("width must be 240-1080")
        # Written as two-sided ranges so NaN/inf fail too.
        if not 0.0 <= start_seconds < float("inf"):
            raise ValueError("start_seconds must be a number >= 0")
        if not 0.0 <= duration_seconds <= 60.0:
            raise ValueError("duration_seconds must be 0-60 (0 = whole video)")
        return await client.post_file(
            "/api/tools/gif",
            file_path=file_path,
            form={
                "fps": str(fps),
                "width": str(width),
                "start_seconds": str(start_seconds),
                "duration_seconds": str(duration_seconds),
            },
        )

    @mcp.tool()
    async def tool_speed(
        file_path: str,
        speed: float = 1.5,
        keep_pitch: bool = True,
    ) -> dict:
        """Speed up or slow down a video. Local FFmpeg.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).
            speed: 0.25-4.0 (default 1.5). 1.0 is a no-op and is rejected.
            keep_pitch: True (default) keeps voices natural; False shifts the
                pitch with the tempo (chipmunk / slowed effect).

        Returns:
            {"job_id": str}. Pair with wait_for_job; the mp4 is at
            `output_path`.
        """
        if not 0.25 <= speed <= 4.0:
            raise ValueError("speed must be 0.25-4.0")
        if abs(speed - 1.0) < 0.01:
            raise ValueError("speed=1.0 is a no-op — pick another value")
        return await client.post_file(
            "/api/tools/speed",
            file_path=file_path,
            form={"speed": str(speed), "keep_pitch": "true" if keep_pitch else "false"},
        )

    @mcp.tool()
    async def tool_trim(
        file_path: str,
        start_seconds: float,
        end_seconds: float,
    ) -> dict:
        """Keep the [start, end] segment of a local video and drop the rest.

        Local FFmpeg, frame-accurate (re-encoded, not keyframe-snapped). The
        end is clamped to the real duration.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).
            start_seconds: Segment start, >= 0.
            end_seconds: Segment end, at least 0.5s after start_seconds.

        Returns:
            {"job_id": str}. Pair with wait_for_job; the mp4 is at
            `output_path`.
        """
        # Two-sided so NaN fails (it fails every comparison).
        if not 0.0 <= start_seconds < float("inf"):
            raise ValueError("start_seconds must be a number >= 0")
        if not start_seconds < end_seconds < float("inf"):
            raise ValueError("end_seconds must be a number greater than start_seconds")
        if end_seconds - start_seconds < 0.5:
            raise ValueError("trim range must be at least 0.5s")
        return await client.post_file(
            "/api/tools/trim",
            file_path=file_path,
            form={"start_seconds": str(start_seconds), "end_seconds": str(end_seconds)},
        )

    @mcp.tool()
    async def tool_subtitles(
        file_path: str,
        format: Literal["srt", "vtt", "txt"] = "srt",
    ) -> dict:
        """Transcribe a local video into a subtitle or transcript file.

        Whisper (local) → .srt / .vtt cues or a plain .txt transcript. No
        burn-in — to burn captions into the picture use tool_captions. For a
        video that is online and already has captions, tool_transcript is
        much faster.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).
            format: "srt" (default) / "vtt" / "txt".

        Returns:
            {"job_id": str}. Pair with wait_for_job; the file is at
            `output_path`.
        """
        return await client.post_file(
            "/api/tools/subtitles",
            file_path=file_path,
            form={"format": format},
        )

    @mcp.tool()
    async def tool_transcript(
        url: str,
        language: str = "",
        format: Literal["txt", "srt", "vtt"] = "txt",
    ) -> dict:
        """Fetch an online video's EXISTING caption track by URL.

        No download of the video and no transcription — it reads the
        subtitle track the platform already publishes (creator-uploaded,
        else auto-generated), so it takes seconds. A video without a caption
        track fails and says so; it never falls back to transcribing (use
        download_video + tool_subtitles for that).

        Args:
            url: http(s) video URL (YouTube, etc.), up to 2000 characters.
            language: Optional 2-letter ISO code ("en", "ja"). Empty takes
                the video's own language. If the requested language is
                missing, another available track is used and a warning says so.
            format: "txt" (default) / "srt" / "vtt".

        Returns:
            {"job_id": str}. Pair with wait_for_job; the file is at
            `output_path`, and `output` carries {"format", "language",
            "is_auto_generated", "segment_count", "title", "source_url"}.
        """
        url = (url or "").strip()
        if not url.startswith(("http://", "https://")) or len(url) > 2000:
            raise ValueError("url must be an http(s) URL of at most 2000 characters")
        language = (language or "").strip().lower()
        if language and not (len(language) == 2 and language.isalpha() and language.isascii()):
            raise ValueError("language must be a 2-letter code (e.g. 'en') or empty")
        return await client.post(
            "/api/tools/transcript",
            data={"url": url, "language": language, "format": format},
        )

    @mcp.tool()
    async def tool_auto_zoom(
        file_path: str,
        zoom_factor: float = 1.15,
        words_per_group: int = 3,
    ) -> dict:
        """Add subtle zoom "punch-in" pulses on spoken words for energy.

        Whisper word timings (local) drive a smooth zoom on each word group.
        Pairs well after tool_captions. A clip with no clear speech comes
        back unchanged.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).
            zoom_factor: Peak zoom, 1.05-1.4 (default 1.15 = 15%).
            words_per_group: Words per pulse, 1-6 (default 3).

        Returns:
            {"job_id": str}. Pair with wait_for_job; the mp4 is at
            `output_path`.
        """
        if not 1.05 <= zoom_factor <= 1.4:
            raise ValueError("zoom_factor must be 1.05-1.4")
        if not 1 <= words_per_group <= 6:
            raise ValueError("words_per_group must be 1-6")
        return await client.post_file(
            "/api/tools/auto-zoom",
            file_path=file_path,
            form={"zoom_factor": str(zoom_factor), "words_per_group": str(words_per_group)},
        )

    @mcp.tool()
    async def tool_compress(
        file_path: str,
        resolution: Literal["original", "1280x720", "854x480", "640x360", "426x240"] = "original",
        level: Literal["maximum", "high", "medium", "low", "minimal"] = "high",
    ) -> dict:
        """Re-encode a video smaller, for email, chat apps and upload limits.

        Local FFmpeg. Two independent axes: `resolution` scales DOWN to a
        named height ("original" keeps the size and only re-encodes) and
        `level` sets how hard to squeeze. A resolution taller than the source
        keeps the source size — it never upscales.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).
            resolution: "original" (default), "1280x720", "854x480",
                "640x360" or "426x240" — named by height; aspect is kept.
            level: "maximum" (smallest file) / "high" (default) / "medium" /
                "low" / "minimal" (best quality, least saving).

        Returns:
            {"job_id": str}. Pair with wait_for_job; the mp4 is at
            `output_path`, and `output` carries {"input_bytes",
            "output_bytes", "saved_pct", "resolution", "scaled", "level"}.
        """
        return await client.post_file(
            "/api/tools/compress",
            file_path=file_path,
            form={"resolution": resolution, "level": level},
        )

    @mcp.tool()
    async def tool_crop(
        file_path: str,
        x: float,
        y: float,
        w: float,
        h: float,
    ) -> dict:
        """Crop a video to a rectangle. Local FFmpeg.

        The box is NORMALIZED (0-1, origin top-left), independent of the
        source resolution — e.g. a centred square on a 16:9 source is
        x=0.21875, y=0, w=0.5625, h=1. The box is clamped into the frame and
        rounded to even pixels. For automatic vertical framing use
        tool_reframe.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).
            x: Left edge, 0-1 fraction of the source width.
            y: Top edge, 0-1 fraction of the source height.
            w: Box width, greater than 0 and at most 1.
            h: Box height, greater than 0 and at most 1.

        Returns:
            {"job_id": str}. Pair with wait_for_job; the mp4 is at
            `output_path`, and `output` carries the realized pixel rect
            {"width", "height", "x", "y", "source_width", "source_height"}.
        """
        for name, v in (("x", x), ("y", y), ("w", w), ("h", h)):
            if not 0.0 <= v <= 1.0:
                raise ValueError(f"{name} must be between 0 and 1")
        if w <= 0 or h <= 0:
            raise ValueError("w and h must be greater than 0")
        return await client.post_file(
            "/api/tools/crop",
            file_path=file_path,
            form={"x": str(x), "y": str(y), "w": str(w), "h": str(h)},
        )

    @mcp.tool()
    async def tool_transform(
        file_path: str,
        operation: Literal[
            "flip_h", "flip_v", "rotate_cw", "rotate_ccw", "rotate_180",
            "loop", "volume", "mute",
        ],
        amount: str = "",
    ) -> dict:
        """Apply a quick transform to a video: flip, rotate, loop, volume, mute.

        Local FFmpeg.

        Args:
            file_path: Local video path (mp4/mov/mkv/webm/m4v).
            operation: "flip_h" / "flip_v" (mirror), "rotate_cw" /
                "rotate_ccw" (90°), "rotate_180", "loop" (repeat the clip),
                "volume" (scale the audio level), "mute" (drop the audio
                track).
            amount: Only for "loop" — total play count, 2-20 (default 2) —
                and "volume" — a gain multiplier, 0-8 (e.g. "1.5"). Ignored
                for the other operations.

        Returns:
            {"job_id": str}. Pair with wait_for_job; the mp4 is at
            `output_path`.
        """
        return await client.post_file(
            "/api/tools/transform",
            file_path=file_path,
            form={"operation": operation, "amount": str(amount or "")},
        )

    @mcp.tool()
    async def tool_music_visualizer(
        file_path: str,
        style: Literal["waves", "bars", "spectrum"] = "waves",
        palette: Literal["sunset", "ocean", "neon", "mono"] = "sunset",
        aspect: Literal["9:16", "1:1", "16:9"] = "9:16",
    ) -> dict:
        """Turn an audio file into an animated visualizer video synced to it.

        Local FFmpeg. Good for posting a song, podcast clip or voice memo as
        a video.

        Args:
            file_path: Local audio path (mp3/wav/m4a/aac/ogg/flac), max 100 MB.
            style: "waves" (default) / "bars" / "spectrum".
            palette: "sunset" (default) / "ocean" / "neon" / "mono".
            aspect: "9:16" (default) / "1:1" / "16:9".

        Returns:
            {"job_id": str}. Pair with wait_for_job; the mp4 is at
            `output_path`.
        """
        return await client.post_file(
            "/api/tools/music-visualizer",
            file_path=file_path,
            form={"style": style, "palette": palette, "aspect": aspect},
        )

    @mcp.tool()
    async def tool_merge_clips(
        file_paths: list[str],
        target_aspect: Literal["9:16", "16:9", "1:1", "auto"] = "auto",
        transition: Literal["none", "crossfade"] = "none",
    ) -> dict:
        """Stitch 2-10 local video clips into one mp4, in the order given.

        Each clip is centre-cropped to the target aspect and re-encoded to a
        uniform format, then concatenated. Local FFmpeg.

        Args:
            file_paths: 2-10 local video paths (mp4/mov/mkv/webm/m4v), in
                playback order.
            target_aspect: "9:16", "16:9", "1:1", or "auto" (default — the
                FIRST clip's aspect, snapped to the nearest of the three).
            transition: "none" (default, hard cut) or "crossfade".

        Returns:
            {"job_id": str}. Pair with wait_for_job; the merged mp4 is at
            `output_path`.
        """
        if not isinstance(file_paths, list) or len(file_paths) < _MERGE_MIN:
            raise ValueError(f"file_paths must list at least {_MERGE_MIN} clips")
        if len(file_paths) > _MERGE_MAX:
            raise ValueError(f"at most {_MERGE_MAX} clips per merge")
        return await _post_multi_files(
            "/api/tools/merge-clips",
            "files",
            file_paths,
            {"target_aspect": target_aspect, "transition": transition},
        )

    @mcp.tool()
    async def tool_download_result(job_id: str, output_path: str = "",
                                   overwrite: bool = False) -> dict:
        """Copy the output file of a finished tool job to a local path.

        Usually unnecessary: wait_for_job already reports the file's location
        as `output_path`. Use this to land a copy at a path of your choosing.
        Call only after the job's status is "success". Jobs whose result is
        data rather than a file (tool_hook_analysis) have nothing to download.

        Args:
            job_id: Job id returned by a tool_* call.
            output_path: Destination path. Empty saves to
                DATA_DIR/storage/tools-out/<job_id><ext>, with the extension
                of the actual output (.mp4, .gif, .srt, .json, …).
            overwrite: Replace a file already at output_path. Default False —
                an existing file is refused, so a typo can't destroy user data.

        Returns:
            {"output_path": str, "size_bytes": int, "content_type": str}.
        """
        if not re.fullmatch(r"[A-Za-z0-9_-]+", job_id or ""):
            raise ValueError(f"Invalid job_id {job_id!r}")
        if output_path:
            target = Path(output_path).expanduser().resolve()
            if target.is_dir():
                raise ValueError(f"{target} is a directory — give a file path")
            if target.exists() and not overwrite:
                raise ValueError(f"{target} already exists — pass overwrite=True "
                                 "to replace it, or choose another path.")
            output_path = str(target)
        if not output_path:
            meta = await client.get(f"/api/tools/download-meta/{job_id}")
            if not meta.get("ready"):
                why = meta.get("status") or meta.get("reason") or "not ready"
                raise ValueError(f"Job {job_id} has no downloadable output ({why})")
            ext = meta.get("ext") or ".mp4"
            output_path = str(settings.STORAGE_ROOT / "tools-out" / f"{job_id}{ext}")
        return await client.stream_to_file(
            "GET",
            f"/api/tools/download/{job_id}",
            output_path=output_path,
        )
