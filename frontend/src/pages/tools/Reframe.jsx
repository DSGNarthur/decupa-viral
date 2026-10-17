import { Typography } from "@mui/material"
import AspectRatioOutlinedIcon from "@mui/icons-material/AspectRatioOutlined"
import ToolRunner from "../../components/tools/ToolRunner"
import useDocumentTitle from "../../hooks/useDocumentTitle"

export default function ToolReframe() {
  useDocumentTitle("Reenquadrar para Vertical")
  return (
    <ToolRunner
      title={"Reenquadrar para Vertical"}
      description={"Converta vídeos horizontais para vertical com fundo desfocado"}
      icon={<AspectRatioOutlinedIcon fontSize="large" />}
      endpoint="/api/tools/reframe"
    >
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Encaixa o quadro inteiro em 9:16 sobre uma cópia desfocada e ampliada de si mesmo ,
        nada é cortado. Fontes que já estão em 9:16 ou mais estreitas são
        retornadas sem alteração; clipes quadrados e 4:5 são reenquadrados.
      </Typography>
    </ToolRunner>
  )
}
