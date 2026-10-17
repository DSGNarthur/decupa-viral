import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import ContentCutIcon from '@mui/icons-material/ContentCutOutlined'
import { Link } from 'react-router-dom'

export default function BrowserAdaptation({ name, children }) {
  if (import.meta.env.VITE_BROWSER_RUNTIME !== 'true') return children
  return <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 800 }}><Stack spacing={2}>
    <Typography variant="h4">{name}</Typography>
    <Alert severity="info">Este módulo ainda não está disponível no processamento pelo navegador.</Alert>
    <Typography>Você pode importar vídeos, criar cortes, editar legendas e exportar os arquivos neste dispositivo. Recursos de IA exigem uma chave em Configurações. Os arquivos ficam salvos neste navegador.</Typography>
    <Button component={Link} to="/editor" variant="contained" startIcon={<ContentCutIcon />}>Abrir editor de vídeos</Button>
  </Stack></Box>
}
