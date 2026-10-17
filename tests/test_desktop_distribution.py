"""Critical boundaries of the installed native engine, on every OS."""
import os
from pathlib import Path
import pytest
from starlette.testclient import TestClient
from backend.core import companion
from backend.main import create_app
from desktop.runtime import configure, user_data


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('DECUPA_COMPANION', '1')
    return TestClient(create_app(), base_url='http://127.0.0.1:16889', client=('127.0.0.1', 53210))


def test_preflight_bootstrap_rotation_and_authorization(client):
    headers = {'Origin': companion.ORIGIN, 'Content-Type': 'application/json', 'X-Decupa-Connect': '1'}
    preflight = client.options('/api/companion/connect', headers={
        'Origin': companion.ORIGIN, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-decupa-connect',
        'Access-Control-Request-Private-Network': 'true'})
    assert preflight.status_code == 200
    assert preflight.headers['access-control-allow-origin'] == companion.ORIGIN
    assert preflight.headers['access-control-allow-private-network'] == 'true'
    response = client.post('/api/companion/connect', headers=headers, json={})
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    token = response.json()['token']
    assert client.get('/api/health', headers={'Origin': companion.ORIGIN}).status_code == 401
    assert client.get('/api/health', headers={'Origin': companion.ORIGIN, 'Authorization': 'Bearer old-token'}).status_code == 401
    paired = client.get('/api/health', headers={'Origin': companion.ORIGIN, 'Authorization': 'Bearer ' + token})
    assert paired.status_code == 200
    assert token not in paired.text
    assert paired.headers['x-frame-options'] == 'DENY'


@pytest.mark.parametrize('headers', [
    {}, {'Origin': 'null'}, {'Origin': 'https://evil.example'},
    {'Origin': companion.ORIGIN},
    {'Origin': companion.ORIGIN, 'X-Decupa-Connect': '1', 'Content-Type': 'text/plain'},
    {'Origin': companion.ORIGIN, 'X-Decupa-Connect': '1', 'Host': 'evil.example'},
])
def test_bootstrap_rejects_forms_untrusted_origins_and_rebinding(client, headers):
    assert client.post('/api/companion/connect', headers=headers, content='{}').status_code in (401, 403)


@pytest.mark.parametrize('headers', [
    {'Origin': 'null'}, {'Origin': 'https://evil.example'},
    {'Host': 'evil.example'}, {'Sec-Fetch-Site': 'cross-site'},
    {'Origin': 'http://localhost:5173'},
])
def test_companion_blocks_cross_origin_reads_too(client, headers):
    assert client.get('/api/health', headers=headers).status_code == 403


def test_runtime_forces_loopback_and_keeps_data_outside_install(tmp_path, monkeypatch):
    monkeypatch.setenv('HOST', '0.0.0.0')
    monkeypatch.setenv('DEBUG', 'true')
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path / 'profile'))
    monkeypatch.delenv('VIRALMINT_DATA_DIR', raising=False)
    root = tmp_path / 'install/app'
    # Undo configure's process-wide environment changes at fixture teardown.
    for key in ('PORT','HOST','DEBUG','APP_NAME','DECUPA_COMPANION','FRONTEND_URL','PYTHONUTF8','VIRALMINT_DATA_DIR','HF_HOME','YOUTUBE_REDIRECT_URI','TIKTOK_REDIRECT_URI','DECUPA_BACKGROUND','PATH','VIRALMINT_FRONTEND_DIST'):
        monkeypatch.setenv(key, os.environ.get(key, ''))
    monkeypatch.delenv('VIRALMINT_DATA_DIR', raising=False)
    args, python, data = configure(root, ['--background'])
    assert os.environ['HOST'] == '127.0.0.1'
    assert os.environ['DEBUG'] == 'false'
    assert os.environ['DECUPA_BACKGROUND'] == '1'
    assert not data.is_relative_to(root)
    assert user_data('Darwin', tmp_path) == tmp_path / 'Library/Application Support/Decupa Viral/data'


@pytest.mark.parametrize('url', ['https://evil.example', 'decupaviral://start?command=bad', 'decupaviral://start/evil', 'decupaviral://start#bad'])
def test_protocol_cannot_execute_commands(tmp_path, url):
    with pytest.raises(SystemExit):
        configure(tmp_path, ['--protocol', url])
