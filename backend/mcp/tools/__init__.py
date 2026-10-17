# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""MCP tool modules.

Each module groups related tools and exposes a `register(mcp)` function
that wires its tools onto a FastMCP instance. backend/mcp/server.py calls
them in a workflow-shaped order.
"""
