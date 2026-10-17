import { all, get, put, remove, uuid, now, encryptKey } from './db'
import { emit } from './events'
import { startJob } from './jobs'
import { importSource, downloadSource } from './sources'
import { sourceBlob, thumbnail, saveMedia } from './media'
import { transcribe } from './transcribe'
import { extractClips, suggestClips } from './clips'
import { runTool } from './tools'
import { aiChat, parseJson } from './ai'
import { toolJobTypeFor } from '../components/tools/toolJobType'
import { PRODUCERS, MEDIA, ORIGINS } from '../components/librarynext/assetModel'

const defaults = { ai_provider: 'openai_compatible', ai_model: 'deepseek-flash', ai_base_url: 'https://api.deepseek.com', ai_api_key_set: false, youtube_api_key_set: false, preferred_voice_id: 'pt-BR-AntonioNeural', tts_provider: 'edge_tts', preferred_tts_voice: 'pt-BR-AntonioNeural', caption_style: 'viral', caption_enabled: true, music_enabled: false, upload_to_youtube: false, upload_to_tiktok: false }
function error(message, status = 400) { const e = new Error(message); e.response = { status, data: { detail: message } }; throw e }
const newest = rows => rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
const page = (rows, params) => rows.slice(Math.max(0, Number(params.get('offset')) || 0), (Number(params.get('offset')) || 0) + Math.min(500, Number(params.get('limit')) || 100))
function publicSettings(s) { const { key, youtube_key, ...visible } = s || {}; return { ...defaults, ...visible, ai_api_key_set: !!key, youtube_api_key_set: !!youtube_key } }
async function queuedExport(id, row, body) {
  const form = new FormData()
  form.append('file', await sourceBlob(id), row.filename || 'video.mp4')
  form.append('target_aspect', body.target_aspect || '16:9')
  const started = await startJob('tool:reframe', { video_id: id, target_aspect: body.target_aspect }, (report, jobId) => runTool('reframe', form, report, jobId))
  while (true) {
    const task = await get('jobs', started.job_id)
    if (task.status === 'success') return (await get('media', started.job_id)).blob
    if (['failed', 'cancelled'].includes(task.status)) error(task.error_message || 'A exportação foi cancelada.')
    await new Promise(resolve => setTimeout(resolve, 300))
  }
}
async function libraryItems(params) {
  const sources = await all('sources'), videos = await all('videos')
  let rows = [
    ...sources.map(s => ({ ...s, key: `dl:${s.id}`, store: 'downloaded', media: 'video', origin: 'imported', producer: 'download', parent_key: null, stream_url: `/api/downloaded/${s.id}/stream`, thumb_url: `/api/downloaded/${s.id}/thumbnail`, aspect: s.aspect_ratio, size_mb: s.file_size_mb })),
    ...videos.map(v => ({ ...v, key: `gv:${v.id}`, store: 'generated', media: v.content_type?.startsWith('audio/') ? 'audio' : v.content_type?.startsWith('text/') ? 'doc' : v.content_type?.startsWith('image/') ? 'image' : 'video', origin: v.source_type === 'clip_extraction' || v.source_type.startsWith('tool:') ? 'edited' : 'created', producer: v.source_type, parent_key: v.source_downloaded_video_id ? `dl:${v.source_downloaded_video_id}` : null, stream_url: `/api/videos/${v.id}/stream`, thumb_url: `/api/videos/${v.id}/thumbnail`, aspect: v.aspect_ratio, size_mb: v.file_size_mb })),
  ]
  rows = rows.map(row => ({ ...row, source: row.store, producer_key: row.producer, producer: PRODUCERS[row.producer]?.label || 'Importação', ext: row.filename ? row.filename.split('.').at(-1) : row.media === 'doc' ? 'txt' : row.media === 'audio' ? 'mp3' : row.media === 'image' ? 'png' : 'mp4' }))
  const count = rows.length
  const facets = { all: count, media: {}, origin: {}, producers: [] }
  for (const k of Object.keys(MEDIA)) facets.media[k] = rows.filter(x => x.media === k).length
  for (const k of Object.keys(ORIGINS)) facets.origin[k] = rows.filter(x => x.origin === k).length
  for (const key of new Set(rows.map(x => x.producer_key))) facets.producers.push({ key, label: PRODUCERS[key]?.label || 'Importação', count: rows.filter(x => x.producer_key === key).length })
  const q = (params.get('q') || '').toLowerCase()
  if (q) rows = rows.filter(x => x.title.toLowerCase().includes(q))
  for (const field of ['media', 'origin', 'producer']) if (params.get(field)) rows = rows.filter(x => params.get(field).split(',').includes(x[field === 'producer' ? 'producer_key' : field]))
  newest(rows)
  if (params.get('sort') === 'oldest') rows.reverse()
  if (params.get('sort') === 'title') rows.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
  return { rows, total: rows.length, library_total: count, facets }
}
let chatSession = null
export async function handleChat(message) {
  if (message.type === 'set_session') { chatSession = message.session_id; return }
  if (message.type !== 'chat_message') return
  try {
    if (!chatSession) {
      chatSession = uuid()
      const session = { id: chatSession, title: message.content.slice(0, 60), created_at: now(), updated_at: now(), message_count: 0 }
      await put('sessions', session)
      emit('session_created', { session_id: chatSession, title: session.title, session })
    }
    await put('messages', { id: uuid(), session_id: chatSession, role: 'user', content: message.content, created_at: now() })
    const history = (await all('messages')).filter(x => x.session_id === chatSession).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-30).map(({ role, content }) => ({ role, content }))
    emit('chat_token', { token: '' })
    const reply = await aiChat(history, 4096)
    emit('chat_token', { token: reply })
    await put('messages', { id: uuid(), session_id: chatSession, role: 'assistant', content: reply, created_at: now() })
    const session = await get('sessions', chatSession)
    const count = (await all('messages')).filter(x => x.session_id === chatSession).length
    await put('sessions', { ...session, updated_at: now(), message_count: count })
    emit('session_updated', { session_id: chatSession, title: session.title, message_count: count })
    emit('chat_done', { full_response: reply })
  } catch (e) { emit('chat_error', { error: e.message }) }
}
export async function handleRequest(config) {
  const url = new URL(config.url, location.origin)
  for (const [key, value] of Object.entries(config.params || {})) if (value != null) url.searchParams.set(key, value)
  const p = url.pathname, params = url.searchParams, method = (config.method || 'get').toLowerCase()
  let body = config.data
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch {} }
  body ||= {}
  if (p === '/api/health') return { ok: true, app: 'Decupa Viral', runtime: 'browser' }
  if (p === '/api/settings') {
    if (method === 'get') return publicSettings(await get('settings', 'local'))
    const previous = await get('settings', 'local') || { id: 'local', ...defaults }
    const { ai_api_key, youtube_api_key, ...rest } = body
    const next = { ...previous, ...rest }
    if (ai_api_key !== undefined) next.key = await encryptKey(ai_api_key.trim())
    if (youtube_api_key !== undefined) next.youtube_key = await encryptKey(youtube_api_key.trim())
    await put('settings', next)
    return publicSettings(next)
  }
  if (p === '/api/settings/test-ai') {
    const reply = (await aiChat([{ role: 'user', content: 'Responda apenas OK.' }], 32)).trim()
    if (!/^OK[.!]?$/i.test(reply)) error('O provedor não retornou a resposta esperada no teste de conexão.', 502)
    return { ok: true }
  }
  if (p === '/api/settings/health') return { ytdlp: { status: 'remote_resolver' }, ai_provider: { status: (await get('settings', 'local'))?.key ? 'configured' : 'not_configured' }, ffmpeg: { status: 'browser' }, whisper: { status: 'browser' }, browser: { status: 'ok' }, thread_pools: {} }
  if (p.startsWith('/api/settings/motion-graphics')) return { installed: false, installing: false, platform_supported: false, error: 'O estúdio HyperFrames nativo ainda não foi adaptado ao navegador.' }
  if (p.startsWith('/api/settings/')) error('Esta integração nativa ainda precisa ser adaptada para a versão no navegador.')
  if (p === '/api/config/model_registry') return { key: 'model_registry', value: { openai_compatible: { models: ['deepseek-flash', 'deepseek-v4-pro'], default_model: 'deepseek-flash' } } }
  if (p === '/api/config/voices/edge_tts') return { voices: [
    { voice_id: 'pt-BR-AntonioNeural', name: 'Antônio', language: 'pt-BR', gender: 'Masculino' },
    { voice_id: 'pt-BR-FranciscaNeural', name: 'Francisca', language: 'pt-BR', gender: 'Feminino' },
  ] }
  if (p === '/api/tts/preview') {
    const response = await fetch('/api/voiceover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Esta é uma prévia de voz do Decupa Viral, em português brasileiro.', voice: body.voice_id }) })
    if (!response.ok) error('Não foi possível gerar a prévia da voz.')
    return response.blob()
  }
  if (p.startsWith('/api/config/')) {
    const id = decodeURIComponent(p.slice('/api/config/'.length))
    if (method !== 'get') { await put('config', { id, value: body.value }); return { key: id, value: body.value } }
    return { key: id, value: (await get('config', id))?.value ?? null }
  }
  if (p === '/api/config') return []
  if (p === '/api/jobs') {
    let rows = newest(await all('jobs'))
    if (params.get('status')) rows = rows.filter(x => params.get('status').split(',').includes(x.status))
    return { jobs: page(rows, params), total: rows.length }
  }
  if (p === '/api/jobs/bulk-delete' && method === 'post') {
    let deleted = 0, kept_library = 0, kept_running = 0
    for (const id of new Set(body.job_ids || [])) {
      const row = await get('jobs', id)
      if (!row) continue
      if (['pending', 'running'].includes(row.status) || row.runner_active) { kept_running++; continue }
      if (await get('media', id)) { kept_library++; continue }
      await remove('jobs', id); deleted++
    }
    return { deleted, kept_library, kept_running }
  }
  let match = p.match(/^\/api\/jobs\/([^/]+)$/)
  if (match) {
    const row = await get('jobs', match[1]); if (!row) error('Tarefa não encontrada.', 404)
    if (method === 'delete') {
      if (!['pending', 'running'].includes(row.status) && !row.runner_active) {
        if (await get('media', row.id)) error('Esta tarefa corresponde a um arquivo da biblioteca. Remova o arquivo pela biblioteca para excluir o resultado.', 409)
        await remove('jobs', row.id); return { ok: true, best_effort: false }
      }
      await put('jobs', { ...row, status: 'cancelled', current_step: 'Cancelada. A operação atual termina antes de liberar o motor.' }); return { ok: true, best_effort: true }
    }
    return row
  }
  if (p === '/api/downloaded') { const rows = newest(await all('sources')); return { videos: page(rows, params), total: rows.length } }
  if (p === '/api/downloaded/import') {
    const row = await importSource(body.get('file'), body.get('title') || body.get('file').name)
    const job = await startJob('analyze', { downloaded_video_id: row.id }, report => transcribe(row.id, report, 'fast').then(segments => ({ video_id: row.id, segment_count: segments.length })))
    return { id: row.id, ...job, title: row.title }
  }
  if (p === '/api/downloaded/batch-download') return startJob('download', body, async report => {
    const videos = []
    for (const item of body.urls || []) {
      const row = await downloadSource(typeof item === 'string' ? item : item.url, body.options || {}, report)
      videos.push({ id: row.id, title: row.title, height: row.height, requested_quality: body.options?.quality, ext: 'mp4' })
    }
    return { downloaded_ids: videos.map(x => x.id), total: videos.length, videos }
  })
  match = p.match(/^\/api\/downloaded\/([^/]+)(?:\/(.*))?$/)
  if (match) {
    const id = match[1], action = match[2]
    const row = await get('sources', id); if (!row) error('Fonte não encontrada.', 404)
    if (!action && method === 'delete') { await remove('sources', id); await remove('media', id); await remove('media', `${id}:thumbnail`); return { ok: true } }
    if (!action) return row
    if (action === 'export' && method === 'post') return queuedExport(id, row, body)
    if (action === 'segments') return { duration: row.duration_seconds, has_segments: !!row.segments?.length, truncated: false, segments: row.segments || [] }
    if (action === 'extract-clips') return startJob('generate', { ...body, type: 'clip_extraction', downloaded_video_id: id }, report => extractClips(id, { emoji_style: 'moderate', ...body }, report))
    if (action === 'suggest-clips') return startJob('clip_suggest', { ...body, downloaded_video_id: id }, report => suggestClips(id, body, report))
    if (action === 'reanalyze') return startJob('analyze', { video_id: id }, report => transcribe(id, report, body.whisper_quality, true).then(segments => ({ segment_count: segments.length })))
  }
  if (p === '/api/videos') {
    let rows = newest(await all('videos'))
    if (params.get('source_type')) rows = rows.filter(x => x.source_type === params.get('source_type'))
    return { videos: page(rows, params), total: rows.length }
  }
  match = p.match(/^\/api\/videos\/([^/]+)(?:\/(.*))?$/)
  if (match) {
    const id = match[1], action = match[2]
    const row = await get('videos', id); if (!row) error('Vídeo não encontrado.', 404)
    if (!action && method === 'delete') { await remove('videos', id); await remove('media', id); await remove('media', `${id}:thumbnail`); return { ok: true } }
    if (!action && ['put', 'patch', 'post'].includes(method)) { await put('videos', { ...row, ...body }); return { ...row, ...body } }
    if (!action) return row
    if (action === 'export' && method === 'post') return queuedExport(id, row, body)
    if (action === 'regenerate-thumbnail') { await saveMedia(`${id}:thumbnail`, await thumbnail(await sourceBlob(id), Number(body.time) || 0), 'miniatura.jpg'); return { thumbnail_path: `browser:${id}:thumbnail`, thumb_v: Date.now() } }
    if (action === 'upload') error('A publicação em redes sociais exige configurar a autenticação dessa rede na versão web. Você já pode baixar o arquivo e publicar pelo aplicativo da rede.')
  }
  if (p === '/api/library/taxonomy') return { media: MEDIA, origins: ORIGINS, producers: PRODUCERS }
  if (p === '/api/library/items') { const { rows, ...info } = await libraryItems(params); return { ...info, items: page(rows, params) } }
  if (p === '/api/library/families') {
    const { rows } = await libraryItems(params)
    const roots = rows.filter(x => !x.parent_key)
    const children = key => rows.filter(x => x.parent_key === key).map(item => ({ item, children: children(item.key) }))
    return { families: roots.filter(root => rows.some(x => x.parent_key === root.key)).map(root => ({ root, children: children(root.key), key: root.key })), family_total: roots.filter(root => rows.some(x => x.parent_key === root.key)).length, loners: roots.filter(root => !rows.some(x => x.parent_key === root.key)), matched_keys: rows.map(x => x.key) }
  }
  if (p === '/api/library/lineage') { const { rows } = await libraryItems(new URLSearchParams()); const item = rows.find(x => x.key === params.get('key')); return { item, ancestors: item?.parent_key ? rows.filter(x => x.key === item.parent_key) : [], children: rows.filter(x => x.parent_key === item?.key) } }
  if (p === '/api/chat/sessions') return newest(await all('sessions'))
  match = p.match(/^\/api\/chat\/sessions\/([^/]+)(?:\/(messages))?$/)
  if (match) {
    if (match[2]) return (await all('messages')).filter(x => x.session_id === match[1]).sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (method === 'delete') { await remove('sessions', match[1]); for (const msg of await all('messages')) if (msg.session_id === match[1]) await remove('messages', msg.id); return { ok: true } }
  }
  match = p.match(/^\/api\/tools\/download-meta\/([^/]+)$/)
  if (match) { const media = await get('media', match[1]); return { ready: !!media, content_type: media?.blob?.type, filename: media?.name, size_bytes: media?.blob?.size } }
  match = p.match(/^\/api\/tools\/download\/([^/]+)$/)
  if (match) { const media = await get('media', match[1]); if (!media) error('Arquivo indisponível.', 404); return config.responseType === 'text' ? media.blob.text() : media.blob }
  if (p === '/api/tools/enhance-prompt' && method === 'post') {
    const draft = body.get('draft') || ''
    if (!draft.trim() || draft.length > 10000) error('Insira um texto com 1 a 10.000 caracteres.')
    return { enhanced: await aiChat([{ role: 'user', content: `Revise o texto abaixo em português brasileiro. Preserve fatos e nomes, não acrescente informações. Retorne apenas o texto revisado.\n${draft}` }], 4096) }
  }
  match = p.match(/^\/api\/tools\/([^/]+)$/)
  if (match && method === 'post') return startJob(toolJobTypeFor(p), {}, (report, id) => runTool(match[1], body, report, id))
  if (p === '/api/channels/list') return { channels: [] }
  if (p === '/api/music') return { tracks: [], total: 0 }
  if (p.includes('suggestions')) return { suggestions: [] }
  error('Este recurso do ViralMint ainda precisa ser adaptado ao navegador. Nenhuma tarefa foi executada.', 501)
}
