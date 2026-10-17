# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Shared job-wait helper — single source of truth for terminal-status
detection and the output-payload shape MCP tools return after a job
finishes.

On a terminal job it parses `output_json` once and adds:
  * `output` — the decoded dict
  * `output_path` — the artifact a job produced. Tool runners write
    output["file"]; the `generate` runners write only a
    `generated_video_id`, which is resolved to its video_path. So the
    agent never has to JSON-decode output_json, nor make a second call,
    to find the file.

Jobs whose output is the result itself (hook analysis, metadata) still get
`output`; `output_path` stays absent for them.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from backend.mcp import client

logger = logging.getLogger(__name__)

# Terminal statuses — anything else means the job is still in flight.
# Kept here (not in orchestration.py) so any tool module can import it
# without pulling in another module's registration closure.
TERMINAL_STATUSES: frozenset[str] = frozenset({"success", "failed", "cancelled"})


def _enrich(job: dict) -> dict:
    """Decode output_json into a flat `output` dict + (when applicable)
    an `output_path` string, so the LLM can read the artifact path
    without parsing JSON itself.

    Non-destructive: the original job row is returned with the two new
    keys added; nothing existing is removed or rewritten.
    """
    raw = job.get("output_json")
    if not raw:
        return job
    try:
        parsed: dict[str, Any] = json.loads(raw)
        if not isinstance(parsed, dict):
            return job
    except (ValueError, TypeError):
        return job

    enriched = dict(job)
    enriched["output"] = parsed
    # Tool jobs (run_tool_*) write {"file": "<absolute path>"} into
    # output_json via _tool_success. Surface that path directly so the
    # LLM doesn't have to call tool_download_result just to learn the
    # location — the bytes are already on local disk.
    file_path = parsed.get("file")
    if isinstance(file_path, str) and file_path:
        enriched["output_path"] = file_path
    return enriched


async def _resolve_generated_path(job: dict) -> dict:
    """Populate `output_path` for the `generate` jobs that never carry a file.

    The generation paths (Smart Video's `/generate/stock` and its siblings)
    record their result as a GeneratedVideo ROW and write only
    `{"generated_video_id": ...}` into output_json — never "file". Resolving
    the id here keeps ONE answer to "where is the artifact?" for every job.

    Additive and best-effort: a field that was always absent becomes present,
    nothing existing changes, and any failure leaves the job exactly as it was
    — a missing convenience field must never turn a finished job into an error.
    """
    if job.get("output_path"):
        return job
    gv_id = (job.get("output") or {}).get("generated_video_id")
    if not isinstance(gv_id, str) or not gv_id:
        return job
    try:
        video = await client.get(f"/api/videos/{gv_id}")
        path = (video or {}).get("video_path")
        if isinstance(path, str) and path:
            enriched = dict(job)
            enriched["output_path"] = path
            return enriched
    except Exception as e:  # noqa: BLE001
        logger.debug("could not resolve generated_video %s to a path: %s", gv_id, e)
    return job


async def wait_for_job_terminal(
    job_id: str,
    timeout_seconds: int,
    poll_interval_seconds: float = 2.0,
) -> dict:
    """Poll /api/jobs/{job_id} until it reaches a terminal status.

    Returns the final job dict enriched with `output` (decoded
    output_json) and, when the runner produced a file, `output_path`.

    A CANCELLED job is only returned once its runner has stopped
    (`runner_active` false): a cancel flips the status to terminal at once,
    but an in-flight transfer or ffmpeg pass keeps running and may still
    land a file. Returning on the status alone made the documented "wait,
    don't start a duplicate" advice impossible to follow.

    Raises TimeoutError if the deadline elapses before the job is
    terminal.
    """
    deadline = asyncio.get_event_loop().time() + timeout_seconds
    while True:
        status = await client.get(f"/api/jobs/{job_id}")
        draining = status.get("status") == "cancelled" and status.get("runner_active")
        if status.get("status") in TERMINAL_STATUSES and not draining:
            return await _resolve_generated_path(_enrich(status))
        if asyncio.get_event_loop().time() > deadline:
            raise TimeoutError(
                f"Job {job_id} still running after {timeout_seconds}s "
                f"(status: {status.get('status')}, "
                f"step: {status.get('current_step')})."
            )
        await asyncio.sleep(poll_interval_seconds)
