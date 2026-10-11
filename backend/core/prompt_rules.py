# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""
Prompt rules shared by many AI call sites — ONE wording each, so call sites never drift apart.

Why this exists: Claude — this variant's default provider — does not quietly
infer the output language from the source the way some models do: a Chinese
transcript came back with English clip titles, hooks and scripts. Every
prompt that produces user-facing text states the language explicitly. Claude
also wraps JSON in prose or fences, and adds a preamble to numbered lists,
far more often — hence the two parsers below.

The rules contain no `{}` braces, so they can be appended to str.format
templates as-is.
"""

# For prompts whose output a user reads (titles, hooks, descriptions, reasons,
# summaries, suggestions) and that are fed a SOURCE text (a transcript, script,
# article, comments, a website).
OUTPUT_LANGUAGE_RULE = (
    "LANGUAGE: write every human-readable field (titles, hooks, captions, "
    "descriptions, reasons, suggestions, summaries) in the same language as "
    "the source text above — a Chinese transcript gets Chinese titles. Stock "
    "footage search queries and image/video generation prompts stay in English."
)

# For prompts that answer the USER directly (chat titles, director replies).
REPLY_LANGUAGE_RULE = (
    "LANGUAGE: reply in the language the user writes in."
)


def parse_numbered_lines(text: str) -> list[str]:
    """The items of a numbered list reply, in order — ONLY lines that start
    with a number (`1.` / `2)` / `**3.**` / `4 -`). A preamble ("Here are the
    prompts:") or a closing remark is ignored instead of becoming item #1 and
    shifting every later item onto the wrong scene (Claude adds those far more
    often than other models)."""
    import re
    items = []
    for line in (text or "").splitlines():
        m = re.match(r"^\s*[*_]*\s*(\d+)\s*[.):\-]\s*[*_]*\s*(.+?)\s*[*_]*\s*$", line)
        if m and m.group(2).strip():
            items.append(m.group(2).strip())
    return items


def extract_json_text(text: str) -> str:
    """The JSON inside a model reply, ready for json.loads: the body of a
    ```json fence ANYWHERE in the reply, else the span from the first `{`/`[`
    to its last matching closer. Claude adds a leading sentence ("Here is the
    JSON:") or trailing commentary, and the old `startswith("```")` checks
    only handled a fence at position 0. Returns the stripped input when it contains no JSON at all."""
    import re
    s = (text or "").strip()
    m = re.search(r"```(?:json|JSON)?[ \t]*\n?(.*?)```", s, re.S)
    if m and m.group(1).strip():
        return m.group(1).strip()
    starts = [i for i in (s.find("{"), s.find("[")) if i >= 0]
    if not starts:
        return s
    i = min(starts)
    j = s.rfind("}" if s[i] == "{" else "]")
    return s[i:j + 1] if j > i else s[i:]
