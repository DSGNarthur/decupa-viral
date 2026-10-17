import { useEffect, useState } from 'react'
import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material'
import http from '../api/http'
const pendingKey = 'decupa-viral-device-check-pending'

const waitJob = async (id, setStatus) => {
  const deadline = Date.now() + 20 * 60 * 1000
  while (Date.now() < deadline) {
    const { data } = await http.get(`/api/jobs/${id}`)
    setStatus({ text: data.current_step, percent: data.progress_pct || 0 })
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
      let report
      try {
        report = JSON.parse(pending)
        const { data: clip } = await http.get(`/api/videos/${report.clip_id}`)
        const response = await fetch(`/api/videos/${report.clip_id}/stream`)
        if (!clip.file_exists || !response.ok || !(await response.blob()).size) throw new Error('O arquivo exportado não foi recuperado após recarregar a página.')
        report.steps.push('persistência após recarregar')
        report.finished_at = new Date().toISOString(); report.ok = true
        setResult(report); setStatus({ text: 'Exportação e persistência verificadas neste dispositivo.', percent: 100 })
      } catch (e) { setError(e.message); setResult({ ...report, ok: false, error: e.message }) }
    }
    verify()
  }, [])
  const run = async () => {
    setBusy(true); setError(''); setResult(null)
    const report = { started_at: new Date().toISOString(), user_agent: navigator.userAgent, steps: [] }
    try {
      setStatus({ text: 'Preparando o vídeo de teste…', percent: 1 })
      const response = await fetch('/validation-speech.mp4')
      if (!response.ok) throw new Error('O vídeo de teste não está disponível nesta publicação.')
      const file = new File([await response.blob()], 'teste-de-fala.mp4', { type: 'video/mp4' })
      const form = new FormData(); form.append('file', file); form.append('title', 'Teste deste dispositivo')
      const { data: source } = await http.post('/api/downloaded/import', form)
      report.source_id = source.id; report.steps.push('importação')
      await waitJob(source.job_id, setStatus); report.steps.push('transcrição')
      const { data: cut } = await http.post(`/api/downloaded/${source.id}/extract-clips`, { mode: 'manual', time_ranges: [{ start: 0, end: 3 }], force_vertical: true, caption_style: 'viral', emoji_style: 'none' })
      const output = await waitJob(cut.job_id, setStatus)
      report.clip_id = output.clip_ids[0]
      const { data: clip } = await http.get(`/api/videos/${report.clip_id}`)
      if (Math.abs(clip.duration_seconds - 3) > 0.2 || clip.video_width >= clip.video_height) throw new Error('O resultado não corresponde ao corte vertical de três segundos.')
      report.steps.push('corte vertical', 'exportação', 'leitura da biblioteca')
      report.duration = clip.duration_seconds; report.width = clip.video_width; report.height = clip.video_height
      report.caption_verification = 'Conferir visualmente no vídeo abaixo.'
      sessionStorage.setItem(pendingKey, JSON.stringify(report))
      window.location.reload()
    } catch (e) { report.ok = false; report.error = e.message; setError(e.message); setResult(report) }
    finally { setBusy(false) }
  }
  const save = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'teste-decupa-viral.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <Box sx={{ p: 3, maxWidth: 800 }}><Stack spacing={2}>
    <Typography variant="h4">Verificar este dispositivo</Typography>
    <Typography>Este teste importa um pequeno vídeo de fala, transcreve e exporta um corte vertical com legendas no próprio aparelho. Depois recarrega esta página para verificar se o arquivo continua salvo. Na primeira vez, baixa o modelo de transcrição. Mantenha a página aberta.</Typography>
    <Button onClick={run} disabled={busy || import.meta.env.VITE_BROWSER_RUNTIME !== 'true'} variant="contained">{busy ? 'Testando neste aparelho…' : 'Testar importação e exportação'}</Button>
    {status && <><LinearProgress variant="determinate" value={status.percent} /><Typography>{status.text}</Typography></>}
    {error && <Alert severity="error">{error}</Alert>}
    {result?.ok && <><Alert severity="success">Corte exportado e recuperado após recarregar: {result.width} × {result.height}, {result.duration.toFixed(2)} segundos. Reproduza para conferir áudio e legendas.</Alert><Box component="video" src={`/api/videos/${result.clip_id}/stream`} controls playsInline sx={{ maxHeight: 480, maxWidth: '100%', bgcolor: '#000' }} /><Button component="a" href={`/api/videos/${result.clip_id}/download`}>Baixar vídeo do teste</Button></>}
    {result && <Button onClick={save}>Baixar resultado do teste</Button>}
  </Stack></Box>
}
