# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Self-HTTP client for MCP tools.

Why HTTP-to-self instead of importing the services in-process:

  - **Scales with new routers.** Every time we add a new /api/X endpoint
    in the future, an MCP tool can wrap it without learning the internal
    service module's import path or signature.
  - **Reuses middleware.** CSRF, auth-token caching, rate limits and any
    future request-level checks run for MCP calls the same way they run
    for the UI. No risk of MCP bypassing a guard that was added for the
    UI path.
  - **Stable contract.** The REST API is the public contract; service
    signatures aren't. An MCP tool that posts to /api/scout/start stays
    correct even when the underlying scout_service.py is refactored.

Cost: one TCP-loopback round-trip per tool call (~0.5-1ms). Negligible
for the tools we expose — they're either fast metadata reads or
job-creation calls that return a job_id in <100ms.

Origin header: the CSRF allowlist (backend/core/origins.py) includes the
address this client dials, so it sets that as Origin on every request and
state-changing tool calls pass the check. In LAN mode (HOST=0.0.0.0) the
check is skipped anyway.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

_client: Optional[httpx.AsyncClient] = None


def self_host() -> str:
    """The address a same-machine caller should dial to reach this server.

    HOST=0.0.0.0 (LAN mode) is a BIND address, not a destination — dialing
    it fails on Windows — so a wildcard bind is reached over loopback. A
    concrete bind (127.0.0.1, or a specific LAN IP) is dialed as-is: the
    server isn't listening on loopback when it was bound to 192.168.1.5.
    """
    host = settings.HOST
    if host in ("0.0.0.0", "::", ""):
        return "127.0.0.1"
    return host


def _base_url() -> str:
    return f"http://{self_host()}:{settings.PORT}"


def get_self_client() -> httpx.AsyncClient:
    """Return a singleton AsyncClient pinned to the local backend.

    Lazy-initialized so the import order doesn't matter (MCP tools
    import this module but the FastAPI app might not be bound to its
    port yet at import time).

    Timeout: 300s read, 10s connect. Long-running work (downloads,
    generation, tool runs) dispatches as a job and returns a job_id at
    once, so the read timeout only guards against socket hangs and slow
    synchronous calls. 300s stays under the ~5-minute idle limit MCP
    clients enforce upstream; the 10s connect timeout covers a backend
    that is still starting up.
    """
    global _client
    if _client is None:
        base = _base_url()
        _client = httpx.AsyncClient(
            base_url=base,
            timeout=httpx.Timeout(300.0, connect=10.0),
            headers={
                # Required for the CSRF middleware allowlist
                # (backend/main.py: csrf_origin_check).
                "Origin": base,
                "User-Agent": "ViralMint-MCP/1.0",
            },
        )
        logger.debug("MCP self-HTTP client initialized at %s", base)
    return _client


