import { Typography, Alert } from "@mui/material"

export default function EstimatedCost({ ttsProvider, script }) {
  const wordCount = script ? script.trim().split(/\s+/).filter(Boolean).length : 0
  const estVideoSeconds = wordCount > 0 ? Math.ceil(wordCount / 2.5) : 0

  let ttsCost = 0
  if (ttsProvider === "openai_tts") ttsCost = 0.02

  const total = ttsCost
  return (
    <Alert severity={total === 0 ? "success" : "info"} sx={{ mt: 1.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Custo estimado: {total === 0 ? "Grátis" : ("~$" + String(total.toFixed(2)) + "")}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
        Voz: {ttsCost === 0 ? "Grátis (Edge TTS)" : ("~$" + String(ttsCost.toFixed(2)) + "")} · Vídeo: Grátis (banco de imagens Pexels)
      </Typography>
      {estVideoSeconds > 0 && (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.25 }}>
          ~{estVideoSeconds}s vídeo de {wordCount} palavras
        </Typography>
      )}
    </Alert>
  )
}
