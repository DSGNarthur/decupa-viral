/**
 * Shared configuration constants for stock video generation.
 * Used by StockVideo studio page and supporting components.
 */

/* ── TTS Providers ────────────────────────────────────────────────── */

export const TTS_PROVIDERS = [
  { value: "edge_tts",   label: "Edge TTS , Grátis",     cost: "$0" },
  { value: "openai_tts", label: "OpenAI TTS , Econômico", cost: "~$0.015/1K chars" },
]

/* ── Caption Styles ───────────────────────────────────────────────── */

export const CAPTION_STYLES = [
  { value: "viral",   label: "Viral , Destaque palavra por palavra" },
  { value: "classic", label: "Clássico , Frase completa" },
  { value: "bold",    label: "Negrito , Destaque de 2 palavras" },
  { value: "neon",    label: "Neon , Brilho rosa e ciano" },
  { value: "minimal", label: "Minimalista , Limpo e sutil" },
  { value: "karaoke", label: "Karaokê , Cinza para amarelo" },
  { value: "glow",    label: "Brilho , Destaque laranja-dourado" },
]

/* ── Music Genres ─────────────────────────────────────────────────── */

export const MUSIC_GENRES = [
  { value: "lofi",       label: "Lo-fi Chill" },
  { value: "cinematic",  label: "Cinematográfico" },
  { value: "upbeat",     label: "Electronic Upbeat" },
  { value: "ambient",    label: "Ambiente" },
  { value: "corporate",  label: "Corporativo / Motivacional" },
  { value: "jazz",       label: "Jazz" },
  { value: "hiphop",     label: "Hip-Hop / Trap" },
  { value: "classical",  label: "Clássico" },
  { value: "edm",        label: "EDM / Dance" },
  { value: "acoustic",   label: "Acústico / Folk" },
  { value: "rnb",        label: "R&B / Soul" },
  { value: "rock",       label: "Rock" },
]
