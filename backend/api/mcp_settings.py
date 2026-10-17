# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""MCP (Model Context Protocol) connection endpoints — back the /mcp page.

    GET   /api/settings/mcp         → token + endpoint URL + per-client snippets
    POST  /api/settings/mcp/test    → initialize + list_tools against our own
                                      /mcp, returns ok + tools_count
    POST  /api/settings/mcp/rotate  → new token (invalidates existing configs)
    GET   /api/settings/mcp/tools   → name + one-line summary of every tool
                                      (no secret — open to every caller)

Who can read the token: only a caller on THIS machine. The token endpoints
refuse any non-loopback client, so in LAN mode (HOST=0.0.0.0) a phone on the
WiFi can use the rest of the UI but can't fetch the token. That matters
because the token is worth more than the UI it would otherwise share an
exposure with: the file-path tools (tool_*, import_local_video) read files
from the machine the server runs on, which no /api route does. A user who
WANTS a remote MCP client copies the token over deliberately.
"""
from __future__ import annotations

import ipaddress

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.config import settings as app_settings
from backend.mcp.client import self_host

router = APIRouter()


def require_same_machine(request: Request) -> None:
    """403 unless the caller is on this machine (a loopback peer address)."""
    host = request.client.host if request.client else ""
    try:
        local = ipaddress.ip_address(host).is_loopback
    except ValueError:
        local = False  # not an IP — not a peer we can vouch for
    if not local:
        raise HTTPException(
            status_code=403,
            detail=("The MCP token is only shown on the computer running "
                    "ViralMint — open this page there."),
        )


def mcp_endpoint_url() -> str:
    """The /mcp URL an MCP client on THIS machine should use.

    A wildcard bind (LAN mode) is dialed over loopback — `http://0.0.0.0/…`
    is not a destination on every OS.
    """
    return f"http://{self_host()}:{app_settings.PORT}/mcp/"


def _toml_basic_string(value: str) -> str:
    """Quote a value as a TOML basic string (escaping what the spec requires).

    Our token is url-safe base64 so nothing here ever fires today — but the
    token generator is one `secrets` call away from changing, and a raw
    backslash or quote would silently corrupt the user's config.toml.
    """
    escaped = (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )
    return f'"{escaped}"'


CODEX_TOML_HEADER = "[mcp_servers.viralmint]"


def _codex_toml_block(endpoint: str, token: str) -> str:
    """The `[mcp_servers.viralmint]` block for Codex's ~/.codex/config.toml.

    ONE source for both the paste-snippet and the one-click installer
    — a Codex config the Setup tab shows but the installer
    writes differently is exactly how a user ends up debugging our bug.

    Why a static `http_headers` entry and not the CLI: `codex mcp add`
    supports `--url` but has NO `--header` flag — its only auth options are
    `--bearer-token-env-var` (an env var we can't set in the user's shell)
    and OAuth (which we don't speak). `http_headers` takes literal values,
    so the TOML block is the only way to hand Codex our loopback token.
    """
    return (
        f"{CODEX_TOML_HEADER}\n"
        f"url = {_toml_basic_string(endpoint)}\n"
        f'http_headers = {{ "Authorization" = {_toml_basic_string("Bearer " + token)} }}\n'
    )


def _build_mcp_config_snippets(token: str) -> dict:
    """Render the per-client config snippets users paste into their MCP client.

    ViralMint's MCP server is HTTP-streamable and Bearer-token gated. That trio decides what each client can do:
      - Clients with native HTTP-MCP support (Claude Code, Cursor, Windsurf,
        Gemini CLI) take a URL + an Authorization header directly — only the
        JSON KEY NAMES differ between them (url vs serverUrl vs httpUrl).
        Hence one entry per client with the exact shape that client expects,
        verified against each client's 2026 docs.
      - Claude Desktop's spawner is stdio-only, so it can't speak HTTP MCP
        directly — it goes through the npm `mcp-remote` proxy instead.
      - Codex (OpenAI) also takes a URL + static header, but its config is
        TOML (~/.codex/config.toml), not JSON — hence format "toml".
      - Cloud assistants (ChatGPT on the web, etc.) are deliberately
        omitted: they reject http://127.0.0.1 as an unsafe URL and need a
        public HTTPS tunnel, which isn't something we can hand the user as
        a paste-able snippet. Codex is NOT in that bucket — it runs locally
        (CLI / IDE extension / desktop app) and reaches loopback fine.

    Returns the token-interpolated `clients` list the /mcp page renders as
    tabs, plus `endpoint_url`.
    """
    import json as _json

    endpoint = mcp_endpoint_url()
    auth = f"Authorization: Bearer {token}"

    claude_code_add = (
        f'claude mcp add viralmint --transport http {endpoint} '
        f'--header "{auth}"'
    )
    # The Claude Code tab shows the full remove-remove-add sequence rather
    # than a bare `add`. `claude mcp add` of an existing name silently fails
    # with "already exists", and an entry can live in either the local OR
    # user scope — so the two scoped removes (no-ops on a fresh install,
    # safe to run blind) guarantee the add lands. This same sequence is what
    # users re-run after rotating the token, which is why we no longer need
    # a separate post-rotate cleanup banner.
    claude_code_setup = (
        'claude mcp remove "viralmint" -s local\n'
        'claude mcp remove "viralmint" -s user\n'
        + claude_code_add
    )
    claude_desktop = {
        "mcpServers": {
            "viralmint": {
                "command": "npx",
                "args": ["-y", "mcp-remote", endpoint, "--header", auth],
            }
        }
    }

    def _pretty(obj: dict) -> str:
        return _json.dumps(obj, indent=2)

    # Each client's native remote-server shape. The header value is the same
    # everywhere; only the wrapping keys change.
    headers = {"Authorization": f"Bearer {token}"}
    clients = [
        {
            "id": "claude_code",
            "label": "Claude Code",
            "format": "shell",
            "snippet": claude_code_setup,
            "instructions": (
                "Run these three lines in your terminal — the two removes "
                "clear any stale entry (no-ops on a fresh install), then add "
                "registers ViralMint in ~/.claude/. Re-run the same three "
                "lines after rotating the token. Verify with `claude mcp list`."
            ),
            "docs_url": "https://docs.claude.com/en/docs/claude-code/mcp",
        },
        {
            "id": "claude_desktop",
            "label": "Claude Desktop",
            "format": "json",
            "snippet": _pretty(claude_desktop),
            "instructions": (
                "Paste under the mcpServers key in "
                "~/Library/Application Support/Claude/claude_desktop_config.json "
                "(macOS) or %APPDATA%\\Claude\\claude_desktop_config.json "
                "(Windows), then restart Claude Desktop. Needs npx (Node.js) on "
                "PATH — Claude Desktop is stdio-only, so it reaches us through "
                "the mcp-remote proxy."
            ),
            "docs_url": "https://modelcontextprotocol.io/quickstart/user",
        },
        {
            "id": "codex",
            "label": "OpenAI Codex",
            "format": "toml",
            "snippet": _codex_toml_block(endpoint, token),
            "instructions": (
                "Paste into ~/.codex/config.toml (add the file if it doesn't "
                "exist), then restart Codex. Works for the Codex CLI, the IDE "
                "extension and the desktop app — they all read this file. "
                "`codex mcp add` can't be used here: it has no --header flag, "
                "so it can't carry ViralMint's local token. Verify with "
                "`codex mcp list`."
            ),
            "docs_url": "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
        },
        {
            "id": "cursor",
            "label": "Cursor",
            "format": "json",
            "snippet": _pretty({
                "mcpServers": {
                    "viralmint": {"url": endpoint, "headers": headers}
                }
            }),
            "instructions": (
                "Paste into ~/.cursor/mcp.json (global) or .cursor/mcp.json "
                "(project), then toggle it on in Cursor Settings → MCP."
            ),
            "docs_url": "https://docs.cursor.com/context/model-context-protocol",
        },
        {
            "id": "windsurf",
            "label": "Windsurf",
            "format": "json",
            "snippet": _pretty({
                "mcpServers": {
                    "viralmint": {"serverUrl": endpoint, "headers": headers}
                }
            }),
            "instructions": (
                "Paste into ~/.codeium/windsurf/mcp_config.json — note the key "
                "is \"serverUrl\", not \"url\" — then fully quit and reopen "
                "Windsurf (Cascade only reloads MCP on restart)."
            ),
            "docs_url": "https://docs.windsurf.com/windsurf/cascade/mcp",
        },
        {
            "id": "gemini_cli",
            "label": "Gemini CLI",
            "format": "json",
            "snippet": _pretty({
                "mcpServers": {
                    "viralmint": {"httpUrl": endpoint, "headers": headers}
                }
            }),
            "instructions": (
                "Paste under the mcpServers key in ~/.gemini/settings.json — "
                "note the key is \"httpUrl\", not \"url\"."
            ),
            "docs_url": "https://geminicli.com/docs/tools/mcp-server/",
        },
    ]

    return {
        "endpoint_url": endpoint,
        "clients": clients,
    }


@router.get("/settings/mcp", dependencies=[Depends(require_same_machine)])
async def get_mcp_config():
    """Return the MCP token + endpoint + ready-to-paste config snippets."""
    from backend.mcp.token import get_or_create_mcp_token
    token = get_or_create_mcp_token()
    return {
        "token": token,
        **_build_mcp_config_snippets(token),
    }


@router.post("/settings/mcp/test", dependencies=[Depends(require_same_machine)])
async def test_mcp_connection():
    """Do an end-to-end self-test of the local MCP endpoint.

    Drives the official mcp client through the same handshake Claude
    Code uses: initialize → list_tools. Returns the live tool count
    on success so the UI can surface "✓ N tools available" rather
    than a vague "OK". Surfaces the exception class on failure so
    the UI can show something the user can act on (token mismatch
    vs network vs protocol error).
    """
    from backend.mcp.token import get_or_create_mcp_token
    try:
        from mcp.client.streamable_http import streamablehttp_client
        from mcp import ClientSession
    except ImportError:
        return {
            "ok": False,
            "error": "mcp client library not installed",
            "detail": "fastmcp is missing — run `pip install -r requirements.txt`",
        }
    token = get_or_create_mcp_token()
    endpoint = mcp_endpoint_url()
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with streamablehttp_client(endpoint, headers=headers) as (
            read,
            write,
            _,
        ):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = await session.list_tools()
                return {
                    "ok": True,
                    "tools_count": len(tools.tools),
                    "tool_names": [t.name for t in tools.tools],
                    "endpoint_url": endpoint,
                }
    except BaseException as e:
        # Don't leak the internal traceback to the UI — just enough
        # detail for the user to know what to try next. Catch
        # BaseException (not Exception) because the mcp client wraps
        # failures in anyio's TaskGroup, which raises BaseExceptionGroup
        # — and a bare `except Exception` would let that propagate as
        # a 500 instead of letting us surface the inner cause.
        inner = _unwrap_exception_group(e)
        return {
            "ok": False,
            "error": type(inner).__name__,
            "detail": str(inner)[:300],
            "endpoint_url": endpoint,
        }


def _unwrap_exception_group(eg):
    """Walk into nested ExceptionGroups to find the innermost real cause.

    The `mcp` client library runs requests inside an anyio TaskGroup,
    which wraps every failure in a BaseExceptionGroup. The wrapper's
    own str is the unhelpful "unhandled errors in a TaskGroup
    (N sub-exceptions)" — surfacing that to users hides the actual
    error (a 401, a network timeout, a JSON decode failure, etc.)
    and makes every failure look identical.

    Strategy: collect every LEAF exception (depth-first), drop any
    cancellation siblings (anyio cancels peer tasks when one fails;
    those CancelledErrors are noise, not the cause), and surface the
    first survivor. When ALL leaves are cancellations we fall back to
    the first cancellation so the caller still gets something
    actionable rather than the unwrapped group.

    The previous implementation walked only `.exceptions[0]` blindly,
    which was correct in the 1-sub-exception case but lost the real
    cause when anyio's TaskGroup carried two siblings (a CancelledError
    + the real failure) in unpredictable order.
    """
    import asyncio

    def _leaves(node):
        subs = getattr(node, "exceptions", None)
        if not subs:
            yield node
            return
        for s in subs:
            yield from _leaves(s)

    all_leaves = list(_leaves(eg))
    if not all_leaves:
        return eg
    non_cancel = [
        leaf for leaf in all_leaves
        if not isinstance(leaf, (asyncio.CancelledError, KeyboardInterrupt))
    ]
    return non_cancel[0] if non_cancel else all_leaves[0]


@router.post("/settings/mcp/rotate", dependencies=[Depends(require_same_machine)])
async def rotate_mcp_token():
    """Generate a new MCP token, invalidating any existing config.

    The user must re-paste the new snippet into their MCP client config
    after rotating. Returns the same shape as GET /settings/mcp
    so the UI can refresh in place.
    """
    from backend.mcp.token import reset_mcp_token
    token = reset_mcp_token()
    return {
        "token": token,
        **_build_mcp_config_snippets(token),
    }


@router.get("/settings/mcp/tools")
async def list_mcp_tools():
    """Every registered MCP tool with the first line of its description.

    Reads the SAME FastMCP instance that is mounted at /mcp, so the page can
    never list a tool the server doesn't serve.
    """
    from backend.mcp.server import _build_mcp_app
    try:
        mcp = _build_mcp_app()
    except ImportError:
        return {"available": False, "tools": []}
    tools = await mcp.list_tools()
    return {
        "available": True,
        "tools": [
            {
                "name": t.name,
                "summary": ((t.description or "").strip().splitlines() or [""])[0],
            }
            for t in tools
        ],
    }
