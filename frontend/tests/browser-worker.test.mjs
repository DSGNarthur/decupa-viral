import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { get, put } from '../src/browser/db.js'
test('o worker serve fonte de rascunho, intervalo de bytes e download sem localhost', async () => {
  await put('media', { id: 'worker-source', blob: new Blob(['0123456789'], { type: 'video/mp4' }), name: 'Decupa.mp4' })
  await put('drafts', { id: 'worker-draft', source_media_id: 'worker-source' })
  const events = {}, origin = 'https://decupa-viral.vercel.app'
  const self = { location: { origin }, addEventListener(name, handler) { events[name] = handler } }
  vm.runInNewContext(await fs.readFile(new URL('../public/media-worker.js', import.meta.url), 'utf8'), { self, indexedDB, Response, Blob, URL, MessageChannel, setTimeout, clearTimeout })
  const request = async (path, headers) => {
    let response
    events.fetch({ request: new Request(origin + path, { headers }), respondWith(promise) { response = promise } })
    return response
  }
  const ranged = await request('/api/editor/drafts/worker-draft/stream', { Range: 'bytes=2-5' })
  assert.equal(ranged.status, 206); assert.equal(await ranged.text(), '2345')
  assert.equal(ranged.headers.get('Content-Range'), 'bytes 2-5/10')
  const download = await request('/api/videos/worker-source/stream?download=1')
  assert.match(download.headers.get('Content-Disposition'), /attachment.*Decupa.mp4/)
  assert.equal(await download.text(), '0123456789')
  assert.equal((await request('/api/videos/worker-source/stream', { Range: 'bytes=100-200' })).status, 416)
  assert.equal((await request('/api/editor/drafts/missing/stream')).status, 404)
})
test('a inicialização substitui o worker do PC antes de abrir a biblioteca web', async () => {
  const callbacks = new Map(), removed = [], changes = [], sessions = new Map([['decupa-pc-token', 'old'], ['decupa-pc-connected', 'true']])
  const sw = { controller: { scriptURL: 'https://decupa-viral.vercel.app/pc-worker.js' }, ready: Promise.resolve(),
    addEventListener(name, callback) { callbacks.set(name, callback) }, removeEventListener(name) { callbacks.delete(name) },
    async register(url) { changes.push(url); setTimeout(() => { sw.controller = { scriptURL: 'https://decupa-viral.vercel.app/media-worker.js' }; callbacks.get('controllerchange')?.() }, 0) } }
  globalThis.window = { isSecureContext: true }
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true })
  globalThis.sessionStorage = { removeItem(name) { removed.push(name); sessions.delete(name) } }
  globalThis.location = { hash: '#pc=obsolete', pathname: '/editor', search: '' }
  globalThis.history = { replaceState(a, b, value) { changes.push(value) } }
  const { prepareBrowserRuntime } = await import('../src/browser/bootstrap.js')
  await prepareBrowserRuntime()
  assert.deepEqual(changes, ['/media-worker.js', '/editor'])
  assert.equal(sessions.size, 0)
  assert.deepEqual(removed, ['decupa-pc-token', 'decupa-pc-connected'])
  assert.equal((await get('drafts', 'worker-draft')).source_media_id, 'worker-source')
})
