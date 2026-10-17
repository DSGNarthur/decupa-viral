import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { loopbackPermission } from '../companion/session'

export default function CompanionConnect({ error, onConnect }) {
  const [permission, setPermission] = useState('unknown')
  useEffect(() => { let active = true; loopbackPermission().then(state => { if (active) setPermission(state) }); return () => { active = false } }, [])
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: 'background.default' }}>
    <Stack spacing={2.5} sx={{ maxWidth: 640 }}>
      <Typography variant="h3" sx={{ fontWeight: 700 }}>Decupa Viral</Typography>
      <Typography variant="h5">Conecte o processador deste PC</Typography>
      <Typography>A interface está na Vercel do Arthur. O aplicativo instalado neste computador executa os motores originais do ViralMint: downloads, transcrição, cortes, renderização e os demais módulos. Mantenha o PC ligado durante o processamento.</Typography>
      {error && <Alert severity="warning">{error}</Alert>}
      {permission === 'granted' && <Alert severity="success">O Chrome permite acesso aos aplicativos deste computador.</Alert>}
      {permission === 'denied' && <Alert severity="warning">O Chrome bloqueou esse acesso. Nas permissões deste site, permita o acesso aos aplicativos deste computador.</Alert>}
      <Typography>Abra o aplicativo local e clique em "Abrir na Vercel" para parear esta aba. Depois clique em "Conectar PC" e permita o acesso aos aplicativos deste computador quando o Chrome solicitar. A conexão funciona neste mesmo PC; acesso pelo celular precisa de uma conexão remota própria.</Typography>
      <Button onClick={onConnect} variant="contained">Conectar PC</Button>
      <Button component="a" href="http://localhost:16889/">Abrir aplicativo neste PC</Button>
      <Typography variant="caption">Os arquivos e a chave do DeepSeek permanecem no aplicativo do PC. Serviços externos continuam exigindo suas configurações e credenciais. A cópia deriva do ViralMint 1.3.1, sob licença AGPL-3.0.</Typography>
      <Button component="a" href="/source-code.zip" download>Código-fonte e licença</Button>
    </Stack>
  </Box>
}
