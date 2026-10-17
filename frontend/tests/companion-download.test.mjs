import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

const origin = 'https://decupa-viral.vercel.app'
const id = '00000000-0000-4000-8000-000000000001'
const credentials = { origin:'http://127.0.0.1:16889', token:'a'.repeat(43) }
async function worker() {
  const handlers = {}, calls = []
  let now = 1000
  const context = vm.createContext({
    URL, Response, Headers, Date: { now: () => now },
    self: { location:{origin}, addEventListener:(name, handler) => {handlers[name] = handler},
      clients:{get:async () => null} },
    fetch:async (url, options) => {
      calls.push({url,options})
      return new Response(new ReadableStream({start(controller) { controller.enqueue(new Uint8Array([1,2,3])); controller.close() }}),
        {headers:{'Content-Type':'video/mp4','Content-Disposition':'attachment; filename="corte.mp4"'}})
    },
  })
  vm.runInContext(await readFile(new URL('../public/pc-worker.js', import.meta.url),'utf8'),context)
  const register = (source={type:'window',url:origin+'/editor'}, changes={}) => {
    let reply
    handlers.message({source, data:{type:'pc-download',id,path:'/api/videos/test/stream?download=1',credentials,...changes},ports:[{postMessage:value => {reply = value}}]})
    return reply
  }
  const download = async () => {
    let response
    handlers.fetch({clientId:'',request:new Request(origin+'/_pc-download/'+id),respondWith:value => {response = value}})
    return await response
  }
  return {calls,register,download,expire:() => {now += 61000}}
}

test('a download without clientId streams the paired file once and keeps the backend token out of the URL', async () => {
  const engine = await worker()
  assert.equal(engine.register().ok,true)
  const response = await engine.download()
  assert.equal(response.status,200)
  assert.equal(response.headers.get('Content-Type'),'video/mp4')
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3])
  assert.equal(engine.calls[0].url,'http://127.0.0.1:16889/api/videos/test/stream?download=1')
  assert.equal(engine.calls[0].options.headers.get('Authorization'),'Bearer '+credentials.token)
  assert.equal((await engine.download()).status,410)
  assert.equal(engine.calls.length,1)
})

test('foreign clients, invalid credentials and expired transfers cannot download local files', async () => {
  const engine = await worker()
  assert.equal(engine.register({type:'window',url:'https://other.example/'}).ok,false)
  assert.equal(engine.register(undefined,{credentials:{...credentials,origin:'http://192.168.1.2'}}).ok,false)
  assert.equal((await engine.download()).status,410)
  engine.register()
  engine.expire()
  assert.equal((await engine.download()).status,410)
  assert.equal(engine.calls.length,0)
})
