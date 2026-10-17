"""Build self-contained, source-based releases on the target OS/architecture.

No cross-compilation: run on Windows x64, macOS arm64/x64 or Linux x64.
Build output must be outside the checkout. Every runtime dependency is pinned
in requirements.lock and verified against its PyPI hash by uv.
"""
import argparse
import hashlib
import json
import os
import platform
import plistlib
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NODE_VERSION = '24.22.0'


def run(*args, **kwargs):
    subprocess.run([str(a) for a in args], check=True, **kwargs)


def digest(path):
    with Path(path).open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def download(url, target, expected):
    if not target.exists():
        with urllib.request.urlopen(url, timeout=120) as response, target.open('wb') as output:
            shutil.copyfileobj(response, output)
    if digest(target) != expected:
        raise RuntimeError(f'Checksum inválido: {target.name}')
    return target


def extract(archive, target):
    # These archives have verified publisher hashes. Still reject traversal.
    if archive.suffix == '.zip':
        with zipfile.ZipFile(archive) as source:
            for name in source.namelist():
                if not (target / name).resolve().is_relative_to(target.resolve()):
                    raise RuntimeError('Caminho inválido no arquivo compactado.')
            source.extractall(target)
    else:
        with tarfile.open(archive) as source:
            source.extractall(target, filter='data')


def copy_source(destination):
    paths = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
    destination = destination.resolve()
    if destination.name != 'app' or destination.parent.name != 'payload' or destination.is_relative_to(ROOT):
        raise RuntimeError('A cópia deve atingir somente payload/app fora do repositório.')
    # This is a generated build tree. User data is outside payload/. Replacing
    # it also removes files no longer in the tracked source manifest.
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    for name in filter(None, paths):
        relative = Path(name)
        source = ROOT / relative
        if (not source.is_file() or name.startswith('.github/')
                or name == 'frontend/public/source-code.zip'):
            continue
        if name == 'frontend/.env.browser' and source.read_text(encoding='utf-8').strip() == 'VITE_BROWSER_RUNTIME=true':
            pass  # Public build-mode flag, not user configuration.
        elif relative.name.startswith('.env') and relative.name != '.env.example':
            raise RuntimeError(f'Arquivo privado no manifesto: {name}')
        if relative.name == 'runtime.local.json' or relative.suffix in ('.db', '.pem', '.key'):
            raise RuntimeError(f'Arquivo privado no manifesto: {name}')
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    frontend_target = destination / 'frontend/dist'
    if frontend_target.exists():
        if not frontend_target.resolve().is_relative_to(destination.resolve()) or frontend_target.resolve().is_relative_to(ROOT):
            raise RuntimeError('A limpeza deve atingir apenas o frontend gerado no payload externo.')
        shutil.rmtree(frontend_target)
    shutil.copytree(ROOT / 'frontend/dist', frontend_target)
    shutil.copy2(ROOT / 'frontend/public/source-code.zip', destination / 'frontend/dist/source-code.zip')


def prepare_python(payload, cache, uv, base=None):
    target = payload / 'python'
    if not target.exists():
        if base is None:
            managed = cache / 'managed-python'
            run(uv, 'python', 'install', '3.11.16', '--install-dir', managed, '--no-bin', '--no-registry')
            candidates = list(managed.glob('cpython-3.11.16-*'))
            base = next(p for p in candidates if p.is_dir())
        shutil.copytree(base, target, symlinks=True, ignore=shutil.ignore_patterns('__pycache__'))
    python = target / ('python.exe' if os.name == 'nt' else 'bin/python3')
    packages = target / ('Lib/site-packages' if os.name == 'nt' else 'lib/python3.11/site-packages')
    run(uv, 'pip', 'install', '--python', python, '--target', packages,
        '--require-hashes', '-r', ROOT / 'desktop/requirements.lock')
    return python


def prepare_node(payload, cache):
    if (payload / 'node').exists():
        return
    system = {'Windows': 'win', 'Darwin': 'darwin', 'Linux': 'linux'}[platform.system()]
    arch = 'arm64' if platform.machine().lower() in ('arm64', 'aarch64') else 'x64'
    filename = f'node-v{NODE_VERSION}-{system}-{arch}.' + ('zip' if system == 'win' else 'tar.xz')
    url = f'https://nodejs.org/dist/v{NODE_VERSION}/'
    sums = urllib.request.urlopen(url + 'SHASUMS256.txt', timeout=60).read().decode()
    expected = next(line.split()[0] for line in sums.splitlines() if line.endswith('  ' + filename))
    archive = download(url + filename, cache / filename, expected)
    unpacked = cache / ('node-' + system + '-' + arch)
    unpacked.mkdir(exist_ok=True)
    extract(archive, unpacked)
    tree = next(unpacked.glob('node-v*'))
    # Unix executable and npm scripts live in bin/, Windows at root.
    shutil.copytree(tree, payload / 'node', symlinks=True)


