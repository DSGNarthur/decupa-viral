import { Typography } from "@mui/material"
import FastRewindOutlinedIcon from "@mui/icons-material/FastRewindOutlined"
import ToolRunner from "../../components/tools/ToolRunner"
import useDocumentTitle from "../../hooks/useDocumentTitle"
import { MEDIA_ACCEPT } from "../../components/tools/mediaAccept"

export default function ToolRemoveSilence() {
  useDocumentTitle("Removedor de Silêncio")
  return (
    <ToolRunner
      title={"Removedor de Silêncio"}
      description={"Corta automaticamente pausas, muletas e silêncios"}
      icon={<FastRewindOutlinedIcon fontSize="large" />}
      endpoint="/api/tools/remove-silence"
      acceptExts={MEDIA_ACCEPT}
    >
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Detecta intervalos silenciosos (mais baixos que -35 dB por mais de 0,6 s) e os corta,
        depois recodifica os trechos mantidos em um único arquivo contínuo. Aceita um
        vídeo ou um arquivo de áudio puro , um podcast volta como mp3. Funciona melhor em
        conteúdo de talking-head com fala limpa; uma fonte sem silêncio detectável
        é retornada sem alteração.
      </Typography>
    </ToolRunner>
  )
}
