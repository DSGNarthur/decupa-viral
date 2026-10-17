"""Never run a Vercel mutation unless the authenticated Arthur workspace matches."""
import argparse
import json
import subprocess
import sys
import secrets
from pathlib import Path
from urllib.request import Request, urlopen

EXPECTED_USER = 'arthurcarvalho2317-1652'
EXPECTED_SCOPE = 'arthurcarvalho2317-1652s-projects'
EXPECTED_PROJECT = 'prj_7aDlxxrqufoZnLxmcFTPC5hyuQZP'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--auth-directory', required=True)
    parser.add_argument('--production', action='store_true')
    parser.add_argument('--stage', action='store_true', help='Prepare production without moving the public domain')
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    directory = Path(args.directory).resolve()
    auth_directory = Path(args.auth_directory).resolve()
    auth = json.loads((auth_directory / 'auth.json').read_text(encoding='utf-8'))
    token = auth.get('token')
    if not token:
        raise SystemExit('Autenticação do Arthur ausente. Nenhuma alteração executada.')
    def api(path):
        req = Request('https://api.vercel.com' + path, headers={'Authorization': 'Bearer ' + token})
        with urlopen(req, timeout=30) as response:
            return json.load(response)
    user = api('/v2/user')['user']
    if user.get('username') != EXPECTED_USER:
        raise SystemExit('Conta diferente do Arthur. Publicação bloqueada. Nenhuma alteração executada.')
    teams = api('/v2/teams?limit=100').get('teams', [])
    team = next((t for t in teams if t.get('slug') == EXPECTED_SCOPE), None)
    if not team:
        raise SystemExit('Workspace do Arthur não encontrado. Nenhuma alteração executada.')
    link = directory / '.vercel/project.json'
    if link.exists():
        linked = json.loads(link.read_text(encoding='utf-8'))
        if linked.get('orgId') != team['id'] or linked.get('projectId') != EXPECTED_PROJECT:
            raise SystemExit('A pasta está vinculada a outro projeto ou workspace. Publicação bloqueada.')
    project = api(f'/v9/projects/{EXPECTED_PROJECT}?teamId={team["id"]}')
    if project.get('name') != 'decupa-viral' or project.get('accountId') != team['id']:
        raise SystemExit('O projeto remoto não corresponde ao novo Decupa Viral do Arthur.')
    print(f'Identidade confirmada: {EXPECTED_USER}; workspace {EXPECTED_SCOPE}', flush=True)
    if args.check_only:
        return
    cli = ['vercel.cmd', '--global-config', str(auth_directory), '--scope', EXPECTED_SCOPE]
    if not link.is_file():
        raise SystemExit('Vínculo local ausente. Defina explicitamente o projeto autorizado antes de publicar.')
    linked = json.loads(link.read_text(encoding='utf-8'))
    if linked.get('orgId') != team['id'] or linked.get('projectId') != EXPECTED_PROJECT or linked.get('projectName', 'decupa-viral') != 'decupa-viral':
        raise SystemExit('O vínculo do projeto não corresponde ao destino autorizado. Deploy bloqueado.')
    command = cli + ['deploy', '--yes']
    if args.production or args.stage:
        command.append('--prod')
    if args.stage:
        command.append('--skip-domain')
    subprocess.run(command, cwd=directory, check=True)


if __name__ == '__main__':
    main()
