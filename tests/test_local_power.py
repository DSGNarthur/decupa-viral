"""Power requests must end when the final task ends and leave other platforms alone."""
from types import SimpleNamespace

from backend.core import local_power


def setup_windows(monkeypatch, result=1):
    calls = []
    def request(flags):
        calls.append(flags)
        return result
    monkeypatch.setattr(local_power.sys, 'platform', 'win32')
    monkeypatch.setattr(local_power.ctypes, 'windll', SimpleNamespace(
        kernel32=SimpleNamespace(SetThreadExecutionState=request)), raising=False)
    monkeypatch.setattr(local_power, '_held', False)
    monkeypatch.delenv('DECUPA_KEEP_AWAKE', raising=False)
    return calls


def test_active_jobs_hold_once_and_final_job_releases(monkeypatch):
    calls = setup_windows(monkeypatch)
    assert local_power.keep_awake_for_jobs(True)
    assert local_power.keep_awake_for_jobs(True)
    assert not local_power.keep_awake_for_jobs(False)
    assert not local_power.keep_awake_for_jobs(False)
    assert calls == [0x80000001, 0x80000000]


def test_failed_request_does_not_claim_a_hold(monkeypatch):
    calls = setup_windows(monkeypatch, result=0)
    assert not local_power.keep_awake_for_jobs(True)
    assert not local_power.keep_awake_for_jobs(False)
    assert calls == [0x80000001]


def test_disabling_releases_an_existing_hold(monkeypatch):
    calls = setup_windows(monkeypatch)
    local_power.keep_awake_for_jobs(True)
    monkeypatch.setenv('DECUPA_KEEP_AWAKE', 'false')
    assert not local_power.keep_awake_for_jobs(True)
    assert calls == [0x80000001, 0x80000000]


def test_other_platforms_never_call_windows(monkeypatch):
    calls = setup_windows(monkeypatch)
    monkeypatch.setattr(local_power.sys, 'platform', 'linux')
    assert not local_power.keep_awake_for_jobs(True)
    assert calls == []
