import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { get, put, uuid } from './db.js'

let engine
let loaded
let lastLog = ''
export async function ffmpeg(report = () => {}) {
  if (!loaded) {
    engine = new FFmpeg()
    engine.on('log', ({ message }) => { lastLog = message })
    loaded = engine.load({ coreURL: '/engine/ffmpeg-core.js', wasmURL: '/engine/ffmpeg-core.wasm' }).catch(error => { loaded = null; engine = null; throw error })
  }
  await report(3, 'Carregando o motor de vídeo neste dispositivo…')
  await loaded
  return engine
}
export async function runFFmpeg(blob, args, { ext = 'mp4', report = () => {}, extras = {}, text = false, jobId } = {}) {
  const ff = await ffmpeg(report)
  const base = uuid().replaceAll('-', '')
  const input = `${base}.input`
  const output = `${base}.${ext}`
  const written = [input, output, ...Object.keys(extras)]
  let cancelTimer, checking = false, cancelled = false
  try {
    if (jobId) cancelTimer = setInterval(async () => {
      if (checking) return
      checking = true
      try {
        if ((await get('jobs', jobId))?.status === 'cancelled') {
          cancelled = true; clearInterval(cancelTimer); ff.terminate()
          if (engine === ff) { engine = null; loaded = null }
        }
      } catch { /* A storage error is reported by the job before publication. */ } finally { checking = false }
    }, 300)
    await ff.writeFile(input, await fetchFile(blob))
    for (const [name, data] of Object.entries(extras)) await ff.writeFile(name, typeof data === 'string' ? new TextEncoder().encode(data) : await fetchFile(data))
    const onProgress = ({ progress }) => { Promise.resolve(report(Math.min(94, 15 + Math.max(0, progress) * 75), 'Processando a mídia neste dispositivo…')).catch(() => {}) }
    ff.on('progress', onProgress)
    let code
    try { code = await ff.exec(['-hide_banner', '-y', ...args.flatMap(v => v === '$INPUT' ? [input] : v === '$OUTPUT' ? [output] : [String(v)])]) }
    finally { ff.off('progress', onProgress) }
    if (cancelled) throw new Error('Exportação cancelada.')
    if (code !== 0) throw new Error(`O motor de vídeo não concluiu a operação. ${lastLog.slice(-180)}`)
    const bytes = await ff.readFile(output)
    if (text) return new TextDecoder().decode(bytes)
    const type = ({ mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', gif: 'image/gif', jpg: 'image/jpeg', png: 'image/png' })[ext] || 'application/octet-stream'
    return new Blob([bytes], { type })
  } catch (error) {
    if (/memory|Aborted|worker.*terminated/i.test(error.message || '') && engine === ff) {
      ff.terminate(); engine = null; loaded = null
      throw new Error('O navegador interrompeu o motor de vídeo. A fonte continua salva. Tente uma edição ou um arquivo menor.')
    }
    throw error
  } finally { clearInterval(cancelTimer); for (const name of written) { try { await ff.deleteFile(name) } catch {} } }
}
export const encodeVideo = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart']

export async function convertAspect(blob, targetAspect = '9:16', report) {
  const sizes = { '9:16': [720, 1280], '16:9': [1280, 720], '1:1': [720, 720], '4:5': [720, 900] }
  if (!sizes[targetAspect]) throw new Error('Escolha uma proporção de saída válida.')
  const meta = await metadata(blob), [width, height] = sizes[targetAspect]
  if (!meta.width || !meta.height) throw new Error('Este arquivo não tem uma faixa de vídeo.')
  const args = ['-i', '$INPUT']
  if (width / height < meta.width / meta.height) {
    args.push('-filter_complex', `[0:v]split=2[bg][fg];[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=20:2[blur];[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[front];[blur][front]overlay=(W-w)/2:(H-h)/2,setsar=1`)
  } else args.push('-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`)
  return runFFmpeg(blob, [...args, ...encodeVideo, '$OUTPUT'], { report })
}

export async function probeMedia(blob) {
  const ff = await ffmpeg()
  const input = `${uuid()}.input`
  let hasAudio = false, hasVideo = false
  const log = ({ message }) => {
    if (/Stream #.*Audio:/.test(message)) hasAudio = true
    if (/Stream #.*Video:/.test(message)) hasVideo = true
  }
  try {
    await ff.writeFile(input, await fetchFile(blob))
    ff.on('log', log)
    const code = await ff.exec(['-i', input, '-t', '0', '-f', 'null', '-'])
    if (code) throw new Error('Não foi possível identificar as faixas desta mídia.')
    return { streams: [...(hasAudio ? [{ codec_type: 'audio' }] : []), ...(hasVideo ? [{ codec_type: 'video' }] : [])] }
  } finally { ff.off('log', log); try { await ff.deleteFile(input) } catch {} }
}

export async function removeSilence(blob, report, { duration, hasVideo = true } = {}) {
  const ff = await ffmpeg(report)
  const input = `${uuid()}.detect`
  const silence = []
  let from = null
  const log = ({ message }) => {
    const start = /silence_start:\s*([\d.]+)/.exec(message)
    const end = /silence_end:\s*([\d.]+)/.exec(message)
    if (start) from = Number(start[1])
    if (end) { silence.push({ start: from ?? 0, end: Number(end[1]) }); from = null }
  }
  try {
    await report(12, 'Detectando pausas no áudio…')
    await ff.writeFile(input, await fetchFile(blob)); ff.on('log', log)
    const code = await ff.exec(['-i', input, '-vn', '-af', 'silencedetect=noise=-35dB:d=0.6', '-f', 'null', '-'])
    if (code) throw new Error('Não foi possível analisar o silêncio do arquivo.')
  } finally { ff.off('log', log); try { await ff.deleteFile(input) } catch {} }
  if (from != null) silence.push({ start: from, end: duration })
  if (!silence.length) return blob
  const ranges = []; let cursor = 0
  for (const gap of silence) {
    const end = Math.max(cursor, gap.start + 0.08)
    if (end - cursor > 0.1) ranges.push({ start: cursor, end })
    cursor = Math.max(cursor, gap.end - 0.08)
  }
  if (duration - cursor > 0.1) ranges.push({ start: cursor, end: duration })
  if (!ranges.length) throw new Error('O arquivo contém apenas silêncio detectável.')
  if (ranges.length > 300) throw new Error('Há mais de 300 pausas neste arquivo. Processe trechos menores neste navegador.')
  const filter = [], labels = []
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]
    if (hasVideo) filter.push(`[0:v]trim=start=${r.start}:end=${r.end},setpts=PTS-STARTPTS[v${i}]`)
    filter.push(`[0:a]atrim=start=${r.start}:end=${r.end},asetpts=PTS-STARTPTS[a${i}]`)
    labels.push((hasVideo ? `[v${i}]` : '') + `[a${i}]`)
  }
  filter.push(`${labels.join('')}concat=n=${ranges.length}:v=${hasVideo ? 1 : 0}:a=1${hasVideo ? '[v]' : ''}[a]`)
  const args = ['-i', '$INPUT', '-filter_complex', filter.join(';')]
  if (hasVideo) args.push('-map', '[v]')
  args.push('-map', '[a]', ...(hasVideo ? encodeVideo : ['-c:a', 'libmp3lame', '-q:a', '2']), '$OUTPUT')
  return runFFmpeg(blob, args, { ext: hasVideo ? 'mp4' : 'mp3', report })
}

export async function mergeMedia(files, aspect, report, transition = 'none') {
  if (files.length < 2 || files.length > 20) throw new Error('Selecione de 2 a 20 vídeos para unir.')
  if (transition && !['none', 'cut'].includes(transition)) throw new Error('As transições ainda precisam de adaptação ao navegador. Escolha corte direto para unir os arquivos.')
  if (files.reduce((sum, f) => sum + f.size, 0) > 512 * 1048576) throw new Error('A soma dos arquivos ultrapassa 512 MB. Una menos arquivos por vez.')
  const ff = await ffmpeg(report), names = [], output = `${uuid()}.mp4`
  const sizes = { '9:16': [720, 1280], '16:9': [1280, 720], '1:1': [720, 720], '4:5': [720, 900] }
  const first = await metadata(files[0])
  const ratio = first.width / first.height
  const closest = Object.values(sizes).reduce((best, size) => Math.abs(size[0] / size[1] - ratio) < Math.abs(best[0] / best[1] - ratio) ? size : best, sizes['9:16'])
  const [w, h] = sizes[aspect] || closest
  try {
    for (let i = 0; i < files.length; i++) {
      await report(5 + i / files.length * 65, `Preparando vídeo ${i + 1} de ${files.length}…`)
      const probe = await probeMedia(files[i])
      const audio = probe.streams?.some(stream => stream.codec_type === 'audio')
      const inputs = ['-i', '$INPUT', ...(!audio ? ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] : [])]
      const normalized = await runFFmpeg(files[i], [...inputs, '-map', '0:v:0', '-map', audio ? '0:a:0' : '1:a:0', '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30`, ...encodeVideo, '-ar', '48000', '-ac', '2', '-shortest', '$OUTPUT'], { report: () => {} })
      const name = `${uuid()}.mp4`; names.push(name)
      await ff.writeFile(name, await fetchFile(normalized))
    }
    const list = `${uuid()}.txt`; names.push(list)
    await ff.writeFile(list, new TextEncoder().encode(names.slice(0, -1).map(name => `file '${name}'`).join('\n')))
    await report(80, 'Unindo os vídeos neste dispositivo…')
    const code = await ff.exec(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', output])
    if (code) throw new Error('Não foi possível unir os vídeos. Confira se todos têm áudio compatível.')
    return new Blob([await ff.readFile(output)], { type: 'video/mp4' })
  } finally { for (const name of [...names, output]) { try { await ff.deleteFile(name) } catch {} } }
}
export async function metadata(blob) {
  const url = URL.createObjectURL(blob)
  const el = document.createElement(blob.type.startsWith('audio/') ? 'audio' : 'video')
  el.preload = 'metadata'; el.muted = true; el.playsInline = true
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Não foi possível ler este formato de mídia no navegador.')), 20000)
      el.onloadedmetadata = () => { clearTimeout(timeout); resolve() }
      el.onerror = () => { clearTimeout(timeout); reject(new Error('O navegador não reconheceu este arquivo. Experimente MP4 com H.264 e AAC.')) }
      el.src = url
    })
    return { duration: Number.isFinite(el.duration) ? el.duration : 0, width: el.videoWidth || 0, height: el.videoHeight || 0 }
  } finally { el.removeAttribute('src'); el.load(); URL.revokeObjectURL(url) }
}
export async function thumbnail(blob, time = 0, width = 288) {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.preload = 'auto'; video.muted = true; video.playsInline = true
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Não foi possível gerar a miniatura.')), 15000)
      video.onloadeddata = () => { video.currentTime = Math.max(0, Math.min(time || 0.01, video.duration - 0.02)) }
      video.onseeked = () => { clearTimeout(timeout); resolve() }
      video.onerror = () => { clearTimeout(timeout); reject(new Error('Vídeo indisponível.')) }
      video.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth))
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
}
export async function filmstrip(blob, { count = 16, height = 48 } = {}) {
  count = Math.max(2, Math.min(48, count)); height = Math.max(24, Math.min(120, height))
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video'); video.preload = 'auto'; video.muted = true; video.playsInline = true
  try {
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('Não foi possível ler os quadros.')); video.src = url })
    const width = Math.max(1, Math.round(height * video.videoWidth / video.videoHeight))
    const canvas = document.createElement('canvas'); canvas.width = count * width; canvas.height = height
    const ctx = canvas.getContext('2d')
    for (let i = 0; i < count; i++) {
      const time = Math.min(video.duration - 0.02, i / Math.max(1, count - 1) * video.duration)
      if (Math.abs(video.currentTime - time) > 0.001) await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Um quadro demorou além do limite.')), 10000); video.onseeked = () => { clearTimeout(timer); resolve() }; video.currentTime = Math.max(0, time) })
      ctx.drawImage(video, i * width, 0, width, height)
    }
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75))
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
}
export async function saveMedia(id, blob, name) { await put('media', { id, blob, name }); return `/api/videos/${id}/stream` }
export async function sourceBlob(id) {
  const row = await get('media', id)
  if (!row?.blob) throw new Error('Arquivo não encontrado neste dispositivo.')
  return row.blob
}
export async function subtitleExtras(segments, start = 0, end = Infinity) {
  const font = await (await fetch('/engine/NotoSans.ttf')).blob()
  const stamp = seconds => {
    const s = Math.max(0, seconds)
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0').replace('.', ',')}`
  }
  const parts = segments.filter(s => s.end > start && s.start < end).map((s, i) => `${i + 1}\n${stamp(s.start - start)} --> ${stamp(Math.min(s.end, end) - start)}\n${s.text.trim()}\n`)
  return { 'captions.srt': parts.join('\n'), 'NotoSans.ttf': font }
}
