import test from 'node:test'
import assert from 'node:assert/strict'
import { connectWhileEngineStarts, LOCAL_ENGINE_START_URL, requestLocalEngineStart } from '../src/companion/start.js'

test('requests the registered local protocol from the current user action', () => {
  const events = []
  const documentRef = {
    createElement(tag) {
      assert.equal(tag, 'a')
      return {
        style: {},
        click() { events.push(['click', this.href]) },
        remove() { events.push(['remove']) },
      }
    },
    body: { appendChild(link) { events.push(['append', link.href]) } },
  }

  requestLocalEngineStart(documentRef)

  assert.deepEqual(events, [
    ['append', LOCAL_ENGINE_START_URL],
    ['click', LOCAL_ENGINE_START_URL],
    ['remove'],
  ])
})

test('retries transient local startup failures until the engine connects', async () => {
  let now = 0
  let calls = 0
  const connected = await connectWhileEngineStarts(async () => {
    calls += 1
    if (calls < 3) throw new Error('O motor está desligado ou o navegador bloqueou o acesso local.')
    return true
  }, {
    timeoutMs: 2000,
    intervalMs: 100,
    now: () => now,
    sleep: async ms => { now += ms },
  })

  assert.equal(connected, true)
  assert.equal(calls, 3)
})

test('does not retry permission or installation errors', async () => {
  let calls = 0
  await assert.rejects(() => connectWhileEngineStarts(async () => {
    calls += 1
    throw new Error('O Chrome bloqueou o acesso aos aplicativos deste computador.')
  }, { sleep: async () => { throw new Error('Unexpected retry') } }), /O Chrome bloqueou/)
  assert.equal(calls, 1)
})

test('stops retrying when the startup window expires', async () => {
  let now = 0
  await assert.rejects(() => connectWhileEngineStarts(async () => {
    throw new Error('O motor está desligado.')
  }, {
    timeoutMs: 200,
    intervalMs: 100,
    now: () => now,
    sleep: async ms => { now += ms },
  }), /O Decupa não iniciou/)
})
