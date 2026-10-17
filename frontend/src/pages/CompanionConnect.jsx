import { Alert, Box, Button, Stack, Typography, Paper } from '@mui/material'
import { Download, PowerSettingsNew, Sync, MenuBook } from '@mui/icons-material'
import { useEffect, useState } from 'react'
import { loopbackPermission } from '../companion/session'

const RELEASE = 'https://github.com/DSGNarthur/decupa-viral/releases/latest'
export default function CompanionConnect({ error, onConnect }) {
  const [permission, setPermission] = useState('unknown')
  useEffect(() => { let active = true; loopbackPermission().then(state => { if (active) setPermission(state) }); return () => { active = false } }, [])
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: { xs: 2, md: 5 }, bgcolor: 'background.default' }}>
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 720, '@keyframes arrive': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'none' } }, animation: 'arrive .5s ease both', '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}>
      <Box component="img" src="/decupa-logo.png" alt="Decupa" sx={{ width: 160, borderRadius: 2 }} />
      <Box><Typography variant="h3" fontWeight={700}>Seu estúdio de cortes</Typography><Typography color="text.secondary" mt={1}>YouTube, editor e exportação em Full HD com o processamento no seu computador.</Typography></Box>
      {error && <Alert severity="warning">{error}</Alert>}
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4 }}>
        <Stack spacing={2.5}>
          <Typography variant="h6">Instale uma vez. Depois, abra o site.</Typography>
          <Typography color="text.secondary">O motor inicia com sua sessão do sistema. Seus vídeos e configurações ficam neste computador. Durante a edição e a exportação, mantenha-o ligado.</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} flexWrap="wrap">
            <Button variant="outlined" startIcon={<Download />} href={RELEASE} target="_blank" rel="noopener noreferrer">Baixar motor</Button>
            <Button startIcon={<MenuBook />} href="https://github.com/DSGNarthur/decupa-viral/blob/codex/decupa-desktop/docs/INSTALACAO.md" target="_blank" rel="noopener noreferrer">Guia de instalação</Button>
          </Stack>
          <Typography>Depois de instalar, clique em Conectar e permita o acesso aos aplicativos deste computador quando o navegador solicitar. Nas próximas visitas, a conexão será automática enquanto o motor estiver ativo.</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
            <Button onClick={onConnect} variant="contained" startIcon={<Sync />}>Conectar</Button>
            <Button component="a" href="decupaviral://start" startIcon={<PowerSettingsNew />}>Iniciar motor</Button>
          </Stack>
          {permission === 'granted' && <Alert severity="success">O navegador permite o acesso ao motor local.</Alert>}
          {permission === 'denied' && <Alert severity="warning">Permita o acesso à rede local nas configurações deste site e conecte novamente.</Alert>}
        </Stack>
      </Paper>
      <Typography variant="caption" color="text.secondary">Decupa Viral por Arthur, baseado no código aberto do ViralMint, com editor integrado a partir do Supoclip. Licença AGPL-3.0. Recursos de IA e integrações externas exigem suas próprias chaves e contas. A conexão local funciona no computador que tem o motor instalado.</Typography>
      <Button component="a" href="/source-code.zip" download>Código-fonte e licenças</Button>
    </Stack>
  </Box>
}
