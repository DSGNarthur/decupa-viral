# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""run.py's development auto-reload (issue #45).

A reloader watching the whole checkout restarted the server whenever a
download, a render or an add-on install wrote files, killing the job; and on
Windows, uvicorn's reload mode runs an event loop that cannot start
subprocesses, so ffmpeg and the Motion Graphics installer failed with an empty
error. Reload therefore watches only `backend/`, and is off on Windows.
"""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _run_module():
    spec = importlib.util.spec_from_file_location("run_under_test", ROOT / "run.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_reload_watches_only_the_backend_source(monkeypatch):
    run = _run_module()
    monkeypatch.setattr(run.sys, "platform", "darwin")
    args = run._reload_args()
    assert args[0] == "--reload"
    assert args[args.index("--reload-dir") + 1] == str(ROOT / "backend")


def test_reload_is_off_on_windows(monkeypatch):
    run = _run_module()
    monkeypatch.setattr(run.sys, "platform", "win32")
    assert run._reload_args() == []


def test_start_uvicorn_uses_the_restricted_reload(monkeypatch):
    run = _run_module()
    seen = {}

    class _P:
        pid = 1

    monkeypatch.setattr(run.subprocess, "Popen", lambda cmd, cwd=None: seen.setdefault("cmd", cmd) and _P())
    monkeypatch.setattr(run.sys, "platform", "linux")
    run.start_uvicorn(reload=True)
    assert "--reload-dir" in seen["cmd"]
