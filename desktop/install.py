"""Per-user installation of a verified, self-contained release. No admin rights."""
import argparse
import json
import os
import platform
import plistlib
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

SITE = 'https://decupa-viral.vercel.app'
IDENTIFIER = 'app.decupa.viral.engine'


def desktop_quote(value):
    # Desktop Entry Exec has its own escaping rules, not shell quoting.
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%') + '"'


def install(source, destination=None, autostart=True, start=True, browser=True, register=True):
    system = platform.system()
    home = Path.home()
    if destination:
        target = Path(destination).expanduser().resolve()
    elif system == 'Windows':
        target = Path(os.environ['LOCALAPPDATA']) / 'Programs/Decupa Viral'
    elif system == 'Darwin':
        target = home / 'Applications/Decupa Viral.app'
    else:
        target = Path(os.environ.get('XDG_DATA_HOME', home / '.local/share')) / 'decupa-viral/engine'
    source = Path(source).resolve()
    # Never merge an update over a running interpreter or an unrelated folder.
    if target.exists():
        raise RuntimeError(f'Já existe uma instalação em {target}. Encerre e remova apenas o motor antes de instalar. Seus dados ficam em outra pasta.')
    if target == source or source in target.parents or target in source.parents:
        raise RuntimeError('Escolha uma pasta de instalação separada do pacote extraído.')
    manifest_path = source.parent / (source.name + '.manifest.json') if system == 'Darwin' else source / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest['platform'] != system or manifest['architecture'] != platform.machine().lower():
        raise RuntimeError('Este pacote não corresponde ao sistema ou à arquitetura deste computador.')
    import hashlib
    print('Verificando os arquivos do motor...', flush=True)
    for index, (name, digest) in enumerate(manifest['files'].items(), 1):
        item = source / name
        if not item.resolve().is_relative_to(source) or item.is_symlink() or not item.is_file():
            raise RuntimeError(f'Caminho inválido no pacote: {name}')
        with item.open('rb') as file:
            actual = hashlib.file_digest(file, 'sha256').hexdigest()
        if actual != digest:
            raise RuntimeError(f'Arquivo ausente ou alterado: {name}')
        if index % 1000 == 0:
            print(f'{index} arquivos verificados...', flush=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    print('Instalando o motor na pasta do seu usuário...', flush=True)
    shutil.copytree(source, target, symlinks=True)
    payload = target / 'Contents/Resources/engine' if system == 'Darwin' else target
    python = payload / ('python/pythonw.exe' if system == 'Windows' else 'python/bin/python3')
    entry = payload / 'app/desktop/runtime.py'
    command = [str(python), str(entry), '--background']
    if system == 'Windows' and register:
        import winreg
        quoted = subprocess.list2cmdline(command)
        if autostart:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Run') as key:
                winreg.SetValueEx(key, 'DecupaViral', 0, winreg.REG_SZ, quoted)
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\Classes\decupaviral') as key:
            winreg.SetValueEx(key, '', 0, winreg.REG_SZ, 'URL:Decupa Viral')
            winreg.SetValueEx(key, 'URL Protocol', 0, winreg.REG_SZ, '')
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\Classes\decupaviral\shell\open\command') as key:
            winreg.SetValueEx(key, '', 0, winreg.REG_SZ, quoted + ' --protocol "%1"')
    elif system == 'Darwin' and register:
        agents = home / 'Library/LaunchAgents'
        if autostart:
            agents.mkdir(parents=True, exist_ok=True)
            agent = agents / (IDENTIFIER + '.plist')
            with agent.open('wb') as file:
                plistlib.dump({'Label': IDENTIFIER, 'ProgramArguments': command,
                               'RunAtLoad': True, 'ProcessType': 'Background',
                               'ThrottleInterval': 20}, file)
        registrar = Path('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister')
        subprocess.run([str(registrar), '-f', str(target)], check=True)
    elif system == 'Linux' and register:
        config = Path(os.environ.get('XDG_CONFIG_HOME', home / '.config'))
        applications = Path(os.environ.get('XDG_DATA_HOME', home / '.local/share')) / 'applications'
        applications.mkdir(parents=True, exist_ok=True)
        launch = ' '.join(desktop_quote(p) for p in command)
        desktop = '[Desktop Entry]\nType=Application\nName=Decupa Viral\nTerminal=false\n'
        protocol = applications / 'decupa-viral.desktop'
        protocol.write_text(desktop + 'Exec=' + launch + ' --protocol %u\nMimeType=x-scheme-handler/decupaviral;\n', encoding='utf-8')
        if autostart:
            (config / 'autostart').mkdir(parents=True, exist_ok=True)
            (config / 'autostart/decupa-viral.desktop').write_text(desktop + 'Exec=' + launch + '\n', encoding='utf-8')
        if shutil.which('xdg-mime'):
            subprocess.run(['xdg-mime', 'default', protocol.name, 'x-scheme-handler/decupaviral'], check=True)
    if start:
        options = {'cwd': str(payload / 'app'), 'stdin': subprocess.DEVNULL,
                   'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
        if system == 'Windows':
            options['creationflags'] = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
        else:
            options['start_new_session'] = True
        subprocess.Popen(command, **options)
        print('Aguardando o motor iniciar...', flush=True)
        for _ in range(90):
            try:
                with urllib.request.urlopen('http://127.0.0.1:16889/api/health', timeout=2) as response:
                    if json.load(response).get('app') == 'Decupa Viral':
                        break
            except (OSError, ValueError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError('O motor foi instalado, mas não iniciou. Consulte os logs na pasta de dados antes de reinstalar.')
    if browser:
        webbrowser.open(SITE)
    print(f'Decupa Viral instalado em {target}. Abra {SITE}.')
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Instalar o motor Decupa Viral neste usuário')
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--destination', type=Path)
    parser.add_argument('--no-autostart', action='store_true')
    parser.add_argument('--no-start', action='store_true')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--no-register', action='store_true', help='Isolated acceptance test only; no protocol or autostart registration')
    args = parser.parse_args()
    install(args.source, args.destination, not args.no_autostart, not args.no_start, not args.no_browser, not args.no_register)
