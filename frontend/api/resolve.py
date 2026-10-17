"""Resolve public YouTube URLs. Heavy media processing remains in the browser."""
import base64
import hashlib
import hmac
import json
import os
import time
import shutil
import importlib.util
import gzip
import tempfile
import threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse
_node_lock = threading.Lock()


def node_runtime():
    """Python Functions do not inherit the build machine's Node installation."""
    found = shutil.which('node')
    if found:
        return found
    root = Path(__file__).resolve().parents[1] / 'server-runtime'
    manifest = root / 'node.json'
    archive = root / 'node.gz'
    if manifest.is_file() and archive.is_file():
        expected = json.loads(manifest.read_text())['sha256']
        executable = Path(tempfile.gettempdir()) / ('decupa-node-' + expected[:16])
        with _node_lock:
            if not executable.is_file():
                binary = gzip.decompress(archive.read_bytes())
                if hashlib.sha256(binary).hexdigest() != expected:
                    raise RuntimeError('Invalid bundled JavaScript runtime')
                executable.write_bytes(binary)
                executable.chmod(0o700)
        return str(executable)
    spec = importlib.util.find_spec('nodejs_wheel')
    if spec and spec.origin:
        root = Path(spec.origin).parent
        for relative in ('bin/node', 'node', 'node.exe'):
            candidate = root / relative
            if candidate.is_file():
                return str(candidate)
    return None


def classify_failure(exc):
    message = str(exc).lower()
    if "confirm you" in message and "bot" in message:
        return 'youtube_access_check', 'O YouTube exige uma confirmação de acesso para a conexão da Vercel. O download foi interrompido pela origem.'
    if 'private video' in message or 'sign in' in message:
        return 'youtube_auth_required', 'Este vídeo exige acesso autenticado no YouTube e não está disponível para importação pública.'
    if 'format' in message:
        return 'youtube_formats_unavailable', 'O YouTube não disponibilizou um formato de vídeo compatível nesta conexão.'
    if isinstance(exc, ModuleNotFoundError):
        return 'runtime_dependency_missing', 'Um componente do motor de download não foi incluído nesta publicação.'
    return 'youtube_download_failed', 'Não foi possível consultar o vídeo no YouTube nesta conexão.'


class SafeLogger:
    def debug(self, message):
        pass

    def warning(self, message):
        pass

    def error(self, message):
        # Do not put cookies, signed URLs, or user headers into Vercel logs.
        pass


def youtube_options(cap, node):
    if not node:
        raise RuntimeError('JavaScript runtime missing')
    return {
        'quiet': True, 'no_warnings': True, 'logger': SafeLogger(),
        'noplaylist': True, 'skip_download': True, 'cachedir': False,
        'socket_timeout': 10, 'retries': 1, 'extractor_retries': 1,
        'js_runtimes': {'node': {'path': node}},
        'remote_components': {'ejs:github': {}},
        'format_sort': ['lang', f'res:{cap}', 'fps', 'codec:avc:m4a', 'size', 'br'],
        'extractor_args': {'youtube': {
            'player_client': ['tv', 'web_embedded', 'android_vr'],
            'webpage_client': ['web'],
        }},
        'format': f'bestvideo[height<={cap}][ext=mp4][protocol=https]+bestaudio[ext=m4a][protocol=https]/best[height<={cap}][ext=mp4][protocol=https]/bestvideo[height<={cap}][protocol=https]+bestaudio[protocol=https]/best[height<={cap}][protocol=https]',
    }


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size > 10000:
                return self.reply(400, {'detail': 'Solicitação inválida.'})
            body = json.loads(self.rfile.read(size))
            url = body.get('url', '')
            host = (urlparse(url).hostname or '').lower()
            if host not in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'):
                return self.reply(400, {'detail': 'Use um link público do YouTube.'})
            secret = os.environ.get('DOWNLOAD_SIGNING_SECRET', '')
            if not secret:
                return self.reply(503, {'detail': 'O download por link ainda precisa ser configurado nesta publicação. Importe um arquivo do dispositivo.'})
            import yt_dlp
            quality = body.get('quality', '720p')
            cap = int(quality[:-1]) if isinstance(quality, str) and quality.endswith('p') and quality[:-1].isdigit() else 1080
            cap = min(2160, max(240, cap))
            node = node_runtime()
            opts = youtube_options(cap, node)
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
            formats = info.get('requested_formats') or [info]
            video = next((f for f in formats if f.get('vcodec') not in ('none', None)), formats[0])
            audio = next((f for f in formats if f is not video and f.get('acodec') not in ('none', None)), None)
            def sign(fmt):
                stream_url = fmt.get('url', '')
                stream_host = (urlparse(stream_url).hostname or '').lower()
                if not stream_host.endswith('.googlevideo.com'):
                    raise ValueError('unsupported stream origin')
                payload = json.dumps({'url': stream_url, 'exp': int(time.time()) + 3600, 'headers': {k: v for k, v in (fmt.get('http_headers') or {}).items() if k.lower() in ('user-agent', 'referer', 'origin')}}, separators=(',', ':')).encode()
                encoded = base64.urlsafe_b64encode(payload).rstrip(b'=').decode()
                signature = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
                return {'token': encoded + '.' + signature, 'filesize': fmt.get('filesize') or fmt.get('filesize_approx'), 'content_type': 'audio/mp4' if fmt.get('vcodec') == 'none' else 'video/mp4'}
            return self.reply(200, {'title': info.get('title'), 'height': video.get('height'), 'video': sign(video), 'audio': sign(audio) if audio else None})
        except Exception as exc:
            reason, detail = classify_failure(exc)
            print(json.dumps({'youtube_resolver_error': reason, 'node_available': bool(node_runtime())}), flush=True)
            return self.reply(502, {'code': reason, 'detail': detail + ' Você pode importar o arquivo salvo no aparelho.'})

    def reply(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass
