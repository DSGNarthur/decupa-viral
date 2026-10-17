import { useEffect, useState } from 'react'
import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material'
import http from '../api/http'
const pendingKey = 'decupa-viral-device-check-pending'
async function waitJob(id, status) {
  const end = Date.now() + 20 * 60 * 1000
  while (Date.now() < end) {
    const { data } = await http.get(`/api/jobs/${id}`)
    status({ text: data.current_step, percent: data.progress_pct || 0 })
    if (data.status === 'success') return JSON.parse(data.output_json || '{}')
    if (['failed', 'cancelled'].includes(data.status)) throw new Error(data.error_message || 'O teste foi interrompido.')
    await new Promise(resolve => setTimeout(resolve, 700))
  }
  throw new Error('O teste demorou além de 20 minutos neste dispositivo.')
}
export default function DeviceCheck() {
  const [status, setStatus] = useState(null), [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    const pending = sessionStorage.getItem(pendingKey)
    if (!pending) return
    sessionStorage.removeItem(pendingKey)
    const verify = async () => {
      try {
        const report = JSON.parse(pending), { data: clip } = await http.get(`/api/videos/${report.clip_id}`)
        const response = await fetch(`/api/videos/${report.clip_id}/stream`)
        if (!clip.file_exists || !response.ok || !(await response.blob()).size) throw new Error('O resultado não foi recuperado após recarregar.')
        report.steps.push('persistência após recarregar'); report.ok = true
        setResult(report); setStatus({ text: 'Exportação e persistência verificadas neste navegador.', percent: 100 })
      } catch (e) { setError(e.message) }
    }
    verify()
  }, [])
  const run = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    setBusy(true); setError(''); setResult(null)
    try {
      setStatus({ text: 'Importando o vídeo escolhido...', percent: 1 })
      const form = new FormData(); form.append('file', file)
      const { data: source } = await http.post('/api/downloaded/import', form, { timeout: 0 })
      const { data: draft } = await http.post(`/api/editor/prepare/${source.id}`)
      const doc = draft.document, duration = Math.min(3, draft.duration)
      doc.segments = [{ id: crypto.randomUUID(), start: 0, end: duration }]
      doc.framing.aspect = 'vertical'; doc.captions.enabled = false
      const { data: saved } = await http.put(`/api/editor/drafts/${draft.id}`, { revision: draft.revision, document: doc })
      const { data: job } = await http.post(`/api/editor/drafts/${draft.id}/export`, { revision: saved.revision, document: saved.document })
      const output = await waitJob(job.job_id, setStatus), { data: clip } = await http.get(`/api/videos/${output.video_id}`)
      if (Math.abs(clip.duration_seconds - duration) > .2 || clip.video_width !== 720 || clip.video_height !== 1280) throw new Error('A exportação não corresponde ao trecho de teste.')
      sessionStorage.setItem(pendingKey, JSON.stringify({ clip_id: clip.id, duration: clip.duration_seconds, width: clip.video_width, height: clip.video_height, steps: ['importação', 'rascunho salvo', 'exportação no navegador'] }))
      window.location.reload()
    } catch (e) { setError(e.response?.data?.detail || e.message) }
    finally { setBusy(false) }
  }
  return <Box sx={{ p: 3, maxWidth: 800 }}><Stack spacing={2}>
    <Typography variant="h4">Verificar este dispositivo</Typography>
    <Typography>Escolha um vídeo pequeno. O teste exporta até três segundos em formato vertical, salva o resultado e recarrega a página para conferir a recuperação do arquivo. Não exige IA, instalação ou conexão ao aplicativo local.</Typography>
    <Button component="label" disabled={busy} variant="contained">{busy ? 'Testando neste navegador...' : 'Escolher vídeo para testar'}<input type="file" accept="video/*" hidden disabled={busy} onChange={run} /></Button>
    {status && <><LinearProgress variant="determinate" value={status.percent} /><Typography role="status">{status.text}</Typography></>}
    {error && <Alert severity="error">{error}</Alert>}
    {result?.ok && <><Alert severity="success">Arquivo exportado e recuperado após recarregar: {result.width} × {result.height}, {result.duration.toFixed(2)} segundos. Reproduza para conferir o conteúdo.</Alert><Box component="video" src={`/api/videos/${result.clip_id}/stream`} controls playsInline sx={{ maxHeight: 480, maxWidth: '100%', bgcolor: '#000' }} /><Button component="a" href={`/api/videos/${result.clip_id}/stream?download=1`} download>Baixar vídeo do teste</Button></>}
  </Stack></Box>
}
