/* Media is kept in this device's IndexedDB, never uploaded to Vercel. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('decupa-viral-browser')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function media(id, draft = false) {
  const connection = await db()
  if (draft) {
    id = await new Promise((resolve, reject) => {
      const req = connection.transaction('drafts', 'readonly').objectStore('drafts').get(id)
      req.onsuccess = () => resolve(req.result?.source_media_id)
      req.onerror = () => reject(req.error)
    })
    if (!id) { connection.close(); return null }
  }
  return new Promise((resolve, reject) => {
    const tx = connection.transaction('media', 'readonly')
    const req = tx.objectStore('media').get(id)
    req.onsuccess = () => { connection.close(); resolve(req.result) }
    req.onerror = () => { connection.close(); reject(req.error) }
  })
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (/^\/api\/downloaded\/[^/]+\/(frame|filmstrip)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const client = await self.clients.get(event.clientId)
      if (!client) return new Response(null, { status: 404 })
      return new Promise(resolve => {
        const channel = new MessageChannel()
        const timer = setTimeout(() => resolve(new Response(null, { status: 504 })), 20000)
        channel.port1.onmessage = ({ data }) => { clearTimeout(timer); channel.port1.close(); resolve(data.blob ? new Response(data.blob, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } }) : new Response(null, { status: 404 })) }
        client.postMessage({ type: 'media-frame', url: url.href }, [channel.port2])
      })
    })())
    return
  }
  const editor = url.pathname.match(/^\/api\/editor\/drafts\/([^/]+)\/stream$/)
  const match = editor || url.pathname.match(/^\/api\/(?:downloaded|videos)\/([^/]+)\/(stream|thumbnail|download)$/) || url.pathname.match(/^\/api\/tools\/download\/([^/]+)$/)
  if (!match) return
  event.respondWith((async () => {
    const id = match[1] + (match[2] === 'thumbnail' ? ':thumbnail' : '')
    const row = await media(id, !!editor)
    if (!row?.blob) return new Response('Arquivo não encontrado neste dispositivo', { status: 404 })
    const blob = row.blob
    const headers = { 'Content-Type': blob.type || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
    if (url.searchParams.has('download') || match[2] === 'download') headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(row.name || 'decupa-viral.mp4')}"`
    const range = event.request.headers.get('range')
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!m) return new Response(null, { status: 416 })
      let start = m[1] ? Number(m[1]) : Math.max(0, blob.size - Number(m[2]))
      let end = m[1] && m[2] ? Math.min(blob.size - 1, Number(m[2])) : blob.size - 1
      if (start > end || start >= blob.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } })
      headers['Content-Range'] = `bytes ${start}-${end}/${blob.size}`
      headers['Content-Length'] = String(end - start + 1)
      return new Response(blob.slice(start, end + 1), { status: 206, headers })
    }
    headers['Content-Length'] = String(blob.size)
    return new Response(blob, { headers })
  })())
})
