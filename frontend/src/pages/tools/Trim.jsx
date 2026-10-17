import { useState } from "react"
import { Box, Typography, Stack, TextField, Alert } from "@mui/material"
import ContentCutIcon from "@mui/icons-material/ContentCutOutlined"
import ToolRunner from "../../components/tools/ToolRunner"
import useDocumentTitle from "../../hooks/useDocumentTitle"

// Trim / Cut — keep a [start, end] window of a video. Pure FFmpeg (frame-
// accurate re-encode). Times accept either seconds (12.5) or MM:SS
// (1:23) / HH:MM:SS for convenience.

function parseTime(s) {
  const raw = (s || "").trim()
  if (!raw) return NaN
  if (raw.includes(":")) {
    const parts = raw.split(":").map((p) => parseFloat(p))
    if (parts.some((n) => isNaN(n))) return NaN
    return parts.reduce((acc, n) => acc * 60 + n, 0)
  }
  return parseFloat(raw)
}

export default function ToolTrim() {
  useDocumentTitle("Aparar / Cortar")
  const [start, setStart] = useState("0:00")
  const [end, setEnd] = useState("")

  const startSec = parseTime(start)
  const endSec = parseTime(end)
  const startOk = !isNaN(startSec) && startSec >= 0
  const endOk = !isNaN(endSec) && endSec > 0
  const rangeOk = startOk && endOk && endSec - startSec >= 0.5
  const tooShort = startOk && endOk && endSec - startSec < 0.5

  return (
    <ToolRunner
      title={"Aparar / Cortar"}
      description={"Mantenha apenas a parte que você quer , defina um início e um fim, descarte o resto"}
      icon={<ContentCutIcon fontSize="large" />}
      endpoint="/api/tools/trim"
      processLabel={"Cortar"}
      canSubmit={rangeOk}
      disabledReason={
        !endOk ? "Defina um tempo de fim" : tooShort ? "O intervalo deve ter pelo menos 0.5s" : "Defina um início antes do fim"
      }
      fieldBuilder={() => ({ start_seconds: startSec, end_seconds: endSec })}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 1 }}>
            Manter de → até
          </Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label={"Início"} size="small" sx={{ width: 150 }}
              placeholder="0:00"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              error={start !== "" && !startOk}
              helperText={"segundos ou M:SS"}
            />
            <TextField
              label={"Fim"} size="small" sx={{ width: 150 }}
              placeholder="0:30"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              error={end !== "" && (!endOk || tooShort)}
              helperText={tooShort ? "Intervalo ≥ 0.5s" : "segundos ou M:SS"}
            />
          </Stack>
        </Box>

        <Alert severity="info" sx={{ fontSize: "0.82rem" }}>
          Precisão de quadro (o clipe é recodificado, não ajustado por quadro-chave). A proporção
          de tela e o áudio da fonte são preservados. O fim é limitado à duração
          real do vídeo, então você pode ultrapassar com segurança.
        </Alert>
      </Stack>
    </ToolRunner>
  )
}
