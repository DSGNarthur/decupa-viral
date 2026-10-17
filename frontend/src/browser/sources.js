import { get, put, now, uuid } from './db'
import { saveMedia, metadata, thumbnail, runFFmpeg, encodeVideo } from './media'

export async function importSource(blob, title = blob.name || 'Vídeo importado', sourceUrl = '') {
  if (!(blob instanceof Blob) || !blob.size) throw new Error('O arquivo está vazio ou não está disponível.')
  if (blob.size > 512 * 1048576) throw new Error('O arquivo ultrapassa 512 MB. Importe um trecho menor para processar neste dispositivo.')
  const meta = await metadata(blob)
  const id = uuid()
  await saveMedia(id, blob, blob.name || `${title}.mp4`)
  let thumb = false
  if (meta.width) { try { await saveMedia(`${id}:thumbnail`, await thumbnail(blob), 'miniatura.jpg'); thumb = true } catch {} }
  const row = { id, title, platform: sourceUrl ? (/(^|\.)(youtube\.com|youtu\.be)$/.test(new URL(sourceUrl).hostname) ? 'youtube' : 'link') : 'import', source_url: sourceUrl, video_path: `browser:${id}`, audio_path: null, thumbnail_path: thumb ? `browser:${id}:thumbnail` : null, thumbnail_url: thumb ? `/api/downloaded/${id}/thumbnail` : null, file_exists: true, duration_seconds: meta.duration, width: meta.width, height: meta.height, aspect_ratio: meta.width > meta.height ? '16:9' : '9:16', file_size_mb: blob.size / 1048576, transcript: null, has_transcript_segments: false, segments: [], created_at: now() }
  await put('sources', row)
  return row
}
export async function fetchMedia(url, report, name = 'vídeo') {
  const response = await fetch(url)
  if (!response.ok) throw new Error('A origem recusou o download. Importe o arquivo salvo no dispositivo.')
  const total = Number(response.headers.get('Content-Length')) || 0
  if (total > 512 * 1048576) throw new Error('O vídeo ultrapassa o limite de 512 MB para este navegador.')
  if (!response.body) return response.blob()
  const reader = response.body.getReader(), chunks = []
  let bytes = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    chunks.push(part.value); bytes += part.value.length
    if (bytes > 512 * 1048576) { await reader.cancel(); throw new Error('O download ultrapassou 512 MB. Use um arquivo menor.') }
    await report(total ? 5 + bytes / total * 60 : 10, `Recebendo ${name}: ${(bytes / 1048576).toFixed(1)} MB…`)
  }
  return new Blob(chunks, { type: response.headers.get('Content-Type') || 'video/mp4' })
}
async function chunkedDownload(format, report) {
  const chunks = []; let offset = 0; let total = format.filesize || 0
  while (!total || offset < total) {
    const response = await fetch(`/api/media?token=${encodeURIComponent(format.token)}&start=${offset}`)
    if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.detail || 'A origem interrompeu o download. Importe o arquivo pelo dispositivo.') }
    const range = response.headers.get('Content-Range')
    if (range) total = Number(range.split('/')[1]) || total
    const data = await response.arrayBuffer()
    if (!data.byteLength) break
    chunks.push(data); offset += data.byteLength
    if (offset > 512 * 1048576) throw new Error('O vídeo ultrapassou 512 MB. Use um arquivo menor.')
    await report(total ? 5 + offset / total * 55 : 10, `Baixando para este dispositivo: ${(offset / 1048576).toFixed(1)} MB…`)
    if (response.status === 200 || data.byteLength < 2 * 1048576) break
  }
  return new Blob(chunks, { type: format.content_type || 'video/mp4' })
}
export async function downloadSource(url, options, report) {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Cole um link HTTP ou HTTPS válido.')
  if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(parsed.hostname)) {
    const blob = await fetchMedia(url, report)
    return importSource(blob, decodeURIComponent(parsed.pathname.split('/').pop()) || 'Vídeo do link', url)
  }
  await report(3, 'Consultando o vídeo no YouTube…')
  const response = await fetch('/api/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, quality: options.quality || '720p' }) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.detail || 'Não foi possível obter este vídeo do YouTube. Use Importar arquivo.')
  const video = await chunkedDownload(result.video, report)
  let blob = video
  if (result.audio) {
    const audio = await chunkedDownload(result.audio, report)
    await report(65, 'Unindo vídeo e áudio no dispositivo…')
    blob = await runFFmpeg(video, ['-i', '$INPUT', '-i', 'track.audio', '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-movflags', '+faststart', '$OUTPUT'], { extras: { 'track.audio': audio }, report })
  }
  const row = await importSource(blob, result.title || 'Vídeo do YouTube', url)
  return { ...row, height: result.height || row.height }
}
