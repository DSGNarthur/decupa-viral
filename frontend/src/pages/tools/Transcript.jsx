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
  { code: AUTO, label: "Auto — whatever the video has" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "ar", label: "Arabic" },
  { code: "ru", label: "Russian" },
]

const FORMATS = [
  { value: "txt", label: ".txt — plain transcript", hint: "Just the words, no timestamps. Best for reading, summarising or pasting into a doc." },
  { value: "srt", label: ".srt — timed subtitles", hint: "Timestamped cues. The format YouTube, Premiere and most editors expect." },
  { value: "vtt", label: ".vtt — web subtitles", hint: "Timestamped cues in the WebVTT flavour used by HTML5 players." },
]

const URL_RE = /^https?:\/\/[^\s/]+\.[^\s]+$/i

export default function ToolTranscript() {
  useDocumentTitle("Transcript Downloader")
  const [params] = useSearchParams()
  const [url, setUrl] = useState(() => (params.get("url") || "").slice(0, 2000))
  const [language, setLanguage] = useState(AUTO)
  const [format, setFormat] = useState("txt")

  const trimmed = url.trim()
  const valid = URL_RE.test(trimmed)
  const formatHint = FORMATS.find((f) => f.value === format)?.hint || ""

  return (
    <ToolRunner
      title="Transcript Downloader"
      description="Paste a video link and download the captions it already has — no transcription"
      icon={<ArticleOutlinedIcon fontSize="large" />}
      endpoint="/api/tools/transcript"
      processLabel="Get transcript"
      downloadLabel={`Download .${format}`}
      hideFileInput
      canSubmit={valid}
      disabledReason={valid ? "" : "Paste a valid http(s) video URL"}
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
            Reads the subtitle track the site already publishes, so it takes seconds. Videos
            with no captions at all can&apos;t be read this way — download the video and use{" "}
            <strong>Export Subtitles</strong> to transcribe it instead.
          </Alert>

          <TextField
            fullWidth
            label="Video URL"
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={url.length > 0 && !valid}
            helperText={
              url.length > 0 && !valid
                ? "Must be a full http:// or https:// link"
                : "YouTube, and any other site the downloader supports."
            }
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="transcript-language-label">Language</InputLabel>
              <Select
                labelId="transcript-language-label"
                value={language}
                label="Language"
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 230 }}>
              <InputLabel id="transcript-format-label">Format</InputLabel>
              <Select
                labelId="transcript-format-label"
                value={format}
                label="Format"
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
            If the video only has auto-generated captions, expect missing punctuation and the odd
            misheard word — that&apos;s the site&apos;s transcript, not ours.
          </Typography>
        </Stack>
      }
    />
  )
}
