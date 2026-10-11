# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""AI calls that hold up on Claude — this variant's default provider.

Claude answers differently from the models these prompts were first written
against, in four ways that each broke something real:

* it does not infer the output language — a Chinese transcript came back with
  English clip titles, hooks and scripts;
* it wraps JSON in a sentence ("Here is the JSON:") or a fence that is not at
  position 0, which the old `startswith("```")` checks never handled;
* it writes fuller answers, so a long clip list or a 200-word description hits
  the output ceiling and the JSON never closes;
* it obeys a length target literally — a 15-minute source asked for a
  900-second script, which ran out of tokens mid-sentence.

The AI client is stubbed; nothing here calls out.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from backend.core.prompt_rules import (
    OUTPUT_LANGUAGE_RULE, extract_json_text, parse_numbered_lines,
)
from backend.services import clip_extractor as CE


class _AI:
    def __init__(self, *responses):
        self._responses = list(responses)
        self.calls: list[dict] = []

    async def chat(self, messages, max_tokens=None, **kw):
        self.calls.append({"messages": messages, "max_tokens": max_tokens, **kw})
        r = self._responses.pop(0) if len(self._responses) > 1 else self._responses[0]
        if isinstance(r, Exception):
            raise r
        return r


@pytest.fixture()
def ai(monkeypatch):
    def install(*responses):
        client = _AI(*responses)
        # Patch every module that imported the name, not just its home — a
        # stub that misses one lets the test reach the real provider.
        for mod in ("backend.core.ai_provider", "backend.agents.analyzer",
                    "backend.core.ai_retry", "backend.agents.generator"):
            monkeypatch.setattr(f"{mod}.get_ai_client", lambda *a, **k: client)
        return client
    return install


# ── the shared parsers ───────────────────────────────────────────────────────

class TestExtractJsonText:
    def test_bare_json_is_untouched(self):
        assert extract_json_text('[{"a": 1}]') == '[{"a": 1}]'

    def test_a_sentence_before_the_json_is_dropped(self):
        assert json.loads(extract_json_text('Here is the JSON:\n{"a": 1}')) == {"a": 1}

    def test_a_fence_after_prose_is_found(self):
        reply = 'Sure!\n```json\n[1, 2]\n```\nLet me know.'
        assert json.loads(extract_json_text(reply)) == [1, 2]

    def test_commentary_after_the_json_is_dropped(self):
        assert json.loads(extract_json_text('{"a": 1}\n\nHope this helps!')) == {"a": 1}

    def test_no_json_returns_the_text(self):
        assert extract_json_text("  nothing here ") == "nothing here"
        assert extract_json_text(None) == ""


class TestParseNumberedLines:
    def test_a_preamble_does_not_become_item_one(self):
        reply = "Here are the scene prompts:\n1. A city at night\n2) Ocean waves\n\nEnjoy!"
        assert parse_numbered_lines(reply) == ["A city at night", "Ocean waves"]

    def test_markdown_bold_numbers_are_read(self):
        assert parse_numbered_lines("**1.** First\n**2.** Second") == ["First", "Second"]


def test_the_language_rule_is_safe_inside_format_templates():
    # Appended to str.format templates — a brace would raise KeyError.
    assert "{" not in OUTPUT_LANGUAGE_RULE and "}" not in OUTPUT_LANGUAGE_RULE


# ── every prompt whose output a user reads states the language ──────────────

@pytest.mark.parametrize("module, name", [
    ("backend.agents.analyzer", "INSIGHTS_PROMPT"),
    ("backend.agents.analyzer", "SEGMENT_ANALYSIS_PROMPT"),
    ("backend.agents.analyzer", "IMPROVEMENT_PROMPT"),
    ("backend.services.clip_extractor", "CLIP_SELECTION_PROMPT"),
    ("backend.services.clip_extractor", "CLIP_METADATA_PROMPT"),
    ("backend.services.clip_extractor", "CLIP_METADATA_BATCH_PROMPT"),
    ("backend.services.comment_service", "COMMENT_ANALYSIS_PROMPT"),
    ("backend.services.news_analyzer_service", "SINGLE_ARTICLE_PROMPT"),
    ("backend.core.task_runner", "CHANNEL_ANALYSIS_PROMPT"),
])
def test_user_facing_prompts_state_the_output_language(module, name):
    import importlib
    prompt = getattr(importlib.import_module(module), name)
    assert "LANGUAGE" in prompt


@pytest.mark.parametrize("name", ["SCRIPT_PROMPT", "YOUTUBE_META_PROMPT", "TIKTOK_META_PROMPT"])
def test_generator_prompts_state_the_language(name):
    from backend.agents import generator_prompts
    assert "same language" in getattr(generator_prompts, name)


def test_stock_search_terms_are_asked_for_in_english():
    from backend.services import broll_service
    import inspect
    assert "always in English" in inspect.getsource(broll_service)