def prepare_media(payload, ffmpeg=None, ffprobe=None):
    binaries = payload / 'bin'
    binaries.mkdir(exist_ok=True)
    for name, override in [('ffmpeg', ffmpeg), ('ffprobe', ffprobe)]:
        source = Path(override) if override else Path(shutil.which(name) or '')
        if not source.is_file():
            raise RuntimeError(f'{name} ausente. Forneça um binário estático da arquitetura correta.')
        if os.name == 'nt' and source.stat().st_size < 1024 * 1024:
            raise RuntimeError(f'{name} parece ser um atalho do gerenciador de pacotes. Forneça o executável real com --{name}.')
        target = binaries / (name + ('.exe' if os.name == 'nt' else ''))
        shutil.copy2(source, target)
        licenses = payload / 'licenses/ffmpeg'
        licenses.mkdir(parents=True, exist_ok=True)
        for pattern in ('LICENSE*', 'COPYING*', 'README*'):
            for notice in source.parent.parent.glob(pattern):
                if notice.is_file():
                    shutil.copy2(notice, licenses / notice.name)
        target.chmod(target.stat().st_mode | 0o111)
        run(target, '-version', stdout=subprocess.DEVNULL)
    if platform.system() == 'Darwin':
        run('dylibbundler', '-od', '-b', '-x', binaries / 'ffmpeg', '-x', binaries / 'ffprobe',
            '-d', binaries / 'lib', '-p', '@executable_path/lib/')
        for path in list((binaries / 'lib').glob('*.dylib')) + [binaries / 'ffmpeg', binaries / 'ffprobe']:
            run('codesign', '--force', '--sign', '-', path)
    notices = payload / 'RUNTIME-NOTICES.txt'
    notices.write_text('''Decupa Viral, código AGPL-3.0: https://github.com/DSGNarthur/decupa-viral
Python: https://www.python.org/psf/license/ e python/LICENSE.txt
Python standalone: https://github.com/astral-sh/python-build-standalone
Node.js: https://github.com/nodejs/node/tree/v24.22.0 e node/LICENSE
uv: https://github.com/astral-sh/uv (MIT/Apache-2.0)
FFmpeg/FFprobe: executáveis separados, https://ffmpeg.org/legal.html
Código FFmpeg: https://git.ffmpeg.org/ffmpeg.git
Build Linux: https://github.com/BtbN/FFmpeg-Builds/tree/autobuild-2026-10-16-13-04
Build Windows: https://www.gyan.dev/ffmpeg/builds/ (source code e build configuration)
Build macOS: https://github.com/Homebrew/homebrew-core/tree/master/Formula/f/ffmpeg.rb
Cada wheel Python conserva seus avisos e licenças em *.dist-info/licenses.
As versões e flags de compilação estão registradas em media-builds.txt.
''', encoding='utf-8')
    with (payload / 'media-builds.txt').open('w', encoding='utf-8') as file:
        for name in ('ffmpeg', 'ffprobe'):
            executable = binaries / (name + ('.exe' if os.name == 'nt' else ''))
            subprocess.run([str(executable), '-version'], stdout=file, stderr=file, check=True)
            subprocess.run([str(executable), '-L'], stdout=file, stderr=file, check=True)


def wrappers(bundle, payload):
    system = platform.system()
    if system == 'Windows':
        (bundle / 'Instalar.cmd').write_text('@echo off\r\ncd /d "%~dp0"\r\n"python\\python.exe" "app\\desktop\\install.py" --source "%~dp0."\r\nif errorlevel 1 pause\r\n', encoding='utf-8')
    elif system == 'Linux':
        path = bundle / 'instalar.sh'
        path.write_text('#!/bin/sh\nset -eu\nDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$DIR/python/bin/python3" "$DIR/app/desktop/install.py" --source "$DIR" "$@"\n', encoding='utf-8')
        path.chmod(0o755)
    else:
        # AppleScript receives URL-open Apple Events from the browser.
        script = bundle.parent / 'DecupaLauncher.applescript'
        script.write_text('''on run
    my startEngine()
    open location "https://decupa-viral.vercel.app"
end run
on open location incomingURL
    if incomingURL is "decupaviral://start" or incomingURL is "decupaviral://start/" then my startEngine()
end open location
on startEngine()
    set basePath to POSIX path of (path to me)
    set pythonPath to basePath & "Contents/Resources/engine/python/bin/python3"
    set entryPath to basePath & "Contents/Resources/engine/app/desktop/runtime.py"
    do shell script (quoted form of pythonPath) & " " & (quoted form of entryPath) & " --background </dev/null >/dev/null 2>&1 &"
end startEngine
''', encoding='utf-8')
        # osacompile must run before the payload is copied into the .app.
        run('osacompile', '-o', bundle, script)
        plist = bundle / 'Contents/Info.plist'
        with plist.open('rb') as file:
            info = plistlib.load(file)
        info.update(CFBundleIdentifier='app.decupa.viral.engine', CFBundleName='Decupa Viral', LSUIElement=True,
                    CFBundleURLTypes=[{'CFBundleURLName': 'Decupa Viral', 'CFBundleURLSchemes': ['decupaviral']}])
        with plist.open('wb') as file:
            plistlib.dump(info, file)


