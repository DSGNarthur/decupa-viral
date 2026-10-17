// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState } from "react"
import {
  Box, Typography, FormControl, InputLabel, Select, MenuItem, Stack,
} from "@mui/material"
import CompressOutlinedIcon from "@mui/icons-material/CompressOutlined"
import ToolRunner from "../../components/tools/ToolRunner"
import { useToolInput } from "../../components/tools/ToolInputContext"
import useDocumentTitle from "../../hooks/useDocumentTitle"

// Mirrors _COMPRESS_HEIGHTS / _COMPRESS_LEVELS in backend/core/tool_runners.py.
// The backend is the authority (it validates the Literal); these carry the
// human wording and the target height used for the "already smaller" hint.
const RESOLUTIONS = [
  { value: "original", label: "Original , mantém o tamanho da fonte", height: 0 },
  { value: "1280x720", label: "HD , 720p", height: 720 },
  { value: "854x480", label: "SD , 480p", height: 480 },
  { value: "640x360", label: "Baixa , 360p", height: 360 },
  { value: "426x240", label: "Mínima , 240p", height: 240 },
]

const LEVELS = [
  { value: "maximum", label: "Máxima , menor arquivo" },
  { value: "high", label: "Alta , bom equilíbrio" },
  { value: "medium", label: "Média , melhor qualidade" },
  { value: "low", label: "Baixa , alta qualidade" },
  { value: "minimal", label: "Mínima , melhor qualidade" },
]

// What the two dials will actually do to THIS file. Reads the real source
// dimensions off the loaded input (ToolInputContext) rather than guessing.
//
// Deliberately no predicted byte count: output size depends on how much
// motion the footage has, and a confident "≈ 4.2 MB" that lands at 11 MB is
// worse than no number at all.
function OutcomePreview({ resolution, level }) {
  const { width: srcW, height: srcH } = useToolInput()
  const target = RESOLUTIONS.find((r) => r.value === resolution)
  const known = srcW > 0 && srcH > 0

  if (!known) {
    return (
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        Adicione um vídeo para ver o que estas configurações farão com ele.
      </Typography>
    )
  }

  const wouldUpscale = target.height > 0 && target.height >= srcH
  const outH = wouldUpscale || !target.height ? srcH : target.height
  const outW = Math.round((srcW * outH) / srcH / 2) * 2

  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        <strong>Fonte</strong> {srcW} × {srcH} → <strong>saída</strong> {outW} × {outH}
      </Typography>
      {wouldUpscale && (
        <Typography variant="caption" sx={{ color: "warning.main" }}>
          Este vídeo já é menor que {target.label.split("—")[1]?.trim() || resolution}.
          Ele manterá seu tamanho , aumentar a escala só deixaria o arquivo maior.
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {level === "maximum"
          ? "A compressão máxima aperta mais forte , espere suavização visível em imagens detalhadas."
          : level === "minimal"
            ? "A compressão mínima quase não afeta a qualidade, então a economia é modesta."
            : "A qualidade se mantém bem neste nível para a maioria das imagens."}
      </Typography>
    </Stack>
  )
}

export default function ToolCompress() {
  useDocumentTitle("Comprimir Vídeo")
  const [resolution, setResolution] = useState("original")
  const [level, setLevel] = useState("high")

  return (
    <ToolRunner
      title={"Comprimir Vídeo"}
      description={"Reduza um vídeo para email, apps de mensagem ou um limite de upload, sem recortá-lo novamente."}
      icon={<CompressOutlinedIcon fontSize="large" />}
      endpoint="/api/tools/compress"
      processLabel={"Comprimir"}
      downloadLabel={"Baixar comprimido"}
      fieldBuilder={() => ({ resolution, level })}
      costNote={
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Roda localmente com FFmpeg , o arquivo nunca sai da sua máquina.
          Resolução e intensidade são independentes: reduza a resolução quando o
          vídeo for assistido em tamanho pequeno, aumente a intensidade quando ele só precisar
          caber dentro de um limite. Imagens que já foram comprimidas uma vez não
          reduzirão muito mais.
        </Typography>
      }
    >
      <Stack spacing={2}>
        <FormControl size="small" fullWidth>
          <InputLabel>Resolução</InputLabel>
          <Select
            value={resolution}
            label={"Resolução"}
            onChange={(e) => setResolution(e.target.value)}
          >
            {RESOLUTIONS.map((r) => (
              <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" fullWidth>
          <InputLabel>Nível de compressão</InputLabel>
          <Select
            value={level}
            label={"Nível de compressão"}
            onChange={(e) => setLevel(e.target.value)}
          >
            {LEVELS.map((l) => (
              <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box>
          <OutcomePreview resolution={resolution} level={level} />
        </Box>
      </Stack>
    </ToolRunner>
  )
}