# ── clip picker: wrappers and truncated lists ────────────────────────────────

SEGMENTS = [{"start": i * 10.0, "end": i * 10.0 + 9.0, "text": f"Segment {i}."} for i in range(30)]


def _select(**kw):
    defaults = dict(segments=SEGMENTS, title="A Podcast", duration=300, max_clips=5, user_settings=None)
    defaults.update(kw)
    return asyncio.run(CE._select_clip_windows(**defaults))


def _clip(start, end):
    return {"start": start, "end": end, "title": f"Clip {start}", "virality_score": 80,
            "hook_type": "question", "reason": "strong hook"}


class TestClipPickerReplies:
    def test_a_clips_wrapper_object_is_unwrapped(self, ai):
        ai(json.dumps({"clips": [_clip(10, 40), _clip(100, 130)]}))
        windows = _select()
        assert [w["start"] for w in windows] == [10, 100]

    def test_a_single_clip_object_still_counts(self, ai):
        ai(json.dumps(_clip(10, 40)))
        assert [w["start"] for w in _select()] == [10]

    def test_a_list_cut_off_at_the_output_ceiling_keeps_its_complete_clips(self, ai):
        whole = json.dumps([_clip(10, 40), _clip(100, 130), _clip(200, 230)])
        ai("```json\n" + whole[: whole.rindex("{") + 20])     # third clip cut mid-object
        assert [w["start"] for w in _select()] == [10, 100]

    def test_prose_around_the_list_is_ignored(self, ai):
        ai("Here are the best moments:\n" + json.dumps([_clip(10, 40)]) + "\nThese should perform well.")
        assert [w["start"] for w in _select()] == [10]


class TestParseSalvage:
    def test_nested_braces_inside_a_clip_survive_the_salvage(self):
        text = '[{"start": 1, "scores": {"flow": 8}}, {"start": 2, "scores": {"fl'
        assert CE._parse_json_response(text) == [{"start": 1, "scores": {"flow": 8}}]

    def test_nothing_complete_is_none(self):
        assert CE._salvage_truncated_array('[{"start": 1, "en') is None
        assert CE._salvage_truncated_array("no json here") is None


# ── transcript correction, URL repair, tool JSON ─────────────────────────────

class TestTranscriptCorrection:
    def test_a_preamble_line_is_not_stored_in_the_transcript(self, ai):
        from backend.agents.analyzer import _ai_correct_transcript
        raw = "so today we talk about the history of coffee and how it spread"
        ai("Here is the corrected transcript:\nSo today we talk about the history of coffee and how it spread.")
        out = asyncio.run(_ai_correct_transcript(None, raw))
        assert not out.lower().startswith("here is")
        assert out.startswith("So today")

    def test_the_prompt_keeps_the_transcripts_language(self, ai):
        from backend.agents.analyzer import _ai_correct_transcript
        client = ai("今天我们来聊一聊咖啡的历史以及它是如何传播开来的。")
        asyncio.run(_ai_correct_transcript(None, "今天我们来聊一聊咖啡的历史以及它是如何传播开来的"))
        assert "own language" in client.calls[0]["messages"][0]["content"]


class TestUrlRepair:
    def test_the_url_is_taken_out_of_an_explained_reply(self, ai):
        from backend.core.ai_retry import ai_fix_url
        ai("The correct URL is https://www.youtube.com/watch?v=abc123. The original had a typo.")
        assert asyncio.run(ai_fix_url("https://youtube.com/watch?v=abc12", "404")) == \
            "https://www.youtube.com/watch?v=abc123"


def test_tool_json_after_a_sentence_is_found():
    from backend.core.tool_runners import _strip_json_fence
    assert json.loads(_strip_json_fence('Here you go:\n```json\n{"a": 1}\n```')) == {"a": 1}


# ── script length + metadata budgets ─────────────────────────────────────────

class TestScriptLength:
    @pytest.mark.parametrize("estimated, want", [
        (900, 180), ("600", 180), (60, 60), (None, 90), ("1:30", 90), (0, 90), (5, 15),
    ])
    def test_the_script_target_is_short_form(self, estimated, want):
        from backend.agents.generator import _script_seconds
        assert _script_seconds(estimated) == want


def test_platform_metadata_survives_prose_and_has_room_for_a_full_description(ai, monkeypatch):
    from backend.agents.generator import GeneratorAgent
    yt = {"title": "T", "description": "d " * 300, "tags": ["a"], "category_id": "22"}
    tt = {"title": "caption", "description": "desc"}
    client = ai("Here is the metadata:\n```json\n" + json.dumps(yt) + "\n```",
                "Sure:\n" + json.dumps(tt))
    meta = asyncio.run(GeneratorAgent()._generate_metadata("a script", "cooking", None))
    assert meta["youtube"]["title"] == "T"
    assert meta["tiktok"]["title"] == "caption"
    assert client.calls[0]["max_tokens"] >= 1200
