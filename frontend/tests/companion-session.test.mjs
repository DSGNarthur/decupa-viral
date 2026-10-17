import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const memory = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key,value) => map.set(key,String(value)), removeItem: key => map.delete(key) } }
async function setup() {
  globalThis.localStorage = memory()
  globalThis.sessionStorage = memory()
  globalThis.location = { hash: '', pathname: '/', search: '' }
  globalThis.history = { replaceState() {} }
  const worker = { scriptURL: 'https://decupa-viral.vercel.app/pc-worker.js' }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    permissions: { query: async () => ({ state:'granted' }) },
    serviceWorker: { controller: worker, ready: Promise.resolve(), register: async () => ({}), addEventListener() {} },
  } })
  return import('../src/companion/session.js?' + Math.random())
}

test('first use makes no loopback request until the user connects', async () => {
  const module = await setup()
  globalThis.fetch = () => { throw Error('Unexpected loopback request') }
  assert.equal(await module.prepareCompanion(),false)
})

test('new tabs bootstrap a process capability without persisting the secret', async () => {
  const module = await setup()
  localStorage.setItem('decupa-pc-enabled','true')
  const token = 'a'.repeat(43)
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({url,options})
    return new Response(JSON.stringify(url.endsWith('/connect') ? {token} : {runtime:'pc'}),{status:200})
  }
  assert.equal(await module.prepareCompanion(),true)
  assert.equal(calls[0].options.method,'POST')
  assert.equal(calls[0].options.headers['X-Decupa-Connect'],'1')
  assert.equal(calls[1].options.headers.Authorization,'Bearer '+token)
  assert.equal(module.pcSession().token,token)
  assert.equal(sessionStorage.getItem('decupa-pc-token'),null)
  assert.equal(localStorage.getItem('decupa-pc-token'),null)
  const next = 'b'.repeat(43)
  globalThis.fetch = async url => new Response(JSON.stringify(url.endsWith('/connect') ? {token:next} : {runtime:'pc'}))
  await module.prepareCompanion()
  assert.equal(module.pcSession().token,next)
})

test('a denied local-network permission makes no request and leaves no capability',async () => {
  const module = await setup()
  navigator.permissions.query = async () => ({state:'denied'})
  globalThis.fetch = () => { throw Error('Unexpected request') }
  await assert.rejects(module.prepareCompanion({interactive:true}),/bloqueou/)
  assert.equal(module.pcSession(),null)
})

test('download bridge streams upstream body instead of buffering the whole file', async () => {
  const worker = await readFile(new URL('../public/pc-worker.js',import.meta.url),'utf8')
  const download = await readFile(new URL('../src/companion/downloads.js',import.meta.url),'utf8')
  assert.match(worker,/new Response\(upstream.body/)
  assert.doesNotMatch(download,/\.blob\(|arrayBuffer\(/)
})
