/** Shared constants used across Videos page components */

export const STATUS_COLOR = {
  draft: "default", ready: "success", uploading: "warning", uploaded: "info", failed: "error",
}
export const STATUS_LABEL = { draft: 'Rascunho', ready: 'Pronto', uploading: 'Enviando', uploaded: 'Publicado', failed: 'Falha' }

export const JOB_TYPE_LABEL = { scout: "Pesquisa de vídeos", download: "Baixar", generate: "Gerar", upload: "Enviar", analyze: "Analisar" }
export const JOB_STATUS_COLOR = { running: "info", pending: "default", success: "success", failed: "error", cancelled: "warning" }

export const WHISPER_QUALITIES = [
  { value: "fast", label: "Rápido (base)", desc: "~30s por vídeo de 5min" },
  { value: "balanced", label: "Equilibrado (small)", desc: "~90s por vídeo de 5min" },
  { value: "accurate", label: "Preciso (medium)", desc: "~3min por vídeo de 5min" },
  { value: "best", label: "Melhor (large-v3)", desc: "~8min por vídeo de 5min" },
]
