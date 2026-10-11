#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Regression tests for the Linux/X11 tray-title encoding crash (issue #34).

The launcher's tray status titles contain an em dash (U+2014) and an ellipsis
(U+2026). On Linux, pystray's X11 backend writes the tray icon's title into the
X11 WM_NAME property as STRING (Latin-1 / ISO-8859-1), which rejects any byte
>255 and raises ``UnicodeEncodeError: 'latin-1' codec can't encode
character``. That kills the launcher before the backend ever starts (Ubuntu
24.04 / X11, reported for v2026.7.19).

These tests validate the narrow fix in ``launcher._tray_safe_text``: it must
remove the characters the launcher's status titles actually use (em dash,
en dash, ellipsis) while preserving ordinary text, including Latin-1
characters that the X11 path *can* represent.
"""
import platform
import pytest

import launcher

pytestmark = pytest.mark.skipif(
    platform.system() == "Windows",
    reason="X11 WM_NAME path is Linux-only; Windows tray uses ctypes "
    "and is not the crasher path",
)


def test_tray_safe_text_handle_emoji_title_characters_unsupported_by_x11():
    out = launcher._tray_safe_text("ViralMint \u2014 Stopped")
    out.encode("latin-1")
    assert "\u2014" not in out
    assert out.endswith("- Stopped")


def test_tray_safe_text_preserves_ascii_and_latin_characters():
    assert launcher._tray_safe_text("ViralMint Launcher") == "ViralMint Launcher"
    out = launcher._tray_safe_text("ViralMint \u2014 Caf\u00e9")
    assert "Caf\u00e9" in out
    assert out.encode("latin-1") == out.encode("latin-1")


def test_tray_safe_text_normalizes_ellipsis_and_endash_too():
    out = launcher._tray_safe_text("ViralMint \u2014 Starting\u2026")
    assert "\u2026" not in out
    assert "..." in out
    assert "\u2014" not in out
    out.encode("latin-1")
    out2 = launcher._tray_safe_text("ViralMint \u2013 paused")
    assert "\u2013" not in out2
    assert out2.encode("latin-1")


def test_tray_safe_text_is_stable_under_repeated_application():
    first = launcher._tray_safe_text(
        "ViralMint \u2014 Starting\u2026 Caf\u00e9 \u2014 done"
    )
    second = launcher._tray_safe_text(first)
    assert first == second


def test_tray_title_states_use_x11_safe_characters():
    for cand in (
        "ViralMint \u2014 Stopped",
        "ViralMint \u2014 Starting\u2026",
        "ViralMint \u2014 Running (port 16888)",
    ):
        out = launcher._tray_safe_text(cand)
        out.encode("latin-1")
        assert "\u2014" not in out
        if "\u2026" in cand:
            assert "..." in out


def test_tray_title_helper_makes_bug_report_input_safe():
    out = launcher._tray_safe_text("ViralMint \u2014 Stopped")
    out.encode("latin-1")
    assert out == "ViralMint - Stopped"
