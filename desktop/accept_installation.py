"""Install a release into an isolated prefix, then exercise its relocated engine."""
import argparse
import json
import os
import platform
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--build-root', required=True, type=Path)
    args = parser.parse_args()
    build = args.build_root.resolve()
    repo = Path(__file__).resolve().parents[1]
    if build.is_relative_to(repo):
        parser.error('Use a pasta externa gerada pela compilação.')
    mac = platform.system() == 'Darwin'
    source = build / ('Decupa Viral.app' if mac else 'payload')
    source_payload = source / 'Contents/Resources/engine' if mac else source
    destination = build / 'installed-acceptance' / ('Decupa Viral.app' if mac else 'engine')
    source_python = source_payload / ('python/python.exe' if os.name == 'nt' else 'python/bin/python3')
    subprocess.run([str(source_python), str(source_payload / 'app/desktop/install.py'),
                    '--source', str(source), '--destination', str(destination),
                    '--no-start', '--no-browser', '--no-register'], check=True)
    installed = destination / 'Contents/Resources/engine' if mac else destination
    python = installed / ('python/python.exe' if os.name == 'nt' else 'python/bin/python3')
    report_path = build / 'smoke.json'
    subprocess.run([str(python), str(installed / 'app/desktop/smoke_distribution.py'),
                    '--payload', str(installed), '--output', str(report_path),
                    '--check-recovery'], check=True,
                   env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUTF8': '1'})
    report = json.loads(report_path.read_text(encoding='utf-8'))
    report['installed_in_separate_prefix'] = True
    report['native_registration'] = 'not exercised by isolated installer test'
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
