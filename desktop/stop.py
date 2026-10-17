"""Stop only this installed engine. Refuse to interrupt active jobs by default."""
import argparse
import json
import urllib.request
from pathlib import Path
import psutil


def stop(force=False):
    app = Path(__file__).resolve().parents[1]
    entry = app / 'desktop/runtime.py'
    owned = []
    for process in psutil.process_iter(['pid', 'exe', 'cmdline']):
        try:
            command = process.info['cmdline'] or []
            if any(Path(arg).resolve() == entry for arg in command[1:] if not arg.startswith('-')):
                executable = Path(process.info['exe']).resolve()
                if executable.is_relative_to(app.parent / 'python'):
                    owned.append(process)
        except (psutil.Error, OSError, ValueError):
            continue
    if not owned:
        return
    if not force:
        with urllib.request.urlopen('http://127.0.0.1:16889/api/jobs?limit=200', timeout=5) as response:
            result = json.load(response)
        jobs = result.get('jobs', []) if isinstance(result, dict) else result
        if any(job.get('status') in ('running','pending') for job in jobs):
            raise RuntimeError('Há tarefas em andamento. Termine ou cancele pelo site antes de encerrar o motor.')
    for parent in owned:
        try:
            children = parent.children(recursive=True)
            parent.terminate()
            for child in reversed(children):
                try:
                    child.terminate()
                except psutil.NoSuchProcess:
                    pass
            _, alive = psutil.wait_procs(children + [parent], timeout=10)
            for process in alive:
                process.kill()
        except psutil.NoSuchProcess:
            pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    try:
        stop(args.force)
    except Exception as exc:
        if __import__('os').name == 'nt':
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, str(exc), 'Decupa Viral', 0x30)
        else:
            print(str(exc))
        raise SystemExit(1)
