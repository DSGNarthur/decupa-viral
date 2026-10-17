# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Job orchestration — status, polling, cancel.

Every long-running ViralMint operation (scout, download, analyze, generate,
tool runs) returns a job_id immediately and runs as a background task. These
tools let an MCP client follow a job to completion without a WebSocket.

The headline tool is `wait_for_job`: it polls /api/jobs/{id} until the job is
terminal, so the model doesn't have to drive a sleep-and-poll loop itself
(which models do inconsistently).
"""
from __future__ import annotations

import logging

from fastmcp import FastMCP

from backend.mcp import client
from backend.mcp.wait import wait_for_job_terminal

logger = logging.getLogger(__name__)


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_job_status(job_id: str) -> dict:
        """Get the current status of a background job.

        Do NOT use this in a poll loop — call `wait_for_job` instead,
        which blocks until terminal and saves you the polling cadence
        decision (it picks a sensible 2s interval).

        Reach for get_job_status only when:
        - You want a SINGLE status snapshot (e.g. "is job X done?")
        - You're building parallel-fan-out logic where wait_for_job's
          synchronous wait would serialize what should be concurrent

        Returns the job row with status, progress_pct, current_step and
        — once the job has reached a terminal state — output_json with
        the produced artifacts (a "file" path, downloaded_video_id,
        generated_video_id, etc.).

        Args:
            job_id: Job UUID from any start_* tool.

        Returns:
            {
                "id": str, "job_type": str,
                "status": "pending" | "running" | "success" | "failed" | "cancelled",
                "progress_pct": float, "current_step": str,
                "output_json": str | None,  // JSON-serialized result payload
                "error_message": str | None,
                "runner_active": bool,  // work still executing — can stay
                                        // true after a cancel until the
                                        // in-flight step returns
                "started_at": str | None, "completed_at": str | None,
            }
        """
        return await client.get(f"/api/jobs/{job_id}")

    @mcp.tool()
    async def wait_for_job(
        job_id: str,
        timeout_seconds: int = 1800,
        poll_interval_seconds: float = 2.0,
    ) -> dict:
        """Block until a job reaches a terminal state (success/failed/cancelled).

        Polls /api/jobs/{id} at `poll_interval_seconds` and returns the
        final job row. The LLM should call this after every start_* tool
        unless it has a reason to fire-and-forget.

        Args:
            job_id: Job UUID.
            timeout_seconds: Give up after this many seconds. Default
                1800 (30 min) — long renders and long-video transcription
                can take well over 10 minutes.
            poll_interval_seconds: Seconds between status checks.
                Default 2.0. Lower = snappier completion detection at
                the cost of more requests; 2.0 is the sweet spot for
                most jobs.

        Returns:
            The final job dict — same shape as get_job_status PLUS two
            convenience fields decoded from output_json on terminal
            arrival:
              - `output`: dict of the parsed output_json payload
                (empty / absent when no output_json was written).
              - `output_path`: absolute file path of the produced
                artifact, when the job wrote one (tool jobs and video
                generation). Absent for
                jobs whose result is structured data instead of a file
                (e.g. tool_hook_analysis).
            With `output_path` populated, an LLM usually has no need to
            call tool_download_result — the bytes are already on the
            local filesystem at that path.

            On timeout the call does NOT raise — it returns a snapshot
            of the job's current state with these fields:
              - `status`: the live status at the moment we gave up
                (typically "running"). Do NOT confuse this with
                "failed" — the job is still progressing in the backend.
              - `timed_out_after_seconds`: how long we waited.
              - `message`: human-readable hint about what to do next
                (re-poll via get_job_status, or cancel via cancel_job).
            This shape lets the LLM distinguish "really failed" from
            "we stopped waiting". Check `status` first; treat anything
            other than "failed" / "cancelled" as still in progress.
        """
        try:
            return await wait_for_job_terminal(
                job_id,
                timeout_seconds=timeout_seconds,
                poll_interval_seconds=poll_interval_seconds,
            )
        except TimeoutError:
            # Re-fetch the live job state — the job keeps running in
            # the backend after we give up waiting. Return it with a
            # timed_out marker so the LLM doesn't conflate "we got
            # bored" with "the job actually failed".
            snapshot = await client.get(f"/api/jobs/{job_id}")
            snapshot["timed_out_after_seconds"] = timeout_seconds
            snapshot["message"] = (
                f"Still in progress after {timeout_seconds}s. "
                f"Re-check with get_job_status({job_id!r}) or stop it "
                f"with cancel_job({job_id!r}). The status field reflects "
                f"the live state — do not treat 'running' as a failure."
            )
            return snapshot

    @mcp.tool()
    async def list_jobs(
        status: str | None = None,
        job_type: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> dict:
        """List background jobs, newest first.

        Args:
            status: Filter to "pending", "running", "success", "failed"
                or "cancelled" — or a comma-separated list of them
                ("running,pending").
            job_type: Filter to one job type, e.g. "scout", "download",
                "analyze", "generate", "clip_extraction", or a single-purpose
                tool's "tool:<name>" (e.g. "tool:captions").
            limit: Page size (default 20).
            offset: Pagination offset.

        Returns:
            {"total": int, "jobs": [...]}
        """
        params: dict = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status
        if job_type:
            params["job_type"] = job_type
        return await client.get("/api/jobs", params=params)

    @mcp.tool()
    async def cancel_job(job_id: str) -> dict:
        """Cancel a running job or delete a completed one.

        For running jobs the row flips to "cancelled" IMMEDIATELY, and the
        runner stops at its next phase boundary — cancellation is cooperative,
        not pre-emptive. Work already in flight (an ffmpeg pass, a yt-dlp
        transfer) runs to completion because it cannot be interrupted, so a
        large download may still finish and land in the Library after this
        returns, and the job stays "cancelled". Anything
        that had not started is skipped. For terminal jobs this removes the
        row from the activity log.

        A terminal job that PRODUCED A FILE is refused with HTTP 409: that row
        is the Library item for its output, so removing it would hide the
        user's file from the Library while leaving the bytes on disk. Delete
        the asset itself instead — that removes the row and the file together.

        Args:
            job_id: Job UUID.

        Returns:
            {"cancelled": bool, "best_effort": bool, "message": str,
             "detail": str} — or an error envelope carrying the 409 message
            when the job backs a Library file.
            `best_effort` is true when the job was RUNNING: the row is
            cancelled and no further step starts, but work already in flight
            finishes on its own and may still produce a file minutes later.
            The status reads "cancelled" at once, so do not wait on it:
            call wait_for_job (it waits for the in-flight work to end) or
            poll get_job_status until `runner_active` is false before
            starting a replacement, or you will end up with a duplicate.
            `best_effort` is false when the job was still pending — nothing
            had started, and it never will, so the cancel is complete.
            Deleting a terminal job returns {"message": "Job deleted"}.
        """
        return await client.delete(f"/api/jobs/{job_id}")
