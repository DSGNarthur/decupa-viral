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
        Arthur (DSGNarthur) mantém a distribuição Decupa Viral, a interface em português
        e a integração do editor. Consulte as versões disponíveis para seu sistema na página de downloads.
        {import.meta.env.VITE_BROWSER_RUNTIME === 'true' ? 'Nesta versão experimental, os vídeos e rascunhos são processados e salvos no navegador. Mantenha a página aberta durante as tarefas.' : 'Mantenha o motor em segundo plano ativo durante as tarefas.'}
      </Typography>
      <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
        <Button component="a" href="/source-code.zip" download variant="contained">
          Baixar código-fonte desta versão
        </Button>
        <Button component="a" href="/LICENSE.txt" target="_blank" rel="noreferrer" variant="outlined">
          Ler a licença AGPL-3.0
        </Button>
      </Stack>
      <Typography paragraph sx={{ mt: 3 }}>
        O editor de cortes e o acompanhamento de rostos incluem módulos adaptados do Supoclip,
        revisão c6107654, sob AGPL-3.0. Os avisos dos autores e a licença do modelo YuNet
        acompanham o código correspondente. <Link href="https://github.com/FujiwaraChoki/supoclip" target="_blank" rel="noreferrer">Supoclip no GitHub</Link>.
      </Typography>
      <Typography sx={{ mt: 3 }}>
        Código do Decupa: <Link href="https://github.com/DSGNarthur/decupa-viral" target="_blank" rel="noreferrer">DSGNarthur/decupa-viral</Link>.
        {' '}
        Projeto original: <Link href="https://github.com/openclaw-easy/ViralMint" target="_blank" rel="noreferrer">ViralMint no GitHub</Link>.
        O arquivo de código-fonte contém as instruções de execução e as alterações,
        sem chaves de API, bancos de dados ou arquivos de mídia pessoais.
      </Typography>
    </Box>
  )
}
