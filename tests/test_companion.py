"""The Vercel companion must not open the local planner to arbitrary sites."""
from backend.core import companion


def test_pairing_is_exact_origin_and_explicitly_enabled(monkeypatch):
    monkeypatch.delenv('DECUPA_COMPANION', raising=False)
    assert not companion.trusted_origin(companion.ORIGIN)
    monkeypatch.setenv('DECUPA_COMPANION', '1')
    assert companion.trusted_origin(companion.ORIGIN)
    assert not companion.trusted_origin('https://decupa-viral.vercel.app.evil.example')
    assert not companion.trusted_origin('https://other.vercel.app')


def test_pairing_link_does_not_put_capability_in_server_query():
    value = companion.link()
    assert value.startswith(companion.ORIGIN + '/#pc=')
    assert '?' not in value
    assert companion.authorized(value.split('#pc=')[1])
    assert not companion.authorized('invalid')
    assert not companion.authorized('')


def test_only_local_ui_can_issue_pairing_link():
    assert companion.local_origin('http://localhost:16889/clips', 16889)
    assert companion.local_origin('http://127.0.0.1:16889', 16889)
    assert not companion.local_origin(companion.ORIGIN, 16889)
    assert not companion.local_origin('http://localhost:16888', 16889)
    assert not companion.local_origin('http://localhost.evil.example:16889', 16889)


async def test_independent_studio_cleanup_never_runs_global_kill(monkeypatch):
    from backend.services import studio_service as studio
    monkeypatch.setenv('DECUPA_COMPANION', '1')
    monkeypatch.setattr(studio.StudioService, '_proc', None)

    async def forbidden(*args, **kwargs):
        raise AssertionError('The independent app must never run preview --kill-all')

    monkeypatch.setattr(studio.asyncio, 'create_subprocess_exec', forbidden)
    await studio.StudioService._kill_all()


async def test_studio_refuses_port_owned_by_another_install(monkeypatch):
    import socket
    import pytest
    from backend.services import studio_service as studio
    monkeypatch.setenv('DECUPA_COMPANION', '1')
    monkeypatch.setattr(studio.StudioService, '_proc', None)
    monkeypatch.setattr(studio.HyperFramesService, 'is_installed', lambda: True)
    monkeypatch.setattr(studio.StudioService, '_seed', lambda: None)
    monkeypatch.setattr(studio, '_inject_theme', lambda mode: None)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as other:
        other.bind(('127.0.0.1', 0))
        other.listen()
        monkeypatch.setattr(studio, 'STUDIO_PORT', other.getsockname()[1])
        with pytest.raises(RuntimeError, match='está em uso'):
            await studio.StudioService.ensure_running(force=True)
