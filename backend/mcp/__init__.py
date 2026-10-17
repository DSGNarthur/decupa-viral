# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""MCP (Model Context Protocol) server for ViralMint.

Exposes the backend REST API as MCP tools so Claude Code (and any MCP
client — Claude Desktop, Cursor, Codex, IDE extensions) can drive the
pipeline conversationally:

    user → "scout AI-news trends and make a 60s Short from the top result"
         → the agent calls scout_trending → wait_for_job → download_video
           → wait_for_job → generate_smart_video → get_video

Architecture:
  - HTTP Streamable transport, mounted on the existing FastAPI app at /mcp.
    No separate process, no extra install.
  - Tools call the backend via loopback HTTP (httpx → /api/...) rather than
    importing services in-process, so every existing middleware and guard
    applies to MCP exactly as it does to the UI.
  - Bearer-token auth: a token is generated on first run, persisted to
    DATA_DIR/mcp_token (mode 0o600), and shown on the /mcp page.
  - AI-backed tools run on YOUR configured provider keys (Settings → API
    keys), the same as the UI.

See backend/mcp/server.py for the mount; backend/mcp/tools/ for the tools.
"""
