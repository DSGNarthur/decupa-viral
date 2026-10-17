import { Box, Typography, Stack, Button, Link } from "@mui/material"
import useDocumentTitle from "../hooks/useDocumentTitle"

export default function About() {
  useDocumentTitle("Sobre")
  return (
    <Box sx={{ p: 4, maxWidth: 820 }}>
      <Typography variant="h4" gutterBottom>Sobre o Decupa Viral</Typography>
      <Typography paragraph>
        O Decupa Viral deriva do ViralMint 1.3.1, desenvolvido pelos
        ViralMint Contributors. O código original e as modificações desta versão
        são disponibilizados sob a licença GNU AGPL versão 3.
      </Typography>
      <Typography paragraph>
        As alterações iniciadas em 16/10/2026 incluem a identidade Decupa Viral,
        a tradução para português e a conexão da interface publicada aos motores
        originais instalados no PC. O processamento e a biblioteca ficam no computador.
        Mantenha o aplicativo local aberto durante as tarefas.
      </Typography>
      <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
        <Button component="a" href="/source-code.zip" download variant="contained">
          Baixar código-fonte desta versão
        </Button>
        <Button component="a" href="/LICENSE.txt" target="_blank" rel="noreferrer" variant="outlined">
          Ler a licença AGPL-3.0
        </Button>
      </Stack>
      <Typography sx={{ mt: 3 }}>
        Projeto original: <Link href="https://github.com/openclaw-easy/ViralMint" target="_blank" rel="noreferrer">ViralMint no GitHub</Link>.
        O arquivo de código-fonte contém as instruções de execução e as alterações,
        sem chaves de API, bancos de dados ou arquivos de mídia pessoais.
      </Typography>
    </Box>
  )
}
