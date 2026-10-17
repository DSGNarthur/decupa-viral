import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { encryptKey, put } from '../src/browser/db.js'
import { pickClips } from '../src/browser/ai.js'
const source = { title: 'Fixture', duration_seconds: 400 }
const segments = [0, 150, 300].map(start => ({ start, end: start + 30, text: 'Texto de teste' }))
test('comparação global escolhe IDs e preserva os intervalos candidatos', async () => {
  await put('settings', { id: 'local', key: await encryptKey('fixture-not-real') })
  const original = globalThis.fetch; let call = 0
  globalThis.fetch = async () => {
    const data = call < 3 ? [{ start: call * 150, end: call * 150 + 30, title: 'Candidato' }] : [2, 0]
    call++
    return new Response(JSON.stringify({ text: JSON.stringify(data) }))
  }
  try {
    const result = await pickClips(source, segments, { selection_strategy: 'global', min_duration: 15, max_duration: 60, max_clips: 2 })
    assert.deepEqual(result.map(c => [c.start, c.end]), [[300, 330], [0, 30]])
    assert.equal(call, 4)
  } finally { globalThis.fetch = original }
})
test('comparação global rejeita um ID que não pertence aos candidatos', async () => {
  const original = globalThis.fetch; let call = 0
  globalThis.fetch = async () => {
    const data = call < 3 ? [{ start: call * 150, end: call * 150 + 30 }] : [999]
    call++
    return new Response(JSON.stringify({ text: JSON.stringify(data) }))
  }
  try { await assert.rejects(pickClips(source, segments, { selection_strategy: 'global' }), /candidatos válidos/) }
  finally { globalThis.fetch = original }
})
