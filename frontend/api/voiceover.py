import asyncio
import json
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size > 20000:
                raise ValueError('oversized request')
            data = json.loads(self.rfile.read(size))
            text = data.get('text', '')
            voice = data.get('voice', 'pt-BR-AntonioNeural')
            if not isinstance(text, str) or not 1 <= len(text) <= 5000 or voice not in ('pt-BR-AntonioNeural', 'pt-BR-FranciscaNeural'):
                raise ValueError('invalid voice request')
            import edge_tts
            async def synthesize():
                chunks = []
                async for chunk in edge_tts.Communicate(text, voice).stream():
                    if chunk['type'] == 'audio':
                        chunks.append(chunk['data'])
                return b''.join(chunks)
            audio = asyncio.run(synthesize())
            if not audio or len(audio) > 4 * 1048576:
                raise ValueError('invalid output size')
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
        except Exception:
            body = json.dumps({'detail': 'Não foi possível gerar a narração. Use até 5.000 caracteres e uma voz em português brasileiro.'}).encode()
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, *args):
        pass
