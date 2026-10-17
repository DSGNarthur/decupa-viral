import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { get, put, encryptKey, decryptKey } from '../src/browser/db.js'
import { startJob, recoverInterruptedJobs } from '../src/browser/jobs.js'
import { validateRanges } from '../src/browser/ai.js'
import aiHandler from '../api/ai.js'
import mediaHandler from '../api/media.js'

function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(n) { this.statusCode = n; return this }, json(data) { this.body = data; return this }, send(data) { this.body = data; return this } }
}
test('a chave é criptografada e recuperada sem ser salva em texto', async () => {
  const value = 'fixture-not-a-real-key'
  const encrypted = await encryptKey(value)
  assert.notEqual(encrypted.bytes, value)
  assert.equal(await decryptKey(encrypted), value)
  await put('settings', { id: 'test', key: encrypted })
  assert.equal((await get('settings', 'test')).ai_api_key, undefined)
})
test('a API recusa um destino arbitrário e não faz requisição externa', async () => {
  const original = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('should not run') }
  try {
    const res = response()
    await aiHandler({ method: 'POST', body: { api_key: 'fixture', base_url: 'http://127.0.0.1', messages: [] } }, res)
    assert.equal(res.statusCode, 400); assert.equal(called, false)
  } finally { globalThis.fetch = original }
})
test('o proxy do DeepSeek desativa thinking e não devolve a chave', async () => {
  const original = globalThis.fetch
  let request
  globalThis.fetch = async (url, opts) => { request = { url, opts }; return { ok: true, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) } }
  try {
    const res = response()
    await aiHandler({ method: 'POST', body: { api_key: 'fixture-secret', base_url: 'https://api.deepseek.com', model: 'deepseek-flash', messages: [{ role: 'user', content: 'OK' }] } }, res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(JSON.parse(request.opts.body).thinking, { type: 'disabled' })
    assert.equal(res.body.text, 'OK')
    assert.ok(!JSON.stringify(res.body).includes('fixture-secret'))
  } finally { globalThis.fetch = original }
})
test('o download por partes rejeita tokens sem assinatura válida', async () => {
  const res = response()
  await mediaHandler({ method: 'GET', url: '/api/media?token=invalid&start=0' }, res)
  assert.equal(res.statusCode, 403)
})
test('a seleção da IA rejeita tempos inválidos, sobreposição e duração fora dos limites', () => {
  const ranges = validateRanges([
    { start: -1, end: 20 }, { start: 0, end: 14 }, { start: 0, end: 30, title: 'Trecho válido' },
    { start: 20, end: 50 }, { start: 40, end: 101 }, { start: 'NaN', end: 80 }, { start: 50, end: 80 },
  ], 100, 3, 15, 60)
  assert.deepEqual(ranges.map(({ start, end }) => [start, end]), [[0, 30], [50, 80]])
  assert.throws(() => validateRanges([{ start: 120, end: 130 }], 100), /trechos válidos/)
})

test('abrir outra aba preserva tarefas com executor vivo e recupera as interrompidas', async () => {
  const held = new Set()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request(name, options, callback) {
      if (typeof options === 'function') { callback = options; options = {} }
      if (options.ifAvailable && held.has(name)) return Promise.resolve(callback(null))
      held.add(name)
      return Promise.resolve(callback({ name })).finally(() => held.delete(name))
    },
  } })
  let release
  const gate = new Promise(resolve => { release = resolve })
  const first = await startJob('test', {}, async () => { await gate; return { complete: true } })
  const until = async condition => {
    const end = Date.now() + 3000
    while (!(await condition())) {
      if (Date.now() > end) assert.fail('A tarefa não chegou ao estado esperado.')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
  await until(async () => (await get('jobs', first.job_id)).status === 'running')
  await put('jobs', { id: 'orphan', owner: 'closed-page', status: 'running' })
  await recoverInterruptedJobs()
  assert.equal((await get('jobs', first.job_id)).status, 'running')
  assert.equal((await get('jobs', 'orphan')).status, 'failed')
  let secondExecuted = false
  const second = await startJob('test', {}, async () => { secondExecuted = true })
  const queued = await get('jobs', second.job_id)
  await put('jobs', { ...queued, status: 'cancelled' })
  release()
  await until(async () => (await get('jobs', second.job_id)).runner_active === false)
  assert.equal(secondExecuted, false)
  const completed = await get('jobs', first.job_id)
  assert.equal(completed.status, 'success')
  assert.deepEqual(JSON.parse(completed.output_json), { complete: true })
})

test('resposta vazia da IA não é apresentada como sucesso', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) })
  try {
    const res = response()
    await aiHandler({ method: 'POST', body: { api_key: 'fixture-secret', base_url: 'https://api.deepseek.com', model: 'deepseek-flash', messages: [{ role: 'user', content: 'OK' }] } }, res)
    assert.equal(res.statusCode, 502)
  } finally { globalThis.fetch = original }
})
