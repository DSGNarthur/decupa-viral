# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""MCP Bearer-token generation + persistence.

Every /mcp request must carry this token, in every bind mode.

On the default loopback bind (HOST=127.0.0.1) network attackers can't reach
the server at all, and the token's job is narrower: bind one MCP client
config to THIS ViralMint install, so a dev and a packaged build on the same
machine can't be cross-wired. In LAN mode (HOST=0.0.0.0) the token is also
what keeps another device on the network from driving the agent tools
without first reading it from the /mcp page.

Token shape: 32 url-safe bytes → 43 chars of [A-Za-z0-9_-]. Long enough
that brute force is infeasible even from a same-machine attacker; short
enough to display + copy comfortably on the /mcp page.

File: DATA_DIR/mcp_token (mode 0o600 on POSIX; Windows ignores chmod).
"""
import logging
import secrets
from pathlib import Path

from backend.config import DATA_DIR

logger = logging.getLogger(__name__)

TOKEN_FILE: Path = DATA_DIR / "mcp_token"
_TOKEN_BYTES = 32  # → 43 url-safe chars


def _generate() -> str:
    return secrets.token_urlsafe(_TOKEN_BYTES)


def _persist(token: str) -> None:
    """Write the token to disk and tighten POSIX perms.

    chmod 0o600 silently no-ops on Windows; we don't treat that as an
    error — Windows ACLs already restrict the user profile path that
    DATA_DIR resolves into.
    """
    TOKEN_FILE.write_text(token)
    try:
        TOKEN_FILE.chmod(0o600)
    except (OSError, NotImplementedError):
        pass


def get_or_create_mcp_token() -> str:
    """Load the persisted MCP token, generating + saving one on first run.

    Idempotent across restarts so the user's Claude Code config keeps
    working — only `reset_mcp_token()` rotates.
    """
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text().strip()
        if token:
            return token
        # Empty file — treat as missing and regenerate.
        logger.warning("MCP token file existed but was empty; regenerating")
    token = _generate()
    _persist(token)
    logger.info("MCP token generated and saved to %s", TOKEN_FILE)
    return token


def reset_mcp_token() -> str:
    """Generate a fresh token, invalidating any existing Claude Code config.

    Exposed on the /mcp page so users can rotate if they suspect a token
    leak. Returns the new token so the UI can re-display the config
    snippet.
    """
    token = _generate()
    _persist(token)
    logger.info("MCP token rotated")
    return token
