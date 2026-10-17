// SPDX-License-Identifier: AGPL-3.0-only
// Supoclip document contract, adapted to Decupa's native editor.
export const clone = value => structuredClone(value)
export const durationOf = doc => doc.segments.reduce((sum, s) => sum + s.end - s.start, 0)
export const formatTime = value => {
  const s = Math.max(0, Number(value) || 0)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`
}
export function splitDocument(document, segmentId, time, newId) {
  const result = clone(document), index = result.segments.findIndex(s => s.id === segmentId)
  const s = result.segments[index]
  if (!s || time - s.start < .04 || s.end - time < .04) throw new Error('Escolha um ponto dentro do trecho, distante das extremidades.')
  result.segments.splice(index, 1, { ...s, end: time }, { ...s, id: newId, start: time })
  return result
}
export function moveSegment(document, id, delta) {
  const result = clone(document), from = result.segments.findIndex(s => s.id === id), to = from + delta
  if (from < 0 || to < 0 || to >= result.segments.length) return result
  const [segment] = result.segments.splice(from, 1)
  result.segments.splice(to, 0, segment)
  return result
}
export function wordsAt(document, time) {
  const words = document.words.filter(w => w.text.trim()).slice().sort((a, b) => a.start - b.start)
  let group = []
  for (const word of words) {
    if (group.length && (group.length >= document.captions.wordsPerLine || word.start - group.at(-1).end > .6)) {
      if (time >= group[0].start && time < Math.max(...group.map(w => w.end))) return group
      group = []
    }
    group.push(word)
  }
  return group.length && time >= group[0].start && time < Math.max(...group.map(w => w.end)) ? group : []
}
