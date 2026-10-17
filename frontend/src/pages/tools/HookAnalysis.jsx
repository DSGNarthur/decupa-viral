import { useState } from "react"
import {
  Box, Stack, Typography, IconButton, Tooltip,
  CircularProgress, alpha, useTheme,
} from "@mui/material"
import { GlassPanel } from "../../utils/glassFx"
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined"
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined"
import StopIcon from "@mui/icons-material/Stop"
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined"
import http from "../../api/http"
import useAppStore from "../../store/appStore"
import ToolRunner from "../../components/tools/ToolRunner"
import useDocumentTitle from "../../hooks/useDocumentTitle"

/**
 * Hook Detector — score the first 10 seconds of any video.
 *
 * Unlike other tools, the output isn't a downloadable file — it's
 * structured JSON (score + strengths + weaknesses + alternatives)
 * stored in the job's output_data. We fetch /api/jobs/{id} after
 * job_complete and render the analysis card directly.
 */
export default function ToolHookAnalysis() {
  useDocumentTitle("Detector de Gancho")
  const theme = useTheme()
  const showSnackbar = useAppStore((s) => s.showSnackbar)
  const [result, setResult] = useState(null)
  const [previewVoice, setPreviewVoice] = useState(null)  // index of alternative currently playing
  const [previewLoading, setPreviewLoading] = useState(null)
  const [audioRef, setAudioRef] = useState(null)

  const fetchResult = async (jobId) => {
    try {
      const res = await http.get(`/api/jobs/${jobId}`)
      const out = res.data?.output_json
      if (!out) {
        showSnackbar("A análise do gancho não retornou resultado", "warning")
        return
      }
      const parsed = typeof out === "string" ? JSON.parse(out) : out
      setResult({
        ...parsed,
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || parsed.issues || [],
        alternatives: parsed.alternatives || parsed.suggested_hooks || [],
      })
    } catch (e) {
      showSnackbar(("Não foi possível carregar o resultado do gancho: " + String(e.message) + ""), "error")
    }
  }

  const stopPreview = () => {
    if (audioRef) { audioRef.pause(); audioRef.src = "" }
    setPreviewVoice(null)
  }

  const previewAlternative = async (idx, text) => {
    if (previewVoice === idx) { stopPreview(); return }
    stopPreview()
    setPreviewLoading(idx)
    try {
      // Use the browser's Web Speech API for client-side TTS — no roundtrip,
      // no cost. Falls back to a snackbar if the browser doesn't support it.
      if (!("speechSynthesis" in window)) {
        showSnackbar("Seu navegador não oferece suporte à síntese de fala. Copie o texto.", "info")
        return
      }
      stopPreview()
      const utter = new SpeechSynthesisUtterance(text)
      utter.rate = 1.0
      utter.onend = () => setPreviewVoice(null)
      utter.onerror = () => setPreviewVoice(null)
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
      setPreviewVoice(idx)
    } finally {
      setPreviewLoading(null)
    }
  }

  const copyAlternative = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      showSnackbar("Copiado para a área de transferência", "success")
    } catch {
      showSnackbar("Não foi possível copiar , selecione o texto manualmente", "warning")
    }
  }

  // Score → color helper. ≥7 green, 4-6 yellow, ≤3 red.
  const scoreColor = (s) =>
    s >= 7 ? "success.main" : s >= 4 ? "warning.main" : "error.main"

  return (
    <ToolRunner
      title={"Detector de Gancho"}
      description={"Avalie os primeiros 10 segundos de qualquer vídeo e receba alternativas de abertura mais fortes"}
      icon={<LightbulbOutlinedIcon fontSize="large" />}
      endpoint="/api/tools/hook-analysis"
      downloadable={false}
      processLabel={"Analisar gancho"}
      onJobComplete={fetchResult}
      resultPreview={() => result ? (
        <Stack spacing={2}>
          {/* Score band */}
          <GlassPanel sx={{ p: 2, borderRadius: 2 }}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Box sx={{
                width: 64, height: 64, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                bgcolor: alpha(theme.palette[result.score >= 7 ? "success" : result.score >= 4 ? "warning" : "error"].main, 0.12),
                color: scoreColor(result.score),
                flexShrink: 0,
              }}>
                <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {result.score}
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: "text.secondary", letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>
                  Pontuação do gancho / 10
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
                  {result.score >= 8 ? "Abertura forte , mantenha assim" :
                    result.score >= 6 ? "Razoável , veja os pontos fracos para melhorias" :
                    result.score >= 4 ? "Mediana , as alternativas abaixo devem ajudar" :
                    "Fraca , considere uma reescrita completa usando as alternativas"}
                </Typography>
              </Box>
            </Stack>
          </GlassPanel>

          {/* Strengths + Weaknesses two-column */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <GlassPanel sx={{ p: 2, flex: 1, borderRadius: 2, borderColor: alpha(theme.palette.success.main, 0.4) }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "success.main", display: "block", mb: 1, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Pontos fortes
              </Typography>
              <Stack spacing={0.75}>
                {(result.strengths || []).map((s, i) => (
                  <Typography key={i} variant="body2" sx={{ fontSize: "0.85rem", display: "flex", gap: 1 }}>
                    <Box component="span" sx={{ color: "success.main" }}>✓</Box>
                    {s}
                  </Typography>
                ))}
                {(!result.strengths || result.strengths.length === 0) && (
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>Nenhum identificado</Typography>
                )}
              </Stack>
            </GlassPanel>
            <GlassPanel sx={{ p: 2, flex: 1, borderRadius: 2, borderColor: alpha(theme.palette.error.main, 0.4) }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "error.main", display: "block", mb: 1, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Pontos fracos
              </Typography>
              <Stack spacing={0.75}>
                {(result.weaknesses || []).map((s, i) => (
                  <Typography key={i} variant="body2" sx={{ fontSize: "0.85rem", display: "flex", gap: 1 }}>
                    <Box component="span" sx={{ color: "error.main" }}>×</Box>
                    {s}
                  </Typography>
                ))}
                {(!result.weaknesses || result.weaknesses.length === 0) && (
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>Nenhum identificado</Typography>
                )}
              </Stack>
            </GlassPanel>
          </Stack>

          {/* Alternatives */}
          <GlassPanel sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "primary.main", display: "block", mb: 1.5, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Alternativas de gancho mais fortes
            </Typography>
            <Stack spacing={1}>
              {(result.alternatives || []).map((alt, i) => (
                <GlassPanel
                  key={i}
                  sx={{
                    p: 1.5, display: "flex", alignItems: "center", gap: 1,
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {i + 1}. "{alt}"
                    </Typography>
                  </Box>
                  <Tooltip title={previewVoice === i ? "Parar" : "Visualizar com TTS do navegador"} arrow>
                    <IconButton
                      size="small"
                      onClick={() => previewAlternative(i, alt)}
                      sx={{ color: previewVoice === i ? "primary.main" : "text.secondary" }}
                    >
                      {previewLoading === i
                        ? <CircularProgress size={14} />
                        : previewVoice === i
                          ? <StopIcon sx={{ fontSize: 18 }} />
                          : <VolumeUpOutlinedIcon sx={{ fontSize: 18 }} />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={"Copiar para a área de transferência"} arrow>
                    <IconButton
                      size="small"
                      onClick={() => copyAlternative(alt)}
                      sx={{ color: "text.secondary" }}
                    >
                      <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </GlassPanel>
              ))}
            </Stack>
          </GlassPanel>

          {/* Original transcript */}
          {result.transcript && (
            <GlassPanel sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.02) }}>
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, display: "block", mb: 0.5, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Abertura original (primeiros {result.duration_analyzed?.toFixed(1) || "10"}s)
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
                "{result.transcript}"
              </Typography>
            </GlassPanel>
          )}
        </Stack>
      ) : null}
    >
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Envie um vídeo. O Decupa Viral corta os primeiros 10 segundos, transcreve
        o áudio e pede à IA para avaliar o gancho de abertura e sugerir 3
        alternativas mais fortes. Ideal para conteúdo curto em que os primeiros
        3 segundos decidem se os espectadores ficam.
      </Typography>
    </ToolRunner>
  )
}
