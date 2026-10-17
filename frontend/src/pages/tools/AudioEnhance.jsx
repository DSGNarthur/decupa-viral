import { Typography } from "@mui/material"
import GraphicEqOutlinedIcon from "@mui/icons-material/GraphicEqOutlined"
import ToolRunner from "../../components/tools/ToolRunner"
import useDocumentTitle from "../../hooks/useDocumentTitle"
import { MEDIA_ACCEPT } from "../../components/tools/mediaAccept"

export default function ToolAudioEnhance() {
  useDocumentTitle("Melhorar Áudio")
  return (
    <ToolRunner
      title={"Melhorar Áudio"}
      description={"Remova chiados, normalize o volume, refine a fala"}
      icon={<GraphicEqOutlinedIcon fontSize="large" />}
      endpoint="/api/tools/audio-enhance"
      acceptExts={MEDIA_ACCEPT}
    >
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Aplica redução de ruído, filtro high-pass / low-pass para graves e
        chiados, e normalização de volume EBU R128 para -16 LUFS. Aceita um vídeo ou
        um arquivo de áudio puro (áudio na entrada, mp3 na saída). Sem configuração necessária , os
        padrões funcionam para 99% de conteúdo de talking-head.
      </Typography>
    </ToolRunner>
  )
}
