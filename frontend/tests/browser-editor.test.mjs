import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { dbPromise, get, put, uuid } from '../src/browser/db.js'
import { prepareDraft, saveDraft, requireDraft, assertUnreferenced, commitOutput, deleteDraft } from '../src/browser/editor.js'
import { browserDefaults, validateDocument, mappedWords, renderPlan } from '../src/editor/browser-document.js'
import { hasStoredOutput } from '../src/browser/jobs.js'

async function fixture() {
  const id = uuid()
  await put('sources', { id, title: 'Fonte original', width: 640, height: 360, duration_seconds: 8, segments: [{ start: 0, end: 2, text: 'Teste de edição' }] })
  await put('media', { id, blob: new Blob(['unchanged original']) })
  return { id, draft: await prepareDraft(id) }
}
test('cria o armazenamento de rascunhos sem perder os arquivos existentes', async () => {
  assert.equal((await dbPromise).version, 2)
  const { id, draft } = await fixture()
  assert.equal(draft.source_media_id, id)
  assert.equal(await (await get('media', id)).blob.text(), 'unchanged original')
  assert.equal((await prepareDraft(id)).id, draft.id)
})
test('salvamento concorrente aceita uma revisão e rejeita a outra', async () => {
  const { draft } = await fixture(), body = { revision: 1, document: draft.document }
  const results = await Promise.allSettled([saveDraft(draft.id, body), saveDraft(draft.id, body)])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(results.find(r => r.status === 'rejected').reason.response.status, 409)
  assert.equal((await requireDraft(draft.id)).revision, 2)
})
test('reordena as palavras pelos trechos e não recupera as removidas', () => {
  const doc = browserDefaults()
  doc.segments = [{ id: 'later', start: 4, end: 6 }, { id: 'first', start: 0, end: 1 }]
  doc.words = [{ id: 'a', start: 0, end: .8, text: 'Primeiro', highlight: false }, { id: 'b', start: 2, end: 3, text: 'Removido', highlight: false }, { id: 'c', start: 4, end: 5, text: 'Depois', highlight: true }]
  assert.deepEqual(mappedWords(doc).map(w => [w.text, w.start]), [['Depois', 0], ['Primeiro', 2]])
})
test('rejeita intervalos vazios, valores não finitos e filtros injetados', () => {
  const doc = browserDefaults(); doc.segments = [{ id: 'a', start: 0, end: 1 }]
  assert.throws(() => validateDocument({ ...doc, volume: NaN }, 8))
  assert.throws(() => validateDocument({ ...doc, segments: [{ id: 'x', start: 8, end: 8.04 }] }, 8))
  assert.throws(() => validateDocument({ ...doc, framing: { ...doc.framing, x: '0,evil' } }, 8))
  assert.throws(() => validateDocument({ ...doc, framing: { ...doc.framing, mode: 'face' } }, 8))
})
test('a fonte usada pelo editor fica protegida contra exclusão', async () => {
  const { id, draft } = await fixture()
  await assert.rejects(assertUnreferenced(id), e => e.response.status === 409)
  await deleteDraft(draft.id)
  await assertUnreferenced(id)
})
test('cancelamento impede publicação atômica de mídia e vídeo', async () => {
  const id = uuid(), mediaId = uuid()
  await put('jobs', { id, status: 'cancelled' })
  await assert.rejects(commitOutput(id, { videos: [{ id: mediaId }], mediaRows: [{ id: mediaId, blob: new Blob(['partial']) }], output: { video_id: mediaId } }), /cancelada/)
  assert.equal(await get('videos', mediaId), undefined)
  assert.equal(await get('media', mediaId), undefined)
})
test('resultado, mídia e status são gravados na mesma transação', async () => {
  const id = uuid(), mediaId = uuid()
  await put('jobs', { id, status: 'running' })
  await commitOutput(id, { videos: [{ id: mediaId, title: 'Pronto' }], mediaRows: [{ id: mediaId, blob: new Blob(['complete']) }], output: { video_id: mediaId } })
  assert.equal((await get('jobs', id)).status, 'success')
  assert.equal(await (await get('media', mediaId)).blob.text(), 'complete')
  assert.equal((await get('videos', mediaId)).title, 'Pronto')
})
test('reabre a exportação a partir da fonte limpa e do documento salvo', async () => {
  const { id, draft } = await fixture(), clip = uuid(), doc = structuredClone(draft.document)
  doc.segments = [{ id: 'edited', start: 2, end: 4 }]
  await put('videos', { id: clip, title: 'Editado', source_media_id: id, editor_source_meta: { duration: 8, width: 640, height: 360 }, editor_document: doc })
  const reopened = await prepareDraft(clip)
  assert.equal(reopened.source_media_id, id)
  assert.deepEqual(reopened.document.segments, doc.segments)
})
test('não exclui um rascunho com exportação em andamento', async () => {
  const { draft } = await fixture(), id = uuid()
  await put('jobs', { id, status: 'running', input_json: JSON.stringify({ draft_id: draft.id }) })
  await assert.rejects(deleteDraft(draft.id), e => e.response.status === 409)
})
test('plano de exportação sintetiza áudio para fonte silenciosa e limita a resolução', () => {
  const doc = browserDefaults(); doc.segments = [{ id: 'a', start: 0, end: 1 }]
  const plan = renderPlan(doc, { width: 1920, height: 1080, hasAudio: false })
  assert.equal(plan.width, 720); assert.equal(plan.height, 1280)
  assert.match(plan.args.join(' '), /anullsrc/)
  assert.doesNotMatch(plan.args.join(' '), /\[0:a\]/)
})
test('abre no editor um vídeo criado por uma ferramenta sem fonte importada', async () => {
  const id = uuid()
  await put('videos', { id, title: 'Ferramenta', video_width: 640, video_height: 360, duration_seconds: 3 })
  await put('media', { id, blob: new Blob(['video']) })
  const draft = await prepareDraft(id)
  assert.equal(draft.source_media_id, id)
  assert.equal(draft.duration, 3)
})
test('o histórico reconhece resultados cujo ID difere do ID da tarefa', async () => {
  const id = uuid(), output = uuid()
  await put('videos', { id: output, title: 'Resultado' })
  assert.equal(await hasStoredOutput({ id, output_json: JSON.stringify({ video_id: output }) }), true)
  assert.equal(await hasStoredOutput({ id, output_json: '{}' }), false)
})
