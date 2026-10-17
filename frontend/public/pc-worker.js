/* Only the paired browser talks to loopback. No video traverses Vercel. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/api/')) return
  event.respondWith((async () => {
    const client = await self.clients.get(event.clientId)
    if (!client) return new Response('Abra a plataforma para acessar os arquivos do PC.', { status: 401 })
    const credentials = await new Promise(resolve => {
      const channel = new MessageChannel()
      const timeout = setTimeout(() => { channel.port1.close(); resolve(null) }, 5000)
      channel.port1.onmessage = ({ data }) => { clearTimeout(timeout); channel.port1.close(); resolve(data) }
      client.postMessage({ type: 'pc-credentials' }, [channel.port2])
    })
    if (!credentials || credentials.origin !== 'http://127.0.0.1:16889' || !/^[A-Za-z0-9_-]{40,80}$/.test(credentials.token)) return new Response('Pareie este navegador com o aplicativo local.', { status: 401 })
    const headers = new Headers()
    for (const name of ['Range', 'Content-Type', 'Accept']) if (event.request.headers.has(name)) headers.set(name, event.request.headers.get(name))
    headers.set('Authorization', 'Bearer ' + credentials.token)
    try {
      const upstream = await fetch(credentials.origin + url.pathname + url.search, { method: event.request.method, headers, mode: 'cors', targetAddressSpace: 'loopback', credentials: 'omit', body: ['GET', 'HEAD'].includes(event.request.method) ? undefined : await event.request.arrayBuffer() })
      const outputHeaders = new Headers()
      for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Content-Disposition', 'Accept-Ranges']) if (upstream.headers.has(name)) outputHeaders.set(name, upstream.headers.get(name))
      outputHeaders.set('Cache-Control', 'no-store')
      return new Response(upstream.body, { status: upstream.status, headers: outputHeaders })
    } catch { return new Response('O PC está desconectado. Abra o aplicativo local e reconecte.', { status: 503 }) }
  })())
})
