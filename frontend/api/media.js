import { createHmac, timingSafeEqual } from 'node:crypto'
export const maxDuration = 60
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Use GET.' })
  try {
    const query = new URL(req.url, 'https://local.invalid').searchParams
    const [encoded, signature = ''] = (query.get('token') || '').split('.')
    const secret = process.env.DOWNLOAD_SIGNING_SECRET
    if (!secret || !encoded || !/^[a-f0-9]{64}$/.test(signature)) return res.status(403).json({ detail: 'Download não autorizado.' })
    const expected = createHmac('sha256', secret).update(encoded).digest()
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return res.status(403).json({ detail: 'Download não autorizado.' })
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString())
    const url = new URL(data.url)
    if (data.exp < Date.now() / 1000 || url.protocol !== 'https:' || !url.hostname.endsWith('.googlevideo.com') || url.username || url.password || url.port) return res.status(403).json({ detail: 'O link de download expirou ou é inválido.' })
    const start = Number(query.get('start') || 0)
    if (!Number.isSafeInteger(start) || start < 0) return res.status(400).json({ detail: 'Intervalo inválido.' })
    const chunk = 2 * 1048576
    const response = await fetch(url, { signal: AbortSignal.timeout(50000), redirect: 'error', headers: { ...data.headers, Range: `bytes=${start}-${start + chunk - 1}` } })
    if (![200, 206].includes(response.status)) return res.status(502).json({ detail: 'A origem recusou a transferência.' })
    if (response.status === 200 && Number(response.headers.get('Content-Length')) > chunk) { await response.body?.cancel(); return res.status(502).json({ detail: 'A origem não aceitou a transferência por partes.' }) }
    const reader = response.body.getReader(), chunks = []
    let bytes = 0
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.length
      if (bytes > chunk) { await reader.cancel(); return res.status(502).json({ detail: 'A origem não respeitou o limite da transferência.' }) }
      chunks.push(Buffer.from(part.value))
    }
    res.setHeader('Content-Type', response.headers.get('Content-Type') || 'video/mp4')
    if (response.headers.has('Content-Range')) res.setHeader('Content-Range', response.headers.get('Content-Range'))
    res.setHeader('Content-Length', String(bytes))
    return res.status(response.status).send(Buffer.concat(chunks))
  } catch { return res.status(502).json({ detail: 'Não foi possível transferir esta parte do vídeo.' }) }
}
