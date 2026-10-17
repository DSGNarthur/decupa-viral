"""Installed runtime configuration, shared by Windows, macOS and Linux."""
import argparse
import json
import os
import platform
import runpy
import sys
from pathlib import Path
from urllib.parse import urlsplit


def user_data(system=None, home=None):
    system = system or platform.system()
    home = Path(home or Path.home())
    if system == 'Windows':
        return Path(os.environ.get('LOCALAPPDATA', home / 'AppData/Local')) / 'Decupa Viral/data'
    if system == 'Darwin':
        return home / 'Library/Application Support/Decupa Viral/data'
    return Path(os.environ.get('XDG_DATA_HOME', home / '.local/share')) / 'decupa-viral/data'


def configure(root, argv=None):
    parser = argparse.ArgumentParser(description='Motor local do Decupa Viral')
    parser.add_argument('--background', action='store_true')
    parser.add_argument('--run-backend', action='store_true')
    parser.add_argument('--protocol')
    args = parser.parse_args(argv)
    if args.protocol:
        value = urlsplit(args.protocol)
        if (value.scheme != 'decupaviral' or value.netloc != 'start'
                or value.path not in ('', '/') or value.query or value.fragment):
            parser.error('Protocolo de abertura inválido.')
    config = root / 'runtime.local.json'
    runtime = json.loads(config.read_text(encoding='utf-8')) if config.exists() else {}
    install = root.parent
    candidates = [install / 'python/python.exe', install / 'python/bin/python3']
    os.environ['DECUPA_DISTRIBUTED'] = '1' if any(p.is_file() for p in candidates) else '0'
    python = runtime.get('python') or str(next((p for p in candidates if p.is_file()), Path(sys.executable)))
    data = Path(runtime.get('data_dir') or os.environ.get('VIRALMINT_DATA_DIR') or user_data())
    port = int(os.environ.get('DECUPA_PORT', '16889'))
    if not 1024 <= port <= 55000:
        parser.error('Porta inválida.')
    os.environ.update(PORT=str(port), HOST='127.0.0.1', DEBUG='false',
                      APP_NAME='Decupa Viral', DECUPA_COMPANION='1',
                      FRONTEND_URL=f'http://localhost:{port}', PYTHONUTF8='1',
                      VIRALMINT_DATA_DIR=str(data),
                      HF_HOME=runtime.get('hf_home', str(data / 'whisper-cache')),
                      YOUTUBE_REDIRECT_URI=runtime.get('youtube_redirect_uri', f'http://localhost:{port}/api/settings/youtube-callback'),
                      TIKTOK_REDIRECT_URI=runtime.get('tiktok_redirect_uri', f'http://localhost:{port}/api/settings/tiktok-upload-callback'))
    if args.background or args.protocol:
        os.environ['DECUPA_BACKGROUND'] = '1'
    paths = [str(install / 'bin'), str(install / 'node/bin'), str(install / 'node'), str(Path(python).parent)]
    os.environ['PATH'] = os.pathsep.join(paths + [os.environ.get('PATH', '')])
    os.environ['VIRALMINT_FRONTEND_DIST'] = runtime.get('frontend_dist') or str(root / 'frontend/dist')
    return args, python, data


def main(root=None, argv=None):
    root = Path(root or Path(__file__).resolve().parents[1])
    args, python, data = configure(root, argv)
    os.chdir(root)
    (data / 'logs').mkdir(parents=True, exist_ok=True)
    log = open(data / 'logs/launcher.log', 'a', encoding='utf-8', buffering=1)
    sys.stdout = log
    sys.stderr = log
    sys.executable = python
    sys.path.insert(0, str(root))
    sys.argv = [str(root / 'launcher.py')] + (['--run-backend'] if args.run_backend else [])
    runpy.run_path(str(root / 'launcher.py'), run_name='__main__')


if __name__ == '__main__':
    main()
