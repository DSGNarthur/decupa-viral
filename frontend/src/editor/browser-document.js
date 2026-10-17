// SPDX-License-Identifier: AGPL-3.0-only
// Browser adaptation of the Supoclip document contract. See THIRD_PARTY_NOTICES.md.
export const browserDefaults = () => ({ version: 1, segments: [], words: [],
  captions: { enabled: true, font: 'Noto Sans', size: 54, color: '#FFFFFF', accent: '#FFFFFF', y: .78, background: true, wordsPerLine: 4 },
  framing: { mode: 'manual', aspect: 'vertical', fit: 'cover', zoom: 1, x: .5, y: .5 },
  effects: { brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0 }, volume: 1, muted: false })
const fail = message => { throw new Error(message) }
const number = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail('Um valor da edição está fora dos limites.')
const choice = (v, options) => options.includes(v) ? v : fail('Uma opção da edição não é compatível com o navegador.')
const boolean = v => typeof v === 'boolean' ? v : fail('Uma opção da edição é inválida.')
const color = v => /^#[0-9a-f]{6}$/i.test(v) ? v : fail('Uma cor da legenda é inválida.')
const identifier = v => typeof v === 'string' && v.length > 0 && v.length <= 100 ? v : fail('Identificador da edição inválido.')
export function validateDocument(input, duration) {
  if (!Number.isFinite(duration) || duration <= 0) fail('A duração da fonte é inválida.')
  if (!input || input.version !== 1 || !Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > 100 || !Array.isArray(input.words) || input.words.length > 5000) fail('Documento de edição inválido.')
  const list = (rows, word = false) => {
    const ids = new Set()
    return rows.map(row => {
      const id = identifier(row.id), start = number(row.start, 0, duration), end = Math.min(duration, number(row.end, 0, duration + .05))
      if (end - start < (word ? .001 : .04) || ids.has(id)) fail('Os tempos ou identificadores dos trechos são inválidos.')
      ids.add(id)
      if (!word) return { id, start, end: Math.min(duration, end) }
      if (typeof row.text !== 'string' || row.text.length > 120) fail('Cada palavra aceita até 120 caracteres.')
      return { id, start, end: Math.min(duration, end), text: row.text, highlight: boolean(row.highlight) }
    })
  }
  const c = input.captions, f = input.framing, e = input.effects
  if (!c || !f || !e) fail('A edição não contém todos os controles necessários.')
  const doc = { version: 1, segments: list(input.segments), words: list(input.words, true),
    captions: { enabled: boolean(c.enabled), font: choice(c.font, ['Noto Sans', 'Noto Serif', 'Arial', 'Arial Black', 'DejaVu Sans']), size: number(c.size, 20, 100), color: color(c.color), accent: color(c.accent), y: number(c.y, .1, .9), background: boolean(c.background), wordsPerLine: number(c.wordsPerLine, 1, 8) },
    framing: { mode: choice(f.mode, ['manual']), aspect: choice(f.aspect, ['vertical', 'square', 'original']), fit: choice(f.fit, ['cover', 'contain']), zoom: number(f.zoom, 1, 3), x: number(f.x, 0, 1), y: number(f.y, 0, 1) },
    effects: { brightness: number(e.brightness, 40, 180), contrast: number(e.contrast, 40, 180), saturation: number(e.saturation, 0, 220), blur: number(e.blur, 0, 8), hue: number(e.hue, -180, 180) }, volume: number(input.volume, 0, 2), muted: boolean(input.muted) }
  if (!Number.isInteger(c.wordsPerLine) || !Number.isInteger(c.size)) fail('Use números inteiros no tamanho e no agrupamento das legendas.')
  return doc
}
export function mappedWords(doc) {
  const words = [], ordered = doc.words.slice().sort((a, b) => a.start - b.start)
  let cursor = 0
  for (const segment of doc.segments) {
    for (const word of ordered) {
      const start = Math.max(segment.start, word.start), end = Math.min(segment.end, word.end)
      if (end > start && word.text.trim()) words.push({ ...word, start: cursor + start - segment.start, end: cursor + end - segment.start })
    }
    cursor += segment.end - segment.start
  }
  return words
}
export function outputSize(doc, width, height) {
  if (doc.framing.aspect === 'vertical') return [720, 1280]
  if (doc.framing.aspect === 'square') return [720, 720]
  const scale = Math.min(1, 1280 / Math.max(width, height))
  return [Math.max(2, Math.floor(width * scale / 2) * 2), Math.max(2, Math.floor(height * scale / 2) * 2)]
}
const stamp = value => `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${(value % 60).toFixed(2).padStart(5, '0')}`
const assColor = value => '&H00' + value.slice(5, 7) + value.slice(3, 5) + value.slice(1, 3)
const safeText = value => value.replaceAll('\\', '＼').replaceAll('{', '｛').replaceAll('}', '｝').replace(/[\r\n]/g, ' ')
export function documentASS(doc, width, height) {
  const c = doc.captions, size = c.size * width / 1080, font = c.font === 'Noto Serif' ? 'Noto Serif' : 'Noto Sans'
  const lines = ['[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 0', '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${font},${size},${assColor(c.color)},&H000000FF,&H00101010,&H80101010,0,0,0,0,100,100,0,0,${c.background ? 3 : 1},${Math.max(1, size * (c.background ? .1 : .04))},0,5,${Math.round(width * .08)},${Math.round(width * .08)},0,1`,
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
  let group = []
  const flush = () => {
    if (!group.length) return
    const text = group.map(w => `{\\c${assColor(w.highlight ? c.accent : c.color)}}${safeText(w.text)}`).join(' ')
    lines.push(`Dialogue: 0,${stamp(group[0].start)},${stamp(Math.max(...group.map(w => w.end)))},Default,,0,0,0,,{\\pos(${width / 2},${height * c.y})}${text}`)
    group = []
  }
  if (c.enabled) for (const word of mappedWords(doc)) {
    if (group.length && (group.length >= c.wordsPerLine || word.start - group.at(-1).end > .6)) flush()
    group.push(word)
  }
  flush()
  return lines.join('\n')
}
export function renderPlan(doc, { width, height, hasAudio }) {
  const [w, h] = outputSize(doc, width, height), f = doc.framing, e = doc.effects, filters = [], labels = []
  filters.push(`[0:v]split=${doc.segments.length}${doc.segments.map((_, i) => `[sv${i}]`).join('')}`)
  if (hasAudio) filters.push(`[0:a]asplit=${doc.segments.length}${doc.segments.map((_, i) => `[sa${i}]`).join('')}`)
  for (const [i, segment] of doc.segments.entries()) {
    filters.push(`[sv${i}]trim=start=${segment.start}:end=${segment.end},settb=AVTB,setpts=PTS-STARTPTS[v${i}]`)
    filters.push(hasAudio ? `[sa${i}]atrim=start=${segment.start}:end=${segment.end},asetpts=N/SR/TB[a${i}]` : `anullsrc=r=48000:cl=stereo,atrim=duration=${segment.end - segment.start},asetpts=N/SR/TB[a${i}]`)
    labels.push(`[v${i}][a${i}]`)
  }
  filters.push(`${labels.join('')}concat=n=${doc.segments.length}:v=1:a=1[vc][ac]`)
  const scaledW = Math.ceil(w * f.zoom / 2) * 2, scaledH = Math.ceil(h * f.zoom / 2) * 2
  const geometry = f.fit === 'contain'
    ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)*${f.x}:(oh-ih)*${f.y},scale=${scaledW}:${scaledH},crop=${w}:${h}:(iw-ow)*${f.x}:(ih-oh)*${f.y}`
    : `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase,crop=${w}:${h}:(iw-ow)*${f.x}:(ih-oh)*${f.y}`
  const duration = doc.segments.reduce((sum, s) => sum + s.end - s.start, 0)
  // Bound the final FPS filter too: the WASM core can retain the source EOF
  // timestamp after reordered trim/concat and otherwise pad a frozen tail.
  filters.push(`[vc]${geometry},setsar=1,fps=30,trim=duration=${duration},eq=brightness=${(e.brightness - 100) / 100}:contrast=${e.contrast / 100}:saturation=${e.saturation / 100},hue=h=${e.hue}${e.blur ? ',boxblur=' + e.blur + ':1' : ''}${doc.captions.enabled && doc.words.length ? ',ass=editor.ass:fontsdir=.' : ''}[v]`)
  filters.push(`[ac]volume=${doc.muted ? 0 : doc.volume},aresample=48000[a]`)
  return { width: w, height: h, duration: doc.segments.reduce((sum, s) => sum + s.end - s.start, 0),
    args: ['-i', '$INPUT', '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-movflags', '+faststart', '$OUTPUT'], ass: documentASS(doc, w, h) }
}