async def close_self_client() -> None:
    """Tear down the singleton — call from the FastAPI shutdown lifespan."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
        logger.debug("MCP self-HTTP client closed")


# Structured error envelopes per HTTP status. Returned as JSON in the
# exception message so the LLM can parse it deterministically rather
# than regex-extracting hints from prose. Shape:
#   {error_code, message, suggested_action, retryable, status, detail}
# error_code is stable across releases — agents can branch on it; message
# and suggested_action are the human-facing strings.
_STATUS_TO_CODE: dict[int, str] = {
    400: "bad_request",
    401: "not_authenticated",
    402: "quota_exhausted",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    500: "backend_error",
    502: "upstream_error",
    503: "service_unavailable",
    504: "upstream_timeout",
}

_STATUS_TO_ACTION: dict[int, str] = {
    400: "Check the arguments against the tool's docstring.",
    401: "An API key is missing or was rejected — ask the user to check Settings → AI Provider in ViralMint.",
    402: "The user's AI provider reported a billing/quota problem — tell the user; retrying will fail the same way.",
    403: "Inspect the detail field for the specific reason.",
    404: "Verify the id exists by calling the relevant list_* tool first.",
    409: "Refresh state with a list_* / get_* call and retry only if the conflict resolves.",
    422: "Fix the arguments to match the endpoint's schema, then retry.",
    429: "Wait 5-10s and retry; if persistent, lower the request rate.",
    500: "Retry once; if it persists, surface the error to the user and stop.",
    502: "Retry in 10-30s — usually transient on the upstream side.",
    503: "Wait ~10s and retry; the backend may be starting up.",
    504: "Retry with a smaller / simpler request, or split the work.",
}

# Statuses where a retry is reasonable without changing the request.
_RETRYABLE: set[int] = {429, 500, 502, 503, 504}


# A rejected or missing provider key reaches us as whatever status the endpoint
# chose for "it failed" — often a 500 wrapping the SDK's 401 text. Read as a
# 500 it says "retry once", which can never help: the user has to fix a key.
_AI_KEY_PATTERN = re.compile(
    r"authentication_error|invalid[ _-]?(x-)?api[ _-]?key|incorrect api key|"
    r"no ai provider|api key (is )?(missing|not (set|configured))|"
    r"error code: 401",
    re.IGNORECASE,
)


def _build_error_envelope(method: str, path: str, status: int, body: str) -> str:
    """Pack an error into a JSON-formatted message for httpx.HTTPStatusError.

    Tools let the exception propagate; FastMCP serializes the message
    to the LLM. JSON is the lowest-friction shape for an LLM to parse
    deterministically — no regex on prose, no order-dependent fields.
    """
    envelope = {
        "error_code": _STATUS_TO_CODE.get(status, "http_error"),
        "message": f"{method} {path} returned {status}",
        "suggested_action": _STATUS_TO_ACTION.get(
            status, "Inspect the detail field and decide whether to retry."
        ),
        "retryable": status in _RETRYABLE,
        "status": status,
        "detail": body[:1000],
    }
    if status != 401 and _AI_KEY_PATTERN.search(body or ""):
        envelope["error_code"] = "ai_key_problem"
        envelope["retryable"] = False
        envelope["suggested_action"] = (
            "The AI provider key is missing or was rejected. Tell the user to "
            "check Settings → AI Provider in ViralMint — retrying will fail the same way.")
    return json.dumps(envelope, ensure_ascii=False)


async def _request(method: str, path: str, **kwargs) -> dict:
    """Internal helper: issue a request, raise on HTTP error, return JSON.

    Tool wrappers should call this rather than .get/.post directly so we
    have one place to add tracing / retry / error normalization later.
    """
    client = get_self_client()
    resp = await client.request(method, path, **kwargs)
    # 4xx/5xx → raise httpx.HTTPStatusError carrying a JSON error
    # envelope as its message. Tools let this propagate; FastMCP
    # surfaces the message verbatim to the LLM, which can json.loads()
    # it to recover {error_code, suggested_action, retryable, ...}.
    if resp.status_code >= 400:
        message = _build_error_envelope(method, path, resp.status_code, resp.text)
        raise httpx.HTTPStatusError(
            message,
            request=resp.request,
            response=resp,
        )
    if not resp.content:
        return {}
    return resp.json()


async def get(path: str, **kwargs) -> dict:
    return await _request("GET", path, **kwargs)


async def post(path: str, **kwargs) -> dict:
    return await _request("POST", path, **kwargs)


async def put(path: str, **kwargs) -> dict:
    return await _request("PUT", path, **kwargs)


async def patch(path: str, **kwargs) -> dict:
    return await _request("PATCH", path, **kwargs)


async def delete(path: str, **kwargs) -> dict:
    return await _request("DELETE", path, **kwargs)


async def post_file(
    path: str,
    file_path: str,
    *,
    file_field: str = "file",
    form: dict | None = None,
    extra_files: dict[str, str] | None = None,
    timeout: float = 600.0,
) -> dict:
    """POST a local file as multipart/form-data to a backend endpoint.

    Used by Tools-page wrappers (captions, reframe, audio-enhance, …)
    where the FastAPI handler expects an UploadFile parameter. Reads
    the file in chunks via httpx's file streaming so we don't pull
    multi-GB videos fully into memory.

    Args:
        path: Backend route (e.g. "/api/tools/captions").
        file_path: Local filesystem path to the file to upload.
            Both absolute and ~-expanded paths supported. Existence is
            checked before the request so the error is "File not found:
            X" rather than a confusing httpx send error.
        file_field: Form field name the endpoint expects. Most Tools
            endpoints use "file"; watermark uses "file"+"logo".
        form: Extra form fields to send alongside the file (e.g.
            {"style": "viral", "emoji_style": "moderate"}).
        extra_files: Additional {field_name: local_path} files to
            include in the same multipart upload. Used by /watermark
            which needs both video + logo in one POST.
        timeout: Per-request timeout — large uploads can take minutes
            on slow disks.

    Returns:
        Decoded JSON response.

    Raises:
        FileNotFoundError: file_path doesn't exist.
        httpx.HTTPStatusError: backend returned 4xx/5xx; body is wrapped
            in a structured error envelope (see _build_error_envelope).
    """
    from contextlib import ExitStack
    from pathlib import Path
    p = Path(file_path).expanduser().resolve()
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {p}")

    client = get_self_client()
    # ExitStack lets us open primary + every extra file in one block
    # and guarantees all handles close even if the request raises.
    with ExitStack() as stack:
        fh = stack.enter_context(p.open("rb"))
        files: dict = {file_field: (p.name, fh)}
        for field, extra_path in (extra_files or {}).items():
            ep = Path(extra_path).expanduser().resolve()
            if not ep.is_file():
                raise FileNotFoundError(f"File not found: {ep}")
            efh = stack.enter_context(ep.open("rb"))
            files[field] = (ep.name, efh)
        resp = await client.post(
            path,
            files=files,
            data=form or {},
            timeout=timeout,
        )
    if resp.status_code >= 400:
        raise httpx.HTTPStatusError(
            _build_error_envelope("POST", path, resp.status_code, resp.text),
            request=resp.request,
            response=resp,
        )
    if not resp.content:
        return {}
    return resp.json()


async def stream_to_file(
    method: str,
    path: str,
    output_path: str,
    *,
    json_body: dict | None = None,
    params: dict | None = None,
    timeout: float = 600.0,
) -> dict:
    """Stream a binary HTTP response to disk and return the saved path.

    Used by tools whose backend endpoints return a file directly
    rather than a JSON {path: ...} envelope — export_video (POST), and
    tool_download_result (GET). The MCP transport can't carry the
    binary itself, so the tool's job is to land the bytes on disk and
    surface the path to the LLM.

    Args:
        method: "GET" or "POST".
        path: Backend route.
        output_path: Local destination. Parent dirs created as needed.
        json_body: JSON body (POST only).
        params: Query string params.
        timeout: Per-request timeout. Renders can take minutes.

    Returns:
        {"output_path": <resolved path>, "size_bytes": int,
         "content_type": str}

    Raises:
        httpx.HTTPStatusError: 4xx/5xx (body included in message).
    """
    from pathlib import Path
    out = Path(output_path).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    client = get_self_client()
    request_kwargs: dict = {"timeout": timeout}
    if params is not None:
        request_kwargs["params"] = params
    if method.upper() == "POST":
        request_kwargs["json"] = json_body or {}

    async with client.stream(method.upper(), path, **request_kwargs) as resp:
        if resp.status_code >= 400:
            body = (await resp.aread()).decode("utf-8", errors="replace")
            raise httpx.HTTPStatusError(
                _build_error_envelope(method.upper(), path, resp.status_code, body),
                request=resp.request,
                response=resp,
            )
        size = 0
        ctype = resp.headers.get("content-type", "application/octet-stream")
        with out.open("wb") as f:
            async for chunk in resp.aiter_bytes(chunk_size=1024 * 1024):
                f.write(chunk)
                size += len(chunk)
    return {
        "output_path": str(out),
        "size_bytes": size,
        "content_type": ctype,
    }