def manifest(bundle, version, reuse_runtime=False):
    files = {}
    previous = bundle / 'manifest.json'
    prior_files = json.loads(previous.read_text(encoding='utf-8'))['files'] if reuse_runtime and previous.is_file() else {}
    cutoff = previous.stat().st_mtime if prior_files else 0
    for path in sorted(bundle.rglob('*')):
        if path.is_symlink():
            if not path.resolve().is_relative_to(bundle.resolve()):
                raise RuntimeError(f'Link externo no pacote: {path}')
            continue
        if path.is_file() and path != previous:
            relative = path.relative_to(bundle).as_posix()
            immutable_runtime = relative.split('/')[0] in ('python', 'node', 'bin')
            if immutable_runtime and relative in prior_files and path.stat().st_mtime <= cutoff:
                files[relative] = prior_files[relative]
            else:
                files[relative] = digest(path)
    manifest_path = bundle.parent / (bundle.name + '.manifest.json') if platform.system() == 'Darwin' else bundle / 'manifest.json'
    manifest_path.write_text(json.dumps({'version': version,
        'platform': platform.system(), 'architecture': platform.machine().lower(),
        'files': files}, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--version', default='2026.10.17')
    parser.add_argument('--python-base', type=Path)
    parser.add_argument('--uv', default=shutil.which('uv'))
    parser.add_argument('--ffmpeg', type=Path, default=os.environ.get('DECUPA_FFMPEG'))
    parser.add_argument('--ffprobe', type=Path, default=os.environ.get('DECUPA_FFPROBE'))
    parser.add_argument('--runtime-only', action='store_true')
    parser.add_argument('--package-only', action='store_true', help='Reuse prepared runtimes; do not reinstall dependencies')
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or output.is_relative_to(ROOT):
        parser.error('Use uma pasta de saída fora do repositório.')
    if not args.uv:
        parser.error('Instale uv para construir o pacote. Ele não é exigido do usuário final.')
    cache = output / 'cache'
    cache.mkdir(parents=True, exist_ok=True)
    payload = output / 'payload'
    payload.mkdir(exist_ok=True)
    if not args.package_only:
        prepare_python(payload, cache, args.uv, args.python_base)
        (payload / 'bin').mkdir(exist_ok=True)
        shutil.copy2(args.uv, payload / 'bin' / ('uv.exe' if os.name == 'nt' else 'uv'))
        prepare_node(payload, cache)
        prepare_media(payload, args.ffmpeg, args.ffprobe)
    elif not (payload / 'node').is_dir() or not (payload / 'python').is_dir():
        parser.error('Prepare os runtimes antes de empacotar.')
    if args.runtime_only:
        return
    copy_source(payload / 'app')
    bundle = payload
    if platform.system() == 'Darwin':
        bundle = output / 'Decupa Viral.app'
        if bundle.exists():
            raise RuntimeError('Use uma pasta de saída nova para o pacote macOS.')
        wrappers(bundle, payload)
        shutil.copytree(payload, bundle / 'Contents/Resources/engine', symlinks=True)
        run('codesign', '--force', '--deep', '--sign', '-', bundle)
        run('codesign', '--verify', '--deep', '--strict', bundle)
    else:
        wrappers(bundle, payload)
    manifest(bundle, args.version, reuse_runtime=args.package_only)
    archive_base = output / ('Decupa-' + {'Windows':'Windows', 'Darwin':'macOS', 'Linux':'Linux'}[platform.system()] + '-' + ('arm64' if platform.machine().lower() in ('arm64','aarch64') else 'x64'))
    if platform.system() == 'Linux':
        with tarfile.open(str(archive_base) + '.tar.gz', 'w:gz') as archive:
            archive.add(bundle, arcname='Decupa-Viral')
        archive = Path(str(archive_base) + '.tar.gz')
    elif platform.system() == 'Darwin':
        archive = Path(str(archive_base) + '.zip')
        kit = output / 'Decupa-macOS'
        kit.mkdir(exist_ok=True)
        shutil.copytree(bundle, kit / bundle.name, symlinks=True)
        shutil.copy2(bundle.parent / (bundle.name + '.manifest.json'), kit)
        installer = kit / 'Instalar.command'
        installer.write_text('#!/bin/sh\nset -eu\nDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nAPP="$DIR/Decupa Viral.app/Contents/Resources/engine"\nexec "$APP/python/bin/python3" "$APP/app/desktop/install.py" --source "$DIR/Decupa Viral.app" "$@"\n', encoding='utf-8')
        installer.chmod(0o755)
        run('ditto', '-c', '-k', '--keepParent', kit, archive)
    else:
        archive = Path(str(archive_base) + '.zip')
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as target:
            for path in sorted(bundle.rglob('*')):
                if path.is_file():
                    target.write(path, Path(bundle.name) / path.relative_to(bundle))
    Path(str(archive) + '.sha256').write_text(digest(archive) + '  ' + archive.name + '\n', encoding='ascii')
    print(archive)


if __name__ == '__main__':
    main()
