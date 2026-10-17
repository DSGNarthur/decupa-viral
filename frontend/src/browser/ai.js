import { get, decryptKey } from './db.js'
export async function aiChat(messages, maxTokens = 2048) {
  const s = await get('settings', 'local')
  if (!s?.key) throw new Error('Configure sua chave do DeepSeek em Configurações antes de usar a IA.')
  const result = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: await decryptKey(s.key), base_url: s.ai_base_url || 'https://api.deepseek.com', model: s.ai_model || 'deepseek-flash', messages: [{ role: 'system', content: 'Responda em português brasileiro. Preserve fatos da fonte. Não invente falas, nomes ou tempos. Quando solicitado, retorne JSON válido, sem cercas de código.' }, ...messages], max_tokens: maxTokens }) })
  const data = await result.json()
  if (!result.ok) throw new Error(data.detail || 'A consulta à IA falhou.')
  return data.text
}
export function parseJson(text) {
  let s = text.trim()
  if (s.startsWith('```')) s = s.split('\n').slice(1).join('\n').replace(/```\s*$/, '').trim()
  try { return JSON.parse(s) } catch { throw new Error('A IA retornou dados em um formato inválido. Tente novamente.') }
}
export function validateRanges(ranges, duration, max = 5, minDuration = 0.5, maxDuration = Infinity) {
  if (!Array.isArray(ranges)) throw new Error('A IA retornou uma seleção inválida.')
  const accepted = []
  for (const row of ranges) {
    const start = Number(row.start), end = Number(row.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + 0.1 || end - start < minDuration || end - start > maxDuration) continue
    if (accepted.some(x => Math.max(x.start, start) < Math.min(x.end, end))) continue
    accepted.push({ ...row, start, end: Math.min(duration, end) })
    if (accepted.length >= max) break
  }
  if (!accepted.length) throw new Error('A IA não retornou trechos válidos. Ajuste a duração e tente novamente.')
  return accepted
}
export async function pickClips(source, segments, options = {}) {
  const max = Math.min(20, Math.max(1, Number(options.max_clips) || 3))
  const transcript = segments.map(s => `${s.start.toFixed(2)}-${s.end.toFixed(2)}: ${s.text}`).join('\n')
  const result = await aiChat([{ role: 'user', content: `Escolha até ${max} trechos independentes e interessantes deste vídeo. Começo compreensível e conclusão. Use somente os tempos transcritos e preserve o sentido. Não sobreponha trechos. Duração mínima ${options.min_duration || 15}s, máxima ${options.max_duration || 60}s. Orientação do usuário: ${options.user_query || 'melhores momentos'}. Retorne APENAS um array JSON: [{"start":0,"end":30,"title":"Título","reason":"Motivo","score":7,"hook_score":7}]. Vídeo: ${source.title}. Duração total: ${source.duration_seconds}s.\n${transcript}` }], 4096)
  return validateRanges(parseJson(result), source.duration_seconds, max, Number(options.min_duration) || 15, Number(options.max_duration) || 60)
}
