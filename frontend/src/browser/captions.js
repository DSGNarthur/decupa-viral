// SPDX-License-Identifier: AGPL-3.0-only
// Preset values and emoji vocabulary are copied from ViralMint caption_service.py.
import presets from './caption-presets.json' with { type: 'json' }

const stamp = t => {
  const value = Math.max(0, t)
  return `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${(value % 60).toFixed(2).padStart(5, '0')}`
}
const safe = text => text.replaceAll('\\', '＼').replaceAll('{', '｛').replaceAll('}', '｝').replaceAll('\n', ' ')
const fontBlob = async name => {
  const response = await fetch(`/engine/${name}`)
  if (!response.ok) throw new Error('A fonte das legendas não está disponível nesta publicação.')
  return response.blob()
}
export async function captionExtras(segments, { style = 'viral', emoji = 'none', start = 0, end = Infinity, vertical = true, width = 720, height = 1280 } = {}) {
  const preset = presets.CAPTION_STYLES[style]
  if (!preset) throw new Error('Estilo de legenda desconhecido.')
  const font = style === 'warm' ? 'Noto Serif' : 'Noto Sans'
  const scale = width / 1080
  const fontSize = Math.max(12, Math.round((vertical ? preset.font_size_portrait : preset.font_size_landscape) * scale))
  const margin = Math.round((vertical ? preset.margin_v_portrait || preset.margin_v : preset.margin_v_landscape || preset.margin_v) * height / (vertical ? 1920 : 1080))
  const groupSize = preset.words_per_group || 6
  const words = segments.filter(s => s.end > start && s.start < end).map(s => ({ ...s, start: Math.max(0, s.start - start), end: Math.min(end, s.end) - start, text: s.text.trim() })).filter(s => s.text && s.end > s.start)
  if (!words.length) throw new Error('Não há fala transcrita nesse trecho para gerar legendas.')
  const bold = ['viral', 'bold', 'urban', 'neon'].includes(style) ? -1 : 0
  const lines = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes',
    '', '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${font},${fontSize},${preset.primary_color},${preset.highlight_color},${preset.outline_color},&H80000000,${bold},0,0,0,100,100,0,0,1,${preset.outline_width * scale},${preset.shadow_depth || 0},${preset.alignment || 2},40,40,${margin},1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  let usedEmoji = false
  for (let i = 0, group = 0; i < words.length; i += groupSize, group++) {
    const items = words.slice(i, i + groupSize)
    let icon = ''
    const density = emoji === 'minimal' ? 3 : emoji === 'moderate' ? 2 : emoji === 'heavy' ? 1 : Infinity
    if (group % density === 0) {
      const text = items.map(x => x.text).join(' ').toLowerCase()
      icon = Object.entries(presets.EMOJI_KEYWORDS).find(([key]) => text.includes(key))?.[1] || ''
      if (icon) usedEmoji = true
    }
    const suffix = icon ? ` {\\fnNoto Emoji}${icon}{\\fn${font}}` : ''
    if (preset.highlight_color === preset.primary_color) {
      lines.push(`Dialogue: 0,${stamp(items[0].start)},${stamp(items.at(-1).end)},Default,,0,0,0,,${items.map(x => safe(x.text)).join(' ')}${suffix}`)
    } else {
      for (let active = 0; active < items.length; active++) {
        const text = items.map((x, index) => index === active ? `{\\c${preset.highlight_color}}${safe(x.text)}{\\c${preset.primary_color}}` : safe(x.text)).join(' ')
        lines.push(`Dialogue: 0,${stamp(items[active].start)},${stamp(items[active + 1]?.start ?? items[active].end)},Default,,0,0,0,,${text}${suffix}`)
      }
    }
  }
  const extras = { 'captions.ass': lines.join('\n'), 'NotoSans.ttf': await fontBlob('NotoSans.ttf') }
  if (font === 'Noto Serif') extras['NotoSerif.ttf'] = await fontBlob('NotoSerif.ttf')
  if (usedEmoji) extras['NotoEmoji-Bold.ttf'] = await fontBlob('NotoEmoji-Bold.ttf')
  return extras
}
