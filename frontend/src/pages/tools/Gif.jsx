import { useState } from "react"
import {
  Box, Typography, Stack, Slider, TextField,
} from "@mui/material"
import GifOutlinedIcon from "@mui/icons-material/GifOutlined"
import ToolRunner from "../../components/tools/ToolRunner"
import useDocumentTitle from "../../hooks/useDocumentTitle"

// Animated GIF export. Two-pass palette generation is server-side; the
// UI only exposes the four knobs that actually move file size + quality:
// fps, width, and optional trim window.

export default function ToolGif() {
  useDocumentTitle("Vídeo → GIF")
  const [fps, setFps] = useState(15)
  const [width, setWidth] = useState(540)
  const [startSeconds, setStartSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)

  return (
    <ToolRunner
      title={"Vídeo → GIF"}
      description={"Converta qualquer clipe de vídeo em um GIF animado com paleta otimizada"}
      icon={<GifOutlinedIcon fontSize="large" />}
      endpoint="/api/tools/gif"
      processLabel={"Criar GIF"}
      downloadLabel={"Baixar GIF"}
      fieldBuilder={() => ({
        fps, width,
        start_seconds: startSeconds,
        duration_seconds: durationSeconds,
      })}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
            Quadros por segundo , {fps}
          </Typography>
          <Slider
            value={fps}
            min={5} max={30} step={1}
            marks={[
              { value: 5, label: "5" }, { value: 15, label: "15" }, { value: 30, label: "30" },
            ]}
            onChange={(_, v) => setFps(v)}
            valueLabelDisplay="auto"
            size="small"
          />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            FPS mais alto = movimento mais suave + arquivos muito maiores. 15 é o ponto ideal para a maioria dos clipes.
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
            Largura , {width}px
          </Typography>
          <Slider
            value={width}
            min={240} max={1080} step={20}
            marks={[
              { value: 240, label: "240" }, { value: 540, label: "540" }, { value: 1080, label: "1080" },
            ]}
            onChange={(_, v) => setWidth(v)}
            valueLabelDisplay="auto"
            size="small"
          />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            A altura é dimensionada automaticamente para preservar a proporção.
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
            Corte (opcional , 0 significa vídeo inteiro, máx. 60s)
          </Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label={"Início (seg)"} type="number" size="small" sx={{ width: 130 }}
              value={startSeconds}
              onChange={(e) => setStartSeconds(Math.max(0, parseFloat(e.target.value) || 0))}
              slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
            />
            <TextField
              label={"Duração (seg)"} type="number" size="small" sx={{ width: 150 }}
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(Math.max(0, Math.min(60, parseFloat(e.target.value) || 0)))}
              slotProps={{ htmlInput: { min: 0, max: 60, step: 0.5 } }}
            />
          </Stack>
        </Box>
      </Stack>
    </ToolRunner>
  )
}
