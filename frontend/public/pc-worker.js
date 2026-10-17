/* Only the paired browser talks to loopback. No video traverses Vercel. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
const transfers = new Map()
const validCredentials = value => value?.origin === 'http://127.0.0.1:16889' && /^[A-Za-z0-9_-]{40,80}$/.test(value.token)
self.addEventListener('message', event => {
  if (event.data?.type !== 'pc-download') return
  const { id, path, credentials } = event.data
  const source = event.source
  const allowed = source?.type === 'window' && new URL(source.url).origin === self.location.origin
  const safePath = typeof path === 'string' && path.startsWith('/api/') && !/[\r\n#]/.test(path)
  if (!allowed || !/^[a-f0-9-]{36}$/.test(id) || !safePath || !validCredentials(credentials)) {
    event.ports[0]?.postMessage({ ok: false })
    return
  }
  const now = Date.now()
  for (const [key, item] of transfers) if (item.expires <= now) transfers.delete(key)
  if (transfers.size >= 100) { event.ports[0]?.postMessage({ ok: false }); return }
  transfers.set(id, { path, credentials, clientId: source.id, expires: now + 60000 })
  event.ports[0]?.postMessage({ ok: true })
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  const download = url.pathname.startsWith('/_pc-download/')
  if (url.origin !== self.location.origin || (!url.pathname.startsWith('/api/') && !download)) return
  event.respondWith((async () => {
    let credentials, transferClient, path = url.pathname + url.search
    if (download) {
      const id = url.pathname.slice('/_pc-download/'.length)
      const transfer = transfers.get(id)
      transfers.delete(id)
      if (event.request.method !== 'GET' || !transfer || transfer.expires <= Date.now()) return new Response('Download expirado. Clique em Baixar novamente.', { status: 410 })
      credentials = transfer.credentials
      path = transfer.path
      transferClient = transfer.clientId
    } else {
    const client = await self.clients.get(event.clientId)
    if (!client) return new Response('Abra a plataforma para acessar os arquivos do PC.', { status: 401 })
    credentials = await new Promise(resolve => {
      const channel = new MessageChannel()
      const timeout = setTimeout(() => { channel.port1.close(); resolve(null) }, 5000)
      channel.port1.onmessage = ({ data }) => { clearTimeout(timeout); channel.port1.close(); resolve(data) }
      client.postMessage({ type: 'pc-credentials' }, [channel.port2])
    })
    }
    if (!validCredentials(credentials)) return new Response('Pareie este navegador com o aplicativo local.', { status: 401 })
    const headers = new Headers()
    for (const name of ['Range', 'Content-Type', 'Accept']) if (event.request.headers.has(name)) headers.set(name, event.request.headers.get(name))
    headers.set('Authorization', 'Bearer ' + credentials.token)
    try {
      const upstream = await fetch(credentials.origin + path, { method: event.request.method, headers, mode: 'cors', targetAddressSpace: 'loopback', credentials: 'omit', body: ['GET', 'HEAD'].includes(event.request.method) ? undefined : await event.request.arrayBuffer() })
      if (download && !upstream.ok) {
        const owner = await self.clients.get(transferClient)
        owner?.postMessage({ type: 'pc-download-error', message: `O motor recusou o download (HTTP ${upstream.status}). Reconecte e tente novamente.` })
        return new Response('Não foi possível baixar o arquivo.', { status: upstream.status })
      }
      const outputHeaders = new Headers()
      for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Content-Disposition', 'Accept-Ranges']) if (upstream.headers.has(name)) outputHeaders.set(name, upstream.headers.get(name))
      outputHeaders.set('Cache-Control', 'no-store')
      return new Response(upstream.body, { status: upstream.status, headers: outputHeaders })
    } catch {
      if (download) {
        const owner = await self.clients.get(transferClient)
        owner?.postMessage({ type: 'pc-download-error', message: 'O motor não respondeu ao download. Inicie o motor e reconecte.' })
      }
      return new Response('O PC está desconectado. Abra o aplicativo local e reconecte.', { status: 503 })
    }
  })())
})
