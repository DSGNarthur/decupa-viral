import { useState } from "react"
import {
  Box, Stack, Typography, FormControl, InputLabel, Select, MenuItem,
  RadioGroup, Radio, FormControlLabel, Alert, IconButton, Tooltip,
  CircularProgress,
} from "@mui/material"
import { GlassPanel } from "../../utils/glassFx"
import TranslateOutlinedIcon from "@mui/icons-material/TranslateOutlined"
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined"
import StopIcon from "@mui/icons-material/Stop"
import http from "../../api/http"
import useAppStore from "../../store/appStore"
import { CAPTION_STYLES } from "../../components/tools/captionOptions"
import ToolRunner from "../../components/tools/ToolRunner"
import useDocumentTitle from "../../hooks/useDocumentTitle"

// Mirror of backend's SUPPORTED_LANGUAGES.
const BROWSER = import.meta.env.VITE_BROWSER_RUNTIME === 'true'
const LANGUAGE_NAMES = new Intl.DisplayNames(['pt-BR'], { type: 'language' })
const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese (Mandarin)" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "tr", name: "Turkish" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "fi", name: "Finnish" },
].map(language => ({ ...language, name: LANGUAGE_NAMES.of(language.code) }))

// ⚠️ These have to be voices the DUB ENGINE accepts, and the dub runs on
// Edge TTS. They used to be Gemini names (Kore, Puck, Zephyr, …), which
// edge_tts rejects outright with `ValueError: Invalid voice 'Kore'` — so full
// dub failed for every voice the page offered, whichever one you picked.
// Derived from edge_tts_service.RECOMMENDED_VOICES and pinned by
// tests/test_voice_vocabulary_parity.py. Multilingual voices lead: this is the
// TRANSLATE page, and only they speak the target language.
const DUB_VOICES = [
  { id: "en-US-AndrewMultilingualNeural", label: "Andrew (Masculino, natural)" },
  { id: "en-US-AvaMultilingualNeural", label: "Ava (Feminino, natural)" },
  { id: "en-US-BrianMultilingualNeural", label: "Brian (Masculino, acolhedor)" },
  { id: "en-US-EmmaMultilingualNeural", label: "Emma (Feminino, claro)" },
  { id: "en-US-AriaNeural", label: "Aria (Feminino, clássico)" },
  { id: "en-US-GuyNeural", label: "Guy (Masculino, clássico)" },
  { id: "en-US-JennyNeural", label: "Jenny (feminino, amigável)" },
]

