import { get, put, uuid } from './db'
import { sourceBlob, runFFmpeg } from './media'
let worker
export async function transcribe(id, report, quality = 'fast', force = false) {
  const source = await get('sources', id)
  if (!source) throw new Error('Fonte não encontrada.')
  if (source.segments?.length && !force) return source.segments
  await report(8, 'Extraindo áudio para transcrever no dispositivo…')
  const wav = await runFFmpeg(await sourceBlob(id), ['-i', '$INPUT', '-vn', '-ar', '16000', '-ac', '1', '-f', 'f32le', '$OUTPUT'], { ext: 'pcm', report })
  const pcm = new Float32Array(await wav.arrayBuffer())
  if (!worker) worker = new Worker(new URL('./transcribe.worker.js', import.meta.url), { type: 'module' })
  const request = uuid()
  const result = await new Promise((resolve, reject) => {
    const onMessage = ({ data }) => {
      if (data.id !== request) return
      if (data.type === 'progress') { Promise.resolve(report(20, data.message)).catch(() => {}); return }
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      if (data.type === 'error') reject(new Error(data.message)); else resolve(data.result)
    }
    const onError = () => { worker.removeEventListener('message', onMessage); worker = null; reject(new Error('O navegador encerrou a transcrição. Tente um arquivo menor ou a qualidade rápida.')) }
    worker.addEventListener('message', onMessage); worker.addEventListener('error', onError, { once: true })
    worker.postMessage({ id: request, audio: pcm, quality }, [pcm.buffer])
  })
  const segments = (result.chunks || []).map(c => ({ start: c.timestamp?.[0] ?? 0, end: c.timestamp?.[1] ?? source.duration_seconds, text: c.text }))
  if (!segments.length && result.text?.trim()) throw new Error('O modelo retornou texto sem tempos. Não é possível escolher cortes com precisão.')
  await put('sources', { ...source, transcript: result.text || '', transcript_language: 'pt', transcript_source: 'whisper_browser', has_transcript_segments: !!segments.length, segments })
  return segments
}
