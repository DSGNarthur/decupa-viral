// SPDX-License-Identifier: AGPL-3.0-only
import { all, dbPromise, get, now, put, uuid } from './db.js'
import { startJob } from './jobs.js'
import { browserDefaults, mappedWords, renderPlan, validateDocument } from '../editor/browser-document.js'

export const apiError = (status, message) => {
  const error = new Error(message)
  error.response = { status, data: { detail: message } }
  throw error
}
const media = () => import('./media.js')
const total = doc => doc.segments.reduce((sum, s) => sum + s.end - s.start, 0)
const jobInput = job => { try { return JSON.parse(job.input_json || '{}') } catch { return {} } }
export async function requireDraft(id) {
  const row = await get('drafts', id)
  if (!row) apiError(404, 'Rascunho não encontrado neste navegador.')
  return row
}
export async function assertUnreferenced(id) {
  if ((await all('drafts')).some(d => d.source_media_id === id) || (await all('videos')).some(v => v.id !== id && (v.source_media_id === id || v.source_downloaded_video_id === id))) {
    apiError(409, 'Este arquivo é usado por uma edição. Exclua os rascunhos e os cortes que dependem dele antes de remover a fonte.')
  }
}
export function transcriptWords(segments = []) {
  return segments.flatMap(segment => {
    if (segment.words?.length) return segment.words.map(w => ({ id: uuid(), start: w.start, end: w.end, text: w.word || w.text || '', highlight: false }))
    const words = (segment.text || '').trim().split(/\s+/).filter(Boolean), length = segment.end - segment.start
    return words.map((text, index) => ({ id: uuid(), start: segment.start + index * length / words.length, end: segment.start + (index + 1) * length / words.length, text, highlight: false }))
  }).filter(w => w.end > w.start).slice(0, 5000)
}
export async function prepareDraft(id) {
  const existing = (await all('drafts')).filter(d => d.clip_id === id).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  if (existing) return existing
  const video = await get('videos', id), source = await get('sources', id)
  if (!video && !source) apiError(404, 'Vídeo não encontrado neste navegador.')
  const original = source || (video.source_media_id ? await get('sources', video.source_media_id) : null) || (video.source_downloaded_video_id ? await get('sources', video.source_downloaded_video_id) : null)
  const sourceId = video?.source_media_id || original?.id || id
  if (!(await get('media', sourceId))?.blob) apiError(404, 'A fonte desta edição não está mais neste dispositivo.')
  const meta = video?.editor_source_meta || (original ? { duration: original.duration_seconds, width: original.width, height: original.height } : { duration: video.duration_seconds, width: video.video_width, height: video.video_height })
  if (!meta.width || !meta.height || !(meta.duration > .04)) apiError(422, 'Selecione uma fonte com vídeo e duração válida.')
  let document = video?.editor_document ? structuredClone(video.editor_document) : browserDefaults()
  if (!video?.editor_document) {
    const start = original && video ? Math.max(0, video.clip_start || 0) : 0
    const end = original && video ? Math.min(meta.duration, video.clip_end || meta.duration) : meta.duration
    document.segments = [{ id: uuid(), start, end }]
    document.words = transcriptWords(original?.segments || [])
    document.captions.enabled = !!document.words.length && video?.caption_burned !== false
    document.framing.aspect = video?.aspect_ratio === '9:16' ? 'vertical' : 'original'
  }
  const row = { id: uuid(), clip_id: id, title: (video || source).title || 'Nova edição', revision: 1,
    source_media_id: sourceId, duration: meta.duration, width: meta.width, height: meta.height,
    document: validateDocument(document, meta.duration), updated_at: now(),
    provenance: { source_id: sourceId, note: video?.editor_document ? '' : 'A edição preserva a fonte original. Quando a transcrição contém frases, os tempos individuais das palavras são estimados. Cortes com pausas removidas são reabertos a partir do intervalo original.' } }
  await put('drafts', row)
  return row
}
export async function saveDraft(id, body) {
  const db = await dbPromise, tx = db.transaction('drafts', 'readwrite'), row = await tx.store.get(id)
  if (!row) { await tx.done; apiError(404, 'Rascunho não encontrado.') }
  if (row.revision !== body.revision) { await tx.done; apiError(409, 'Este rascunho foi alterado em outra aba. Recarregue antes de salvar.') }
  const document = validateDocument(body.document, row.duration)
  const next = { ...row, document, revision: row.revision + 1, updated_at: now() }
  await tx.store.put(next); await tx.done
  return next
}
export async function deleteDraft(id) {
  await requireDraft(id)
  if ((await all('jobs')).some(job => {
    const input = jobInput(job)
    return (['pending', 'running'].includes(job.status) || job.runner_active) && (input.draft_id === id || input.draft_ids?.includes(id))
  })) apiError(409, 'Aguarde a tarefa do editor terminar antes de excluir este rascunho.')
  const db = await dbPromise
  await db.delete('drafts', id)
  return { ok: true }
}
export async function commitOutput(jobId, { videos = [], sources = [], drafts = [], mediaRows = [], output }) {
  const tx = (await dbPromise).transaction(['jobs', 'videos', 'sources', 'drafts', 'media'], 'readwrite')
  const job = await tx.objectStore('jobs').get(jobId)
  if (!job || !['pending', 'running'].includes(job.status)) { await tx.done; apiError(409, 'Tarefa cancelada ou encerrada. Nenhum resultado parcial foi publicado.') }
  for (const [store, rows] of [['videos', videos], ['sources', sources], ['drafts', drafts], ['media', mediaRows]]) {
    for (const row of rows) await tx.objectStore(store).put(row)
  }
  await tx.objectStore('jobs').put({ ...job, status: 'success', progress_pct: 100, current_step: 'Concluído neste navegador', output_json: JSON.stringify(output), completed_at: now() })
  await tx.done
  return output
}
async function renderDraft(row, document, report, jobId) {
  const m = await media(), blob = await m.sourceBlob(row.source_media_id)
  if (blob.size > 512 * 1048576) apiError(422, 'A fonte ultrapassa 512 MB. Use um arquivo menor neste navegador.')
  if (total(document) > 600) apiError(422, 'Exporte até 10 minutos por vez neste navegador. Divida esta edição em trechos menores.')
  const probe = await m.probeMedia(blob), plan = renderPlan(document, { ...row, hasAudio: probe.streams.some(s => s.codec_type === 'audio') })
  const extras = {}
  if (document.captions.enabled && document.words.length) {
    const font = document.captions.font === 'Noto Serif' ? 'NotoSerif.ttf' : 'NotoSans.ttf'
    const response = await fetch('/engine/' + font)
    if (!response.ok) throw new Error('A fonte das legendas não está disponível. Atualize a página e tente novamente.')
    extras[font] = await response.blob(); extras['editor.ass'] = plan.ass
  }
  return { blob: await m.runFFmpeg(blob, plan.args, { extras, report, jobId }), plan }
}
export async function exportDraft(id, body) {
  const row = await requireDraft(id), document = validateDocument(body.document, row.duration)
  if (row.revision !== body.revision || JSON.stringify(document) !== JSON.stringify(row.document)) apiError(409, 'Salve a edição atual antes de exportar.')
  return startJob('editor_export', { draft_id: id, revision: row.revision }, async (report, jobId) => {
    const { blob, plan } = await renderDraft(row, document, report, jobId), videoId = uuid()
    const filename = `Decupa-${videoId.slice(0, 8)}.mp4`
    await report(96, 'Salvando a edição neste navegador...')
    const video = { id: videoId, title: row.title + ' (edição)', status: 'ready', source_type: 'clip_extraction', source_downloaded_video_id: row.provenance.source_id,
      source_media_id: row.source_media_id, editor_source_meta: { duration: row.duration, width: row.width, height: row.height }, editor_document: document,
      video_path: 'browser:' + videoId, thumbnail_path: null, file_exists: true, duration_seconds: plan.duration, video_width: plan.width, video_height: plan.height,
      aspect_ratio: plan.width === plan.height ? '1:1' : plan.width < plan.height ? '9:16' : '16:9', clip_start: 0, clip_end: plan.duration, clip_selection: 'manual', caption_burned: document.captions.enabled, file_size_mb: blob.size / 1048576, created_at: now() }
    return commitOutput(jobId, { videos: [video], mediaRows: [{ id: videoId, blob, name: filename }], output: { video_id: videoId, filename } })
  })
}
export async function combineDrafts(ids) {
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 8 || new Set(ids).size !== ids.length) apiError(422, 'Selecione de 2 a 8 rascunhos diferentes.')
  const rows = await Promise.all(ids.map(requireDraft))
  if (rows.reduce((sum, r) => sum + total(r.document), 0) > 600) apiError(422, 'A montagem pode ter até 10 minutos neste navegador.')
  return startJob('editor_combine', { draft_ids: ids }, async (report, jobId) => {
    const pieces = [], words = []; let cursor = 0, firstPlan
    for (const [index, row] of rows.entries()) {
      const clean = structuredClone(row.document); clean.captions.enabled = false
      const { blob, plan } = await renderDraft(row, clean, (pct, msg) => report((index + pct / 100) / rows.length * 75, msg), jobId)
      if (!firstPlan) firstPlan = plan
      pieces.push(blob)
      words.push(...mappedWords(row.document).map(w => ({ ...w, id: uuid(), start: w.start + cursor, end: w.end + cursor })))
      cursor += plan.duration
    }
    await report(80, 'Unindo os trechos e preservando as palavras...')
    const m = await media(), aspect = firstPlan.width === firstPlan.height ? '1:1' : firstPlan.width < firstPlan.height ? '9:16' : '16:9'
    const blob = await m.mergeMedia(pieces, aspect, report)
    await report(96, 'Salvando a montagem editável...')
    const meta = await m.metadata(blob), sourceId = uuid(), draftId = uuid(), document = browserDefaults()
    document.segments = [{ id: uuid(), start: 0, end: Math.min(cursor, meta.duration) }]; document.words = words.filter(w => w.end <= meta.duration + .05)
    document.captions = structuredClone(rows[0].document.captions); document.framing.aspect = 'original'
    const draft = { id: draftId, title: 'Montagem de cortes', clip_id: sourceId, source_media_id: sourceId, revision: 1, document: validateDocument(document, meta.duration), duration: meta.duration, width: meta.width, height: meta.height, updated_at: now(), provenance: { source_id: sourceId, note: 'Montagem com fonte limpa. As legendas continuam editáveis.' } }
    const source = { id: sourceId, title: draft.title, platform: 'import', file_exists: true, video_path: 'browser:' + sourceId, duration_seconds: meta.duration, width: meta.width, height: meta.height, segments: [], created_at: now(), aspect_ratio: meta.width < meta.height ? '9:16' : '16:9', file_size_mb: blob.size / 1048576 }
    return commitOutput(jobId, { drafts: [draft], sources: [source], mediaRows: [{ id: sourceId, blob, name: 'Decupa-montagem.mp4' }], output: { draft_id: draftId } })
  })
}
export async function editorRequest(path, method, body) {
  if (path === '/api/editor/drafts' && method === 'get') return { drafts: (await all('drafts')).map(d => ({ ...d, duration: total(d.document) })).sort((a, b) => b.updated_at.localeCompare(a.updated_at)) }
  if (path === '/api/editor/combine' && method === 'post') return combineDrafts(body.draft_ids)
  let match = path.match(/^\/api\/editor\/prepare\/([^/]+)$/)
  if (match && method === 'post') return prepareDraft(match[1])
  match = path.match(/^\/api\/editor\/drafts\/([^/]+)(?:\/(export))?$/)
  if (match) {
    if (match[2] && method === 'post') return exportDraft(match[1], body)
    if (!match[2] && method === 'put') return saveDraft(match[1], body)
    if (!match[2] && method === 'delete') return deleteDraft(match[1])
    if (!match[2] && method === 'get') return requireDraft(match[1])
  }
  apiError(404, 'Operação do editor não encontrada.')
}
