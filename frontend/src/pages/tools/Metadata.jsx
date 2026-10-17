import { useState } from "react"
import {
  Box, Typography, Stack, TextField, Alert, ToggleButton, ToggleButtonGroup,
  IconButton, Tooltip, Chip,
} from "@mui/material"
import { GlassPanel } from "../../utils/glassFx"
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import ToolRunner from "../../components/tools/ToolRunner"
import PromptField from "../../components/tools/PromptField"
import useDocumentTitle from "../../hooks/useDocumentTitle"
import useAppStore from "../../store/appStore"
import useJobOutput from "../../hooks/useJobOutput"

// Metadata generator — three input modes (paste text / pick a topic /
// upload a video). The result is parsed JSON returned in the job's
// extra_output, so we can render it inline without a separate fetch.

// Blank-page topic starters — click to fill, then generate (or "✨ Enhance"
// the script field first when in paste mode).
const TOPIC_STARTERS = [
  "5 beginner mistakes in [your niche]",
  "How I grew my channel to 10k in 90 days",
  "The truth about [trending topic] nobody tells you",
  "3 tools that 10x'd my workflow",
]

const MODES = [
  { value: "text", label: "Colar roteiro", description: "Mais rápido , sem transcrição" },
  { value: "topic", label: "A partir do tópico", description: "Gerar a partir de um tópico simples" },
  { value: "file", label: "Enviar vídeo", description: "O Whisper transcreve primeiro" },
]

function ResultPreview({ jobId }) {
  // The job's own output_json, via the shared hook: the store never carries a
  // structured `output`, so reading it here meant this preview could never
  // render — the "click Download instead" fallback was all anyone ever saw.
  // Going through the hook also makes it survive a reload.
  const { output, loading } = useJobOutput(jobId)
  const metadata = output?.metadata
  const showSnackbar = useAppStore((s) => s.showSnackbar)
  const copy = (s) => {
    if (!s) return
    navigator.clipboard.writeText(s).then(
      () => showSnackbar?.("Copied", "success"),
      () => showSnackbar?.("Could not copy", "warning"),
    )
  }
  if (!metadata) {
    return (
      <Alert severity="info" sx={{ fontSize: "0.85rem" }}>
        {loading
          ? "Carregando resultado…"
          : <>Resultado pronto , clique em <strong>Baixar</strong> abaixo para obter o arquivo JSON.</>}
      </Alert>
    )
  }
  const tags = metadata.youtube_tags || []
  return (
    <Stack spacing={1.5}>
      <Field label={"Título do YouTube"} value={metadata.youtube_title} onCopy={copy} />
      <Field label={"Descrição do YouTube"} value={metadata.youtube_description} onCopy={copy} multiline />
      {tags.length > 0 && (
        <Field
          label={"Tags do YouTube"}
          value={tags.join(", ")}
          onCopy={copy}
        />
      )}
      <Field label={"Legenda do TikTok"} value={metadata.tiktok_title} onCopy={copy} multiline />
    </Stack>
  )
}

function Field({ label, value, onCopy, multiline }) {
  if (!value) return null
  return (
    <GlassPanel sx={{ p: 1.25, borderRadius: 1.5, display: "flex", alignItems: "flex-start", gap: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.65rem" }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{
          mt: 0.25, fontSize: "0.88rem", lineHeight: 1.45, wordBreak: "break-word",
          whiteSpace: multiline ? "pre-wrap" : "normal",
        }}>
          {value}
        </Typography>
      </Box>
      <Tooltip title={"Copiar"}>
        <IconButton size="small" onClick={() => onCopy(value)} sx={{ flexShrink: 0 }}>
          <ContentCopyIcon sx={{ fontSize: "0.95rem" }} />
        </IconButton>
      </Tooltip>
    </GlassPanel>
  )
}

export default function ToolMetadata() {
  useDocumentTitle("Gerador de Metadados")
  const [mode, setMode] = useState("text")
  const [text, setText] = useState("")
  const [topic, setTopic] = useState("")

  const canSubmit = mode === "text" ? !!text.trim()
    : mode === "topic" ? !!topic.trim()
    : true  // file mode — handled by ToolRunner's file presence check

  return (
    <ToolRunner
      title={"Título / Descrição / Tags"}
      description={"Gerar metadados de SEO para um vídeo, transcrição ou tópico simples"}
      icon={<LabelOutlinedIcon fontSize="large" />}
      endpoint="/api/tools/metadata"
      processLabel={"Gerar"}
      downloadLabel={"Baixar JSON"}
      hideFileInput={mode !== "file"}
      canSubmit={canSubmit}
      disabledReason={mode === "topic" ? "Digite um tópico" : "Cole seu roteiro ou transcrição"}
      fieldBuilder={() => ({
        text: mode === "text" ? text : "",
        topic: mode === "topic" ? topic : "",
      })}
      resultPreview={(jobId) => <ResultPreview jobId={jobId} />}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 1 }}>
            Modo de entrada
          </Typography>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, v) => v && setMode(v)}
            size="small"
            sx={{ flexWrap: "wrap" }}
          >
            {MODES.map((m) => (
              <ToggleButton key={m.value} value={m.value} sx={{ textTransform: "none", flexDirection: "column", py: 1, px: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{m.label}</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>{m.description}</Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        {mode === "text" && (
          <PromptField
            minRows={6} maxRows={18}
            autoFocus
            enhanceKind="metadata"
            label={"Roteiro / transcrição"}
            placeholder={"Cole um roteiro, transcrição ou esboço. A IA vai transformar isso em metadados de plataforma."}
            value={text}
            onChange={(e) => setText(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 20000 } }}
            helperText={("" + String(text.length) + " / 20.000 caracteres")}
          />
        )}

        {mode === "topic" && (
          <Stack spacing={1}>
            {!topic.trim() && (
              <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 0.75 }}>
                {TOPIC_STARTERS.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    size="small"
                    onClick={() => setTopic(t)}
                    sx={{ fontSize: "0.74rem", height: 26 }}
                  />
                ))}
              </Stack>
            )}
            <TextField
              fullWidth
              autoFocus
              label={"Tópico"}
              placeholder={"ex.: \"ideias de startup de IA para fundadores solo em 2026\""}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        )}

        {mode === "file" && (
          <Alert severity="info" sx={{ fontSize: "0.82rem" }}>
            Envie um vídeo abaixo. Vamos transcrever com o Whisper e depois gerar metadados a partir da transcrição.
          </Alert>
        )}
      </Stack>
    </ToolRunner>
  )
}
