# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""The built-in prompts are recipes the model follows step by step — a step
naming a tool this server doesn't serve sends it after nothing."""
from __future__ import annotations

import asyncio
import re

import pytest

from backend.mcp.server import _build_mcp_app


@pytest.fixture(scope="module")
def surface():
    mcp = _build_mcp_app()

    async def _collect():
        tools = {t.name for t in await mcp.list_tools()}
        prompts = await mcp.list_prompts()
        rendered = {}
        for p in prompts:
            result = await mcp.render_prompt(p.name, {})
            rendered[p.name] = "\n".join(
                m.content.text for m in result.messages if hasattr(m.content, "text"))
        return tools, rendered

    return asyncio.run(_collect())


def test_builtin_prompts_are_namespaced(surface):
    _, rendered = surface
    assert rendered
    assert all(name.startswith("viralmint:") for name in rendered)


def test_every_tool_a_recipe_names_exists(surface):
    tools, rendered = surface
    missing = {}
    for name, text in rendered.items():
        # Recipes write calls as `tool_name(` or `tool_name` in backticks.
        named = set(re.findall(r"`([a-z][a-z0-9_]+)(?:\(|`)", text))
        unknown = sorted(n for n in named if n not in tools and "_" in n
                         and not n.startswith(("viralmint", "output", "caption")))
        if unknown:
            missing[name] = unknown
    assert not missing, missing


def test_recipes_render_with_arguments(surface):
    mcp = _build_mcp_app()
    result = asyncio.run(mcp.render_prompt(
        "viralmint:create_viral_short", {"niche": "home espresso"}))
    text = "\n".join(m.content.text for m in result.messages)
    assert "home espresso" in text
