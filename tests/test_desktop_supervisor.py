"""Exercise real child exits and installation compatibility without production ports."""
import json
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

import launcher
from desktop.install import engine_ready, install


@pytest.fixture
def supervisor(tmp_path, monkeypatch):
    for key, value in (
        ('ROOT', tmp_path), ('BACKEND_LOG', tmp_path / 'logs/backend.log'),
        ('_backend_process', None), ('_backend_log', None),
        ('_user_stop_requested', False), ('_pending_unexpected_exit', None),
        ('_crash_timestamps', []), ('FROZEN', False),
    ):
        monkeypatch.setattr(launcher, key, value)
    monkeypatch.setenv('DECUPA_BACKGROUND', '1')
    monkeypatch.setattr(launcher, '_find_python', lambda: sys.executable)
    probe = launcher._port_listening
    listener = socket.socket()
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
    monkeypatch.setattr(launcher, '_port_listening', lambda: probe(port=port))
    monkeypatch.setattr(launcher, '_terminate_port_holder', lambda: pytest.fail('Must not stop an external listener'))
    yield tmp_path, listener
    launcher.stop_service(only_owned=True)
    listener.close()


def test_background_restarts_real_crashed_child_and_limits_crash_loop(supervisor, monkeypatch):
    root, listener = supervisor
    listener.close()
    (root / 'run.py').write_text(
        "from pathlib import Path\n"
        "p=Path('attempts.txt')\n"
        "p.write_text(str(int(p.read_text())+1) if p.exists() else '1')\n"
        "raise SystemExit(17)\n", encoding='utf-8')
    monkeypatch.setattr(launcher, '_CRASH_LOOP_MAX', 1)
    real_sleep = time.sleep
    deadline = time.monotonic() + 10

    def bounded_sleep(interval):
        if time.monotonic() > deadline:
            pytest.fail('Supervisor did not finish recovery and crash-loop handling in 10 seconds')
        real_sleep(min(interval, 0.02))

    monkeypatch.setattr(launcher.time, 'sleep', bounded_sleep)
    launcher._run_background(poll_interval=0.02)
    assert (root / 'attempts.txt').read_text() == '2'
    assert len(launcher._crash_timestamps) == 2
    reports = list((root / 'logs').glob('backend-crash-*.log'))
    assert reports and 'exit code: 17' in reports[-1].read_text()
    assert launcher._backend_process is None


def test_background_does_not_adopt_or_stop_external_service(supervisor):
    _, listener = supervisor
    listener.listen()
    launcher._run_background()
    launcher.stop_service(only_owned=True)
    assert launcher._backend_process is None
    assert launcher._port_listening()


@pytest.mark.parametrize('current', [False, True])
def test_installer_checks_actual_pairing_instead_of_legacy_health(current):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"app":"Decupa Viral"}')

        def do_POST(self):
            valid = (current and self.path == '/api/companion/connect'
                     and self.headers.get('Origin') == 'https://decupa-viral.vercel.app'
                     and self.headers.get('X-Decupa-Connect') == '1'
                     and self.headers.get('Content-Type') == 'application/json')
            self.send_response(200 if valid else 401)
            self.end_headers()
            self.wfile.write(json.dumps({'app': 'Decupa Viral', 'runtime': 'pc', 'token': 'x' * 43} if valid else {}).encode())

        def log_message(self, *args):
            pass

    with ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            assert engine_ready(server.server_port) is current
        finally:
            server.shutdown()
            thread.join(timeout=5)


def test_installer_refuses_port_conflict_before_copying(tmp_path, monkeypatch):
    monkeypatch.setattr('desktop.install.port_in_use', lambda: True)
    with pytest.raises(RuntimeError, match='16889'):
        install(tmp_path / 'source', tmp_path / 'target', register=False, browser=False)
    assert not (tmp_path / 'target').exists()
