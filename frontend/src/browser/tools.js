import { get, put, uuid, now } from './db'
import { metadata, runFFmpeg, encodeVideo, saveMedia, subtitleExtras, removeSilence, mergeMedia, convertAspect } from './media'
import { transcribe } from './transcribe'
import { aiChat, parseJson } from './ai'
import { importSource, downloadSource } from './sources'
import { captionExtras } from './captions'
import { toolJobTypeFor } from '../components/tools/toolJobType'
import { PRODUCERS } from '../components/librarynext/assetModel'
import { commitOutput } from './editor.js'

const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback
const truth = v => v === true || v === 'true'
const textBlob = (text, type = 'text/plain;charset=utf-8') => new Blob([text], { type })
export async function runTool(slug, form, report, jobId) {
  const fields = Object.fromEntries(form.entries())
  let file = fields.file
  let blob, ext = 'mp4'
  let args = ['-i', '$INPUT'], filters = [], extras = {}
  if (slug === 'merge-clips') {
    if (truth(fields.bundle)) throw new Error('A exportação em vários formatos ainda não está disponível no navegador. Desative essa opção para unir os vídeos.')
    blob = await mergeMedia(form.getAll('files'), fields.target_aspect, report, fields.transition)
  } else if (slug === 'voiceover') {
    if (fields.provider && fields.provider !== 'edge_tts') throw new Error('Escolha Edge TTS para usar a narração disponível nesta versão web.')
    if (!(fields.text || fields.script || '').trim() || (fields.text || fields.script).length > 5000) throw new Error('Use um roteiro com 1 a 5.000 caracteres.')
    const response = await fetch('/api/voiceover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: fields.text || fields.script, voice: fields.voice_id || 'pt-BR-AntonioNeural' }) })
    if (!response.ok) throw new Error((await response.json()).detail || 'A narração falhou.')
    blob = await response.blob(); ext = 'mp3'
    if (fields.video instanceof Blob) {
      if (fields.video.size > 512 * 1048576) throw new Error('O vídeo ultrapassa o limite de 512 MB do processamento no navegador.')
      const voice = blob
      blob = await runFFmpeg(fields.video, ['-i', '$INPUT', '-i', 'voice.mp3', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', '$OUTPUT'], { extras: { 'voice.mp3': voice }, report })
      ext = 'mp4'
    }
  } else {
    if (!(file instanceof Blob) && fields.url) {
      const imported = await downloadSource(fields.url, {}, report)
      const media = await get('media', imported.id); file = media.blob
    }
    if (!(file instanceof Blob)) throw new Error('Selecione um arquivo para esta ferramenta.')
    if (file.size > 512 * 1048576) throw new Error('Este arquivo excede o limite de 512 MB do processamento no navegador. Use um trecho menor.')
    if (['captions', 'subtitles', 'transcript', 'translate', 'metadata', 'hook-analysis', 'auto-chapters', 'auto-zoom'].includes(slug)) {
      const source = await importSource(file, file.name || 'Arquivo de trabalho')
      const segments = await transcribe(source.id, report, 'fast')
      const transcript = segments.map(s => s.text).join(' ')
      if (slug === 'subtitles') {
        const sub = await subtitleExtras(segments)
        const format = fields.format || 'srt'; ext = format
        const srt = sub['captions.srt']
        blob = textBlob(format === 'vtt' ? 'WEBVTT\n\n' + srt.replace(/(\d\d:\d\d:\d\d),(\d{3})/g, '$1.$2') : srt)
      } else if (slug === 'transcript') { ext = 'txt'; blob = textBlob(transcript) }
      else if (slug === 'captions') {
        extras = await captionExtras(segments, { style: fields.style || 'viral', emoji: fields.emoji_style || 'none', vertical: source.height > source.width, width: source.width, height: source.height })
        filters.push('ass=captions.ass:fontsdir=.')
      } else if (slug === 'translate') {
        if (fields.mode === 'full_dub') throw new Error('A dublagem em outros idiomas ainda precisa de adaptação. Use a tradução das legendas nesta versão web.')
        const phrases = []
        for (let i = 0; i < segments.length; i += 8) {
          const group = segments.slice(i, i + 8)
          phrases.push({ start: group[0].start, end: group.at(-1).end, text: group.map(word => word.text).join(' ') })
        }
        const translated = []
        for (let i = 0; i < phrases.length; i += 40) {
          const batch = phrases.slice(i, i + 40)
          await report(50 + i / phrases.length * 20, 'Traduzindo as legendas com a IA…')
          const texts = parseJson(await aiChat([{ role: 'user', content: `Traduza para o idioma ${fields.target_language || 'pt'} os textos deste array. Use o contexto entre itens para preservar o sentido e os fatos. Retorne apenas um array JSON de strings com a mesma quantidade de itens e na mesma ordem.\n${JSON.stringify(batch.map(item => item.text))}` }], 8192))
          if (!Array.isArray(texts) || texts.length !== batch.length || texts.some(text => typeof text !== 'string' || !text.trim())) throw new Error('A IA não retornou uma tradução alinhada aos trechos. Tente novamente.')
          batch.forEach((phrase, index) => {
            const words = texts[index].trim().split(/\s+/)
            const step = (phrase.end - phrase.start) / words.length
            words.forEach((text, position) => translated.push({ text, start: phrase.start + step * position, end: phrase.start + step * (position + 1) }))
          })
        }
        extras = await captionExtras(translated, { style: fields.caption_style || 'viral', emoji: fields.emoji_style || 'none', vertical: source.height > source.width, width: source.width, height: source.height })
        filters.push('ass=captions.ass:fontsdir=.')
      } else if (slug === 'auto-zoom') {
        const meta = await metadata(file)
        const every = Math.max(1, n(fields.words_per_group, 4))
        const selected = segments.filter((s, i) => Math.floor(i / every) % 2 === 1).slice(0, 120)
        const condition = selected.map(s => `between(t,${s.start},${s.end})`).join('+') || '0'
        const zoom = Math.max(1.01, Math.min(1.5, n(fields.zoom_factor, 1.15)))
        filters.push(`scale=w='trunc(iw*if(${condition},${zoom},1)/2)*2':h='trunc(ih*if(${condition},${zoom},1)/2)*2':eval=frame,crop=${meta.width}:${meta.height},setsar=1`)
      } else {
        await report(65, 'DeepSeek está analisando a transcrição…')
        const prompts = {
          translate: `Traduza esta transcrição para ${fields.target_language || fields.language || 'português brasileiro'}, preservando seu sentido e todos os fatos. Retorne apenas a tradução:`,
          metadata: 'Crie título, descrição e sugestões de tags para este vídeo. Preserve os fatos e não invente informações:',
          'hook-analysis': 'Analise a abertura, o interesse dos primeiros segundos e sugira melhorias concretas baseadas no texto. Diferencie claramente fatos da fonte e sugestões:',
          'auto-chapters': 'Crie capítulos com títulos e tempos baseados SOMENTE nestes segmentos. Não invente tempos:',
        }
        const input = slug === 'auto-chapters' ? segments.map(s => `${s.start}: ${s.text}`).join('\n') : transcript
        blob = textBlob(await aiChat([{ role: 'user', content: `${prompts[slug]}\n${input}` }], 4096)); ext = 'txt'
      }
    } else if (slug === 'trim') {
      const start = n(fields.start_seconds), end = n(fields.end_seconds)
      if (start < 0 || end - start < 0.5) throw new Error('Defina um intervalo válido de pelo menos meio segundo.')
      args = ['-ss', start, '-i', '$INPUT', '-t', end - start]
    } else if (slug === 'compress') {
      const levels = { maximum: 36, high: 30, medium: 26, low: 22, minimal: 18 }
      if (fields.resolution !== 'original' && /^\d+x\d+$/.test(fields.resolution || '')) {
        const height = fields.resolution.split('x')[1]
        filters.push(`scale=-2:'min(${height},ih)'`)
      }
      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', levels[fields.level] || 30, '-c:a', 'aac', '-movflags', '+faststart')
    } else if (slug === 'crop') {
      const meta = await metadata(file)
      const x = Math.max(0, Math.min(1, n(fields.x))), y = Math.max(0, Math.min(1, n(fields.y)))
      const w = Math.max(0.01, Math.min(1 - x, n(fields.w, 1))), h = Math.max(0.01, Math.min(1 - y, n(fields.h, 1)))
      filters.push(`crop=${Math.max(2, Math.floor(meta.width * w / 2) * 2)}:${Math.max(2, Math.floor(meta.height * h / 2) * 2)}:${Math.floor(meta.width * x)}:${Math.floor(meta.height * y)}`)
    } else if (slug === 'reframe') {
      blob = await convertAspect(file, fields.target_aspect || '9:16', report)
    } else if (slug === 'audio-enhance') {
      args.push('-af', 'highpass=f=80,lowpass=f=14000,afftdn,loudnorm=I=-16:TP=-1.5:LRA=11')
    } else if (slug === 'speed') {
      const speed = Math.max(0.25, Math.min(4, n(fields.speed, 1)))
      filters.push(`setpts=PTS/${speed}`)
      const atempo = []; let remaining = speed
      while (remaining > 2) { atempo.push('atempo=2'); remaining /= 2 }
      while (remaining < 0.5) { atempo.push('atempo=0.5'); remaining /= 0.5 }
      atempo.push(`atempo=${remaining}`)
      args.push('-af', truth(fields.keep_pitch) ? atempo.join(',') : `aresample=48000,asetrate=48000*${speed},aresample=48000`)
    } else if (slug === 'gif') {
      ext = 'gif'; args = ['-ss', Math.max(0, n(fields.start_seconds)), '-i', '$INPUT', '-t', Math.max(0.5, n(fields.duration_seconds, 5))]
      filters.push(`fps=${Math.max(1, Math.min(30, n(fields.fps, 12)))},scale=${Math.max(64, Math.min(1280, n(fields.width, 480)))}:-2:flags=lanczos`)
    } else if (slug === 'transform') {
      const operation = fields.operation
      const visual = { flip_h: 'hflip', flip_v: 'vflip', rotate_cw: 'transpose=1', rotate_180: 'hflip,vflip', rotate_ccw: 'transpose=2' }
      if (visual[operation]) filters.push(visual[operation])
      else if (operation === 'mute') args.push('-an')
      else if (operation === 'volume') args.push('-af', `volume=${Math.max(0, Math.min(5, n(fields.amount, 1)))}`)
      else if (operation === 'loop') args = ['-stream_loop', Math.max(0, Math.min(9, n(fields.amount, 2) - 1)), '-i', '$INPUT']
      else throw new Error('Operação de transformação inválida.')
    } else if (slug === 'remove-silence') {
      const meta = await metadata(file)
      const hasVideo = meta.width > 0
      blob = await removeSilence(file, report, { duration: meta.duration, hasVideo }); ext = hasVideo ? 'mp4' : 'mp3'
    } else if (slug === 'watermark') {
      if (!(fields.logo instanceof Blob)) throw new Error('Selecione uma imagem de marca d\u0027água.')
      extras['logo.png'] = fields.logo
      args.push('-i', 'logo.png')
      const pos = { top_left: '20:20', top_right: 'W-w-20:20', bottom_left: '20:H-h-20', bottom_right: 'W-w-20:H-h-20', center: '(W-w)/2:(H-h)/2' }
      const meta = await metadata(file)
      args.push('-filter_complex', `[1:v]scale=-1:${Math.max(2, Math.round(meta.height * Math.max(0.01, Math.min(1, n(fields.size_pct, 8) / 100))))},format=rgba,colorchannelmixer=aa=${Math.max(0, Math.min(1, n(fields.opacity, 0.8)))}[logo];[0:v][logo]overlay=${pos[(fields.position || '').replaceAll('-', '_')] || pos.bottom_right}`)
    } else if (slug === 'music-visualizer') {
      args.push('-filter_complex', '[0:a]showwaves=s=720x1280:mode=line:colors=0xc96442,format=yuv420p[v]', '-map', '[v]', '-map', '0:a')
    } else if (slug === 'merge-clips') {
      throw new Error('A união de arquivos está em adaptação para o navegador.')
    } else throw new Error('Esta ferramenta ainda não foi adaptada ao processamento no navegador.')
    if (!blob) {
      if (filters.length) args.push('-vf', filters.join(','))
      if (ext === 'mp4' && slug !== 'compress') args.push(...encodeVideo)
      args.push('$OUTPUT')
      blob = await runFFmpeg(file, args, { ext, report, extras, jobId })
    }
  }
  await report(96, 'Salvando o resultado neste dispositivo…')
  let meta = {}
  if (blob.type.startsWith('video/') || blob.type.startsWith('audio/')) { try { meta = await metadata(blob) } catch {} }
  const producer = toolJobTypeFor(`/api/tools/${slug}`)
  const filename = `decupa-viral-${slug}.${ext}`
  const video = { id: jobId, title: `Resultado: ${PRODUCERS[producer]?.label || 'Ferramenta'}`, source_type: producer, status: 'ready', content_type: blob.type, filename, video_path: `browser:${jobId}`, file_exists: true, file_size_mb: blob.size / 1048576, duration_seconds: meta.duration || 0, video_width: meta.width || 0, video_height: meta.height || 0, created_at: now() }
  return commitOutput(jobId, { videos: [video], mediaRows: [{ id: jobId, blob, name: filename }], output: { output_path: `browser:${jobId}`, filename, content_type: blob.type } })
}
