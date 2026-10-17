import { get, put, now, uuid } from './db'
import { sourceBlob, runFFmpeg, encodeVideo, subtitleExtras, saveMedia, thumbnail, metadata, removeSilence } from './media'
import { transcribe } from './transcribe'
import { pickClips, validateRanges } from './ai'
import { captionExtras } from './captions'

export async function suggestClips(id, options, report) {
  const segments = await transcribe(id, report, options.whisper_quality, options.force_retranscribe)
  const source = await get('sources', id)
  await report(45, 'DeepSeek está escolhendo os trechos da transcrição…')
  return { suggestions: await pickClips(source, segments, options) }
}
export async function extractClips(id, options, report) {
  const source = await get('sources', id)
  if (!source) throw new Error('Fonte não encontrada neste dispositivo.')
  if (!source.width || !source.height) throw new Error('Esta fonte contém apenas áudio. Use a transcrição ou o visualizador de música para criar um vídeo.')
  const manual = options.mode === 'manual'
  const shortSource = !manual && source.duration_seconds < 20
  const captions = options.caption_style && options.caption_style !== 'none'
  const segments = !manual || captions ? await transcribe(id, report, options.whisper_quality, options.force_retranscribe) : source.segments || []
  await report(40, manual ? 'Preparando os trechos marcados…' : shortSource ? 'Fonte curta: preparando o vídeo completo…' : 'DeepSeek está selecionando os melhores trechos…')
  const ranges = manual ? validateRanges(options.time_ranges, source.duration_seconds, 99)
    : source.duration_seconds < 20 ? [{ start: 0, end: source.duration_seconds, title: source.title, reason: 'Fonte curta: vídeo completo.', score: null, hook_score: null }]
    : await pickClips(source, segments, options)
  const ids = []
  const blob = await sourceBlob(id)
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    await report(45 + i / ranges.length * 45, `Exportando corte ${i + 1} de ${ranges.length}…`)
    const filters = []
    if (options.force_vertical) filters.push("crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=720:1280,setsar=1")
    const extras = captions ? await captionExtras(segments, { style: options.caption_style, emoji: options.emoji_style, start: range.start, end: range.end, vertical: !!options.force_vertical, width: options.force_vertical ? 720 : source.width, height: options.force_vertical ? 1280 : source.height }) : {}
    if (captions) filters.push('ass=captions.ass:fontsdir=.')
    const args = ['-ss', range.start, '-i', '$INPUT', '-t', range.end - range.start]
    if (filters.length) args.push('-vf', filters.join(','))
    args.push(...encodeVideo, '$OUTPUT')
    let clipBlob = await runFFmpeg(blob, args, { extras, report: (p, s) => report(45 + (i + p / 100) / ranges.length * 45, s) })
    if (options.remove_silence) clipBlob = await removeSilence(clipBlob, report, { duration: range.end - range.start, hasVideo: true })
    await report(45 + (i + 0.95) / ranges.length * 45, 'Salvando o corte na biblioteca…')
    const clipId = uuid()
    const meta = await metadata(clipBlob)
    const title = range.title || `${source.title} (${range.start.toFixed(1)}s a ${range.end.toFixed(1)}s)`
    await saveMedia(clipId, clipBlob, `${title.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 100)}.mp4`)
    try { await saveMedia(`${clipId}:thumbnail`, await thumbnail(clipBlob), 'miniatura.jpg') } catch {}
    await put('videos', { id: clipId, title, status: 'ready', source_type: 'clip_extraction', source_downloaded_video_id: id, video_path: `browser:${clipId}`, thumbnail_path: `browser:${clipId}:thumbnail`, file_exists: true, duration_seconds: meta.duration, video_width: meta.width, video_height: meta.height, aspect_ratio: options.force_vertical ? '9:16' : source.aspect_ratio || '16:9', clip_start: range.start, clip_end: range.end, clip_virality_score: manual ? null : range.score, clip_hook_score: manual ? null : range.hook_score, clip_reason: range.reason || '', clip_selection: manual ? 'manual' : shortSource ? 'short_source' : 'ai', caption_style: options.caption_style || 'none', caption_burned: !!captions, file_size_mb: clipBlob.size / 1048576, created_at: now() })
    ids.push(clipId)
  }
  return { clip_ids: ids, count: ids.length }
}
