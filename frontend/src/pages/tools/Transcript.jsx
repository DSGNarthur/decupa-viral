// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Alert, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography,
} from "@mui/material"
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined"
import ToolRunner from "../../components/tools/ToolRunner"
import useDocumentTitle from "../../hooks/useDocumentTitle"

// Transcript Downloader — reads the caption track a video ALREADY publishes
// (creator-uploaded, else auto-generated). No video download, no Whisper run.
// Export Subtitles is the other half of the pair: it transcribes an uploaded
// file. They stay separate pages on purpose — a source with no captions fails
// here and says so, rather than silently turning into a long transcription.

// "auto" is a UI sentinel, NOT the wire value: MUI's Select renders an empty
// string as "nothing selected". It maps back to "" in fieldBuilder, which the
// backend reads as "whatever the video has" (its own language first).
const AUTO = "auto"

const LANGUAGES = [
  { code: AUTO, label: "Automático , o que o vídeo tiver" },
  { code: "en", label: "Inglês" },
  { code: "es", label: "Espanhol" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Francês" },
  { code: "de", label: "Alemão" },
  { code: "zh", label: "Chinês" },
  { code: "ja", label: "Japonês" },
  { code: "ko", label: "Coreano" },
  { code: "ar", label: "Árabe" },
  { code: "ru", label: "Russo" },
]

const FORMATS = [
  { value: "txt", label: ".txt , transcrição simples", hint: "Só as palavras, sem timestamps. Ideal para ler, resumir ou colar em um documento." },
  { value: "srt", label: ".srt , legendas com tempo", hint: "Cues com timestamp. O formato que o YouTube, o Premiere e a maioria dos editores espera." },
  { value: "vtt", label: ".vtt , legendas para web", hint: "Cues com timestamp no formato WebVTT usado por players HTML5." },
]

const URL_RE = /^https?:\/\/[^\s/]+\.[^\s]+$/i

export default function ToolTranscript() {
  useDocumentTitle("Baixador de Transcrição")
  const [params] = useSearchParams()
  const [url, setUrl] = useState(() => (params.get("url") || "").slice(0, 2000))
  const [language, setLanguage] = useState(AUTO)
  const [format, setFormat] = useState("txt")

  const trimmed = url.trim()
  const valid = URL_RE.test(trimmed)
  const formatHint = FORMATS.find((f) => f.value === format)?.hint || ""

  return (
    <ToolRunner
      title={"Baixador de Transcrição"}
      description={"Cole um link de vídeo e baixe as legendas que ele já tem , sem transcrição"}
      icon={<ArticleOutlinedIcon fontSize="large" />}
      endpoint="/api/tools/transcript"
      processLabel={"Obter transcrição"}
      downloadLabel={("Baixar ." + String(format) + "")}
      hideFileInput
      canSubmit={valid}
      disabledReason={valid ? "" : "Cole uma URL de vídeo http(s) válida"}
      fieldBuilder={() => ({
        url: trimmed,
        language: language === AUTO ? "" : language,
        format,
      })}
      scriptInput={
        <Stack spacing={2}>
          <Alert
            severity="info"
            sx={{ py: 0.5, "& .MuiAlert-message": { fontSize: "0.82rem" } }}
          >
            Lê a faixa de legendas que o site já publica, então leva segundos. Vídeos
            sem nenhuma legenda não podem ser lidos assim , baixe o vídeo e use{" "}
            <strong>Exportar Legendas</strong> para transcrevê-lo.
          </Alert>

          <TextField
            fullWidth
            label={"URL do vídeo"}
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={url.length > 0 && !valid}
            helperText={
              url.length > 0 && !valid
                ? "Deve ser um link http:// ou https:// completo"
                : "YouTube e qualquer outro site compatível com o baixador."
            }
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="transcript-language-label">Idioma</InputLabel>
              <Select
                labelId="transcript-language-label"
                value={language}
                label={"Idioma"}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 230 }}>
              <InputLabel id="transcript-format-label">Formato</InputLabel>
              <Select
                labelId="transcript-format-label"
                value={format}
                label={"Formato"}
                onChange={(e) => setFormat(e.target.value)}
              >
                {FORMATS.map((f) => (
                  <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {formatHint}
          </Typography>

          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Se o vídeo só tiver legendas geradas automaticamente, espere pontuação ausente e
            alguma palavra mal ouvida , essa é a transcrição do site, não a nossa.
          </Typography>
        </Stack>
      }
    />
  )
}
