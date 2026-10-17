import { useState } from "react"
import { Box, Typography, Stack, Slider, Alert } from "@mui/material"
import ZoomInMapOutlinedIcon from "@mui/icons-material/ZoomInMapOutlined"
import ToolRunner from "../../components/tools/ToolRunner"
import useDocumentTitle from "../../hooks/useDocumentTitle"

// Auto-Zoom / Punch-in — subtle zoom pulses on spoken words for energy.
// Whisper word timings drive the pulses; the shared apply_auto_zoom FFmpeg
// helper does the work. Works standalone; pairs well right after Captions.

const INTENSITY = [
  { v: 1.08, label: "Sutil" },
  { v: 1.15, label: "Padrão" },
  { v: 1.25, label: "Impactante" },
  { v: 1.4, label: "Máximo" },
]

export default function ToolAutoZoom() {
  useDocumentTitle("Auto-Zoom")
  const [zoom, setZoom] = useState(1.15)
  const [wordsPerGroup, setWordsPerGroup] = useState(3)

  return (
    <ToolRunner
      title={"Auto-Zoom"}
      description={"Adicione zoom sutil nas palavras faladas para dar mais energia"}
      icon={<ZoomInMapOutlinedIcon fontSize="large" />}
      endpoint="/api/tools/auto-zoom"
      processLabel={"Adicionar pulsos de zoom"}
      fieldBuilder={() => ({ zoom_factor: zoom, words_per_group: wordsPerGroup })}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
            Intensidade do zoom , <strong>{Math.round((zoom - 1) * 100)}%</strong>
          </Typography>
          <Slider
            value={zoom}
            min={1.05} max={1.4} step={0.01}
            marks={INTENSITY.map((i) => ({ value: i.v, label: i.label }))}
            onChange={(_, v) => setZoom(v)}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${Math.round((v - 1) * 100)}%`}
            size="small"
          />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            O quanto cada pulso amplia. 15% é o ponto ideal , mantenha sutil para transmitir energia, não enjoo de movimento.
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
            Palavras por pulso , <strong>{wordsPerGroup}</strong>
          </Typography>
          <Slider
            value={wordsPerGroup}
            min={1} max={6} step={1}
            marks={[{ value: 1, label: "1" }, { value: 3, label: "3" }, { value: 6, label: "6" }]}
            onChange={(_, v) => setWordsPerGroup(v)}
            valueLabelDisplay="auto"
            size="small"
          />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Pulse uma vez a cada N palavras faladas. Combine isso com o agrupamento das suas legendas para um efeito sincronizado.
          </Typography>
        </Box>

        <Alert severity="info" sx={{ fontSize: "0.82rem" }}>
          Precisa de fala clara (as marcações de tempo das palavras guiam os pulsos). Um clipe sem
          fala detectável é retornado sem alterações. Execute isto{" "}
          <strong>depois</strong> Adicione Legendas para uma combinação sincronizada de legenda + zoom.
        </Alert>
      </Stack>
    </ToolRunner>
  )
}