export default function ToolTranslate() {
  useDocumentTitle("Traduzir + Dublar")
  const showSnackbar = useAppStore((s) => s.showSnackbar)
  const [target, setTarget] = useState("es")
  const [mode, setMode] = useState("captions_only")  // "captions_only" | "full_dub"
  const [voiceId, setVoiceId] = useState(DUB_VOICES[0].id)
  const [captionStyle, setCaptionStyle] = useState("viral")
  const [emojiStyle, setEmojiStyle] = useState("moderate")

  // Voice preview — same pattern as Voiceover.jsx
  const [previewVoice, setPreviewVoice] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(null)
  const [audioRef, setAudioRef] = useState(null)
  const [blobUrlRef, setBlobUrlRef] = useState(null)

  const stopPreview = () => {
    if (audioRef) { audioRef.pause(); audioRef.src = "" }
    if (blobUrlRef) { URL.revokeObjectURL(blobUrlRef); setBlobUrlRef(null) }
    setPreviewVoice(null)
  }

  const playPreview = async (voice) => {
    if (previewVoice === voice) { stopPreview(); return }
    stopPreview()
    setPreviewLoading(voice)
    try {
      const res = await http.post(
        "/api/tts/preview",
        // The dub runs on Edge TTS, so the preview must too — previewing
        // one engine and dubbing with another is how the lists drifted
        // apart in the first place.
        { provider: "edge_tts", voice_id: voice },
        { responseType: "blob" },
      )
      const url = URL.createObjectURL(res.data)
      setBlobUrlRef(url)
      const audio = new Audio(url)
      audio.onended = () => { setPreviewVoice(null); URL.revokeObjectURL(url); setBlobUrlRef(null) }
      audio.onerror = () => { showSnackbar("Não foi possível reproduzir a prévia", "error"); setPreviewVoice(null) }
      setAudioRef(audio)
      await audio.play()
      setPreviewVoice(voice)
    } catch (e) {
      showSnackbar(("Falha na prévia: " + String(e.response?.data?.detail || e.message) + ""), "error")
    } finally {
      setPreviewLoading(null)
    }
  }

  const fieldBuilder = () => {
    const fields = {
      target_language: target,
      mode,
      caption_style: captionStyle,
      emoji_style: emojiStyle,
    }
    if (mode === "full_dub") fields.voice_id = voiceId
    return fields
  }

  const targetName = LANGUAGES.find((l) => l.code === target)?.name || target

  return (
    <ToolRunner
      title={BROWSER ? 'Traduzir legendas' : "Traduzir + Dublar"}
      description={BROWSER ? 'Traduza as legendas e exporte o vídeo com o áudio original. Os tempos das palavras traduzidas são aproximados.' : ("Traduza as legendas e, opcionalmente, faça a dublagem do áudio para " + String(LANGUAGES.length) + " idiomas")}
      icon={<TranslateOutlinedIcon fontSize="large" />}
      endpoint="/api/tools/translate"
      fieldBuilder={fieldBuilder}
      processLabel={mode === "full_dub" ? ("Traduzir + dublar para " + String(targetName) + "") : ("Traduzir legendas para " + String(targetName) + "")}
    >
      <Stack spacing={2.5}>
        {/* Target language */}
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Idioma de destino</InputLabel>
          <Select value={target} label={"Idioma de destino"} onChange={(e) => setTarget(e.target.value)}>
            {LANGUAGES.map((l) => (
              <MenuItem key={l.code} value={l.code}>{l.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Mode picker */}
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.75 }}>
            O que traduzir
          </Typography>
          <RadioGroup value={mode} onChange={(e) => setMode(e.target.value)}>
            <GlassPanel sx={{ p: 1, mb: 0.75, cursor: "pointer" }}
              onClick={() => setMode("captions_only")}>
              <FormControlLabel
                value="captions_only"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                      Apenas legendas traduzidas
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Mantém o áudio original. Insere {targetName} legendas por cima. Mais rápido e mais barato.
                    </Typography>
                  </Box>
                }
              />
            </GlassPanel>
            <GlassPanel sx={{ p: 1, cursor: "pointer" }}
              onClick={() => { if (!BROWSER) setMode("full_dub") }}>
              <FormControlLabel
                value="full_dub"
                disabled={BROWSER}
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                      Dublagem completa (áudio + legendas)
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Substitui o áudio por {targetName} narração. Adiciona legendas correspondentes.
                    </Typography>
                  </Box>
                }
              />
            </GlassPanel>
          </RadioGroup>
        </Box>

        {/* Voice picker — only relevant for full_dub */}
        {mode === "full_dub" && (
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel>Voz (multilíngue)</InputLabel>
            <Select
              value={voiceId}
              label={"Voz (multilíngue)"}
              onChange={(e) => setVoiceId(e.target.value)}
              renderValue={(v) => DUB_VOICES.find((d) => d.id === v)?.label || v}
            >
              {DUB_VOICES.map(({ id: v, label }) => {
                const isPlaying = previewVoice === v
                const isLoading = previewLoading === v
                return (
                  <MenuItem key={v} value={v} sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
                    <Box sx={{ flex: 1 }}>{label}</Box>
                    <Tooltip title={isPlaying ? "Parar prévia" : "Ouvir prévia da voz"} placement="left" arrow>
                      <IconButton
                        size="small"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); playPreview(v) }}
                        sx={{ p: 0.25, color: isPlaying ? "primary.main" : "text.secondary" }}
                      >
                        {isLoading ? <CircularProgress size={14} />
                         : isPlaying ? <StopIcon sx={{ fontSize: 18 }} />
                         : <VolumeUpOutlinedIcon sx={{ fontSize: 18 }} />}
                      </IconButton>
                    </Tooltip>
                  </MenuItem>
                )
              })}
            </Select>
          </FormControl>
        )}

        {/* Caption style */}
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Estilo da legenda</InputLabel>
            <Select value={captionStyle} label={"Estilo da legenda"} onChange={(e) => setCaptionStyle(e.target.value)}>
              {CAPTION_STYLES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Intensidade dos emojis</InputLabel>
            <Select value={emojiStyle} label={"Intensidade dos emojis"} onChange={(e) => setEmojiStyle(e.target.value)}>
              <MenuItem value="none">Nenhum</MenuItem>
              <MenuItem value="minimal">Mínimo</MenuItem>
              <MenuItem value="moderate">Moderado</MenuItem>
              <MenuItem value="heavy">Intenso</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {/* Notes */}
        <Alert severity="info" variant="outlined" sx={{ fontSize: "0.78rem" }}>
          {mode === "full_dub" ? (
            <>
              A narração dublada pode ficar um pouco mais longa ou mais curta que o áudio original.
              O Decupa Viral aplica um pequeno aceleramento (até 1.15×) para ajustar; além disso, a duração
              do vídeo original prevalece e qualquer dublagem extra no final é cortada.
            </>
          ) : (
            <>
              As legendas são geradas com os mesmos timestamps da fala original, então elas
              permanecem sincronizadas. O áudio original toca sem alterações.
            </>
          )}
        </Alert>
      </Stack>
    </ToolRunner>
  )
}
