import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, Checkbox, CircularProgress, IconButton, LinearProgress,
  MenuItem, Paper, Slider, Stack, Switch, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ContentCutIcon from '@mui/icons-material/ContentCutOutlined'
import SaveIcon from '@mui/icons-material/SaveOutlined'
import DownloadIcon from '@mui/icons-material/DownloadOutlined'
import UndoIcon from '@mui/icons-material/UndoRounded'
import RedoIcon from '@mui/icons-material/RedoRounded'
import DeleteIcon from '@mui/icons-material/DeleteOutline'
import LeftIcon from '@mui/icons-material/ChevronLeft'
import RightIcon from '@mui/icons-material/ChevronRight'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import PauseIcon from '@mui/icons-material/PauseRounded'
import SubtitlesIcon from '@mui/icons-material/SubtitlesOutlined'
import CropIcon from '@mui/icons-material/CropFreeOutlined'
import VolumeIcon from '@mui/icons-material/VolumeUpOutlined'
import TuneIcon from '@mui/icons-material/Tune'
import http from '../api/http'
import useAppStore from '../store/appStore'
import { pulseGlowWarm } from '../utils/glassFx'
import { clone, durationOf, formatTime, moveSegment, splitDocument, wordsAt } from '../editor/document'

const detail = error => {
  const value = error.response?.data?.detail || error.message
  return Array.isArray(value) ? value.map(item => item.msg || String(item)).join('; ') : String(value)
}
const uid = () => crypto.randomUUID()

export default function ClipEditor() {
  const [params, setParams] = useSearchParams(), navigate = useNavigate()
  const [draft, setDraft] = useState(null), [document, setDocument] = useState(null)
  const [drafts, setDrafts] = useState([]), [loading, setLoading] = useState(true)
  const [combineIds, setCombineIds] = useState([]), [combineJob, setCombineJob] = useState(null)
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState(true), [tab, setTab] = useState(0)
  const [time, setTime] = useState(0), [selected, setSelected] = useState(''), [playing, setPlaying] = useState(false)
  const [history, setHistory] = useState([]), [future, setFuture] = useState([]), [wordPage, setWordPage] = useState(0)
  const [job, setJob] = useState(null), [exporting, setExporting] = useState(false)
  const docRef = useRef(null), draftRef = useRef(null), persisted = useRef(''), savePending = useRef(null)
  const video = useRef(null), activeSegment = useRef(0)
  const notify = useAppStore(s => s.showSnackbar)
  const clipId = params.get('clip'), draftId = params.get('draft')

  const load = useCallback(async () => {
    setLoading(true); setError(''); setConflict(false)
    try {
      let data
      if (draftId) ({ data } = await http.get(`/api/editor/drafts/${draftId}`))
      else if (clipId) ({ data } = await http.post(`/api/editor/prepare/${clipId}`, {}, { timeout: 300000 }))
      else { const response = await http.get('/api/editor/drafts'); setDrafts(response.data.drafts); setDraft(null); setDocument(null); return }
      draftRef.current = data; docRef.current = data.document; persisted.current = JSON.stringify(data.document)
      setDraft(data); setDocument(data.document); setSaved(true); setSelected(data.document.segments[0].id)
      setTime(data.document.segments[0].start); setHistory([]); setFuture([]); setWordPage(0)
      // Restore exports after refresh from the same persisted job feed used
      // by the global Activity panel. No second render is started.
      try {
        const response = await http.get('/api/jobs?job_type=editor_export&limit=200')
        const latest = response.data.jobs.find(item => {
          try { return JSON.parse(item.input_json || '{}').draft_id === data.id } catch { return false }
        })
        setJob(latest || null)
      } catch { /* Draft editing remains available when activity lookup fails. */ }
      if (!draftId) setParams({ draft: data.id }, { replace: true })
    } catch (e) { setError(detail(e)) }
    finally { setLoading(false) }
  }, [clipId, draftId, setParams])
  useEffect(() => { load() }, [load])

  const save = useCallback(async () => {
    if (savePending.current) await savePending.current
    const current = docRef.current, target = draftRef.current
    if (!current || !target) return null
    const snapshot = JSON.stringify(current)
    if (snapshot === persisted.current) return target
    setSaving(true)
    const request = http.put(`/api/editor/drafts/${target.id}`, { revision: target.revision, document: current })
      .then(({ data }) => {
        draftRef.current = data; setDraft(data); persisted.current = snapshot
        setSaved(JSON.stringify(docRef.current) === snapshot)
        return data
      }).catch(e => { if (e.response?.status === 409) setConflict(true); setError(detail(e)); throw e })
      .finally(() => { savePending.current = null; setSaving(false) })
    savePending.current = request
    return request
  }, [])
  useEffect(() => {
    if (!document || conflict || loading || JSON.stringify(document) === persisted.current) return
    const timer = setTimeout(() => { save().catch(() => {}) }, 1000)
    return () => clearTimeout(timer)
  }, [document, conflict, loading, save])
  useEffect(() => {
    const warn = e => { if (docRef.current && JSON.stringify(docRef.current) !== persisted.current) { e.preventDefault(); e.returnValue = '' } }
    const preserveBeforeNavigation = e => {
      const link = e.target.closest?.('a[href]')
      if (!link || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || link.target === '_blank' || link.hasAttribute('download')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname.startsWith('/api/') || !docRef.current || JSON.stringify(docRef.current) === persisted.current) return
      e.preventDefault(); e.stopPropagation()
      save().then(() => navigate(url.pathname + url.search)).catch(() => {})
    }
    window.addEventListener('beforeunload', warn)
    window.document.addEventListener('click', preserveBeforeNavigation, true)
    return () => { window.removeEventListener('beforeunload', warn); window.document.removeEventListener('click', preserveBeforeNavigation, true) }
  }, [save, navigate])
  const change = useCallback(next => {
    const current = docRef.current
    if (!current) return
    const updated = typeof next === 'function' ? next(clone(current)) : next
    setHistory(h => [...h.slice(-19), clone(current)]); setFuture([])
    docRef.current = updated; setDocument(updated); setSaved(false); setError('')
  }, [])
  const setSection = (section, key, value) => change(d => { d[section][key] = value; return d })
  const seek = (segment, offset = segment.start) => {
    const index = docRef.current.segments.findIndex(s => s.id === segment.id)
    activeSegment.current = Math.max(0, index); setSelected(segment.id); setTime(offset)
    if (video.current) video.current.currentTime = offset
  }
  const rewind = (back = false) => {
    const source = back ? future : history
    if (!source.length) return
    const value = source.at(-1)
    if (back) { setFuture(h => h.slice(0, -1)); setHistory(h => [...h, clone(docRef.current)]) }
    else { setHistory(h => h.slice(0, -1)); setFuture(h => [...h, clone(docRef.current)]) }
    docRef.current = clone(value); setDocument(clone(value)); setSaved(false)
    const first = value.segments[0]; setSelected(first.id); activeSegment.current = 0
    if (video.current) video.current.currentTime = first.start
  }
  useEffect(() => { if (video.current && document) { video.current.volume = Math.min(1, document.volume); video.current.muted = document.muted } }, [document?.volume, document?.muted])
  useEffect(() => {
    if (!job?.id || !['pending', 'running'].includes(job.status)) return
    const timer = setInterval(async () => {
      try {
        const { data } = await http.get(`/api/jobs/${job.id}`)
        setJob(data)
        if (data.status === 'failed') setError(data.error_message || 'Falha na exportação.')
        if (data.status === 'success') notify('Edição exportada para a biblioteca.', 'success')
      } catch (e) { setError(detail(e)) }
    }, 1200)
    return () => clearInterval(timer)
  }, [job?.id, job?.status, notify])
  const exportVideo = async () => {
    setExporting(true); setError('')
    try {
      const current = await save()
      const { data } = await http.post(`/api/editor/drafts/${current.id}/export`, { revision: current.revision, document: current.document })
      setJob({ id: data.job_id, status: 'pending', progress_pct: 0 })
    } catch (e) { setError(detail(e)) }
    finally { setExporting(false) }
  }
  const leave = async () => { try { await save(); navigate('/clips') } catch { /* Keep unsaved edits visible. */ } }
  const cancel = async () => {
    try { await http.delete(`/api/jobs/${job.id}`); setJob(j => ({ ...j, status: 'cancelled' })) }
    catch (e) { setError(detail(e)) }
  }
  const deleteDraft = async id => {
    if (!window.confirm('Excluir este rascunho? Os vídeos exportados permanecerão na biblioteca.')) return
    try { await http.delete(`/api/editor/drafts/${id}`); await load() } catch (e) { setError(detail(e)) }
  }
  const combineDrafts = async () => {
    try {
      const { data } = await http.post('/api/editor/combine', { draft_ids: combineIds })
      setCombineJob({ id: data.job_id, status: 'pending', progress_pct: 0 })
    } catch (e) { setError(detail(e)) }
  }
  useEffect(() => {
    if (!combineJob?.id || !['pending', 'running'].includes(combineJob.status)) return
    const timer = setInterval(async () => {
      try {
        const { data } = await http.get(`/api/jobs/${combineJob.id}`)
        setCombineJob(data)
        if (data.status === 'failed') setError(data.error_message)
        if (data.status === 'success') setParams({ draft: JSON.parse(data.output_json).draft_id })
      } catch (e) { setError(detail(e)) }
    }, 1200)
    return () => clearInterval(timer)
  }, [combineJob?.id, combineJob?.status, setParams])

  if (loading) return <Stack role="status" alignItems="center" spacing={2} sx={{ p: 6 }}><CircularProgress /><Typography>Preparando a fonte limpa e o rascunho...</Typography></Stack>
  if (!document) return <Box sx={{ p: { xs: 2, md: 4 } }}><Typography variant="h4">Editor de cortes</Typography><Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Continue um rascunho ou abra um corte no estúdio.</Typography>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<Stack direction="row" gap={1} flexWrap="wrap"><Button onClick={() => navigate('/clips')} startIcon={<ContentCutIcon />}>Abrir estúdio de cortes</Button><Button variant="contained" onClick={combineDrafts} disabled={combineIds.length < 2 || ['pending', 'running'].includes(combineJob?.status)}>Juntar {combineIds.length || ''} rascunhos</Button></Stack>{combineJob && <Box sx={{ mt: 2 }}><Typography role="status">{combineJob.current_step || 'Preparando montagem no PC'}</Typography><LinearProgress variant="determinate" value={combineJob.progress_pct || 0} /></Box>}<Stack spacing={1.5} sx={{ mt: 3 }}>{drafts.map(d => <Paper key={d.id} variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}><Checkbox checked={combineIds.includes(d.id)} disabled={combineIds.length >= 8 && !combineIds.includes(d.id)} onChange={e => setCombineIds(ids => e.target.checked ? [...ids, d.id] : ids.filter(id => id !== d.id))} slotProps={{ input: { 'aria-label': `Selecionar ${d.title} para juntar` } }} /><Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={600}>{d.title}</Typography><Typography variant="caption" color="text.secondary">{formatTime(d.duration)} · Revisão {d.revision}</Typography></Box><Button onClick={() => setParams({ draft: d.id })}>Continuar</Button><IconButton aria-label="Excluir rascunho" onClick={() => deleteDraft(d.id)}><DeleteIcon /></IconButton></Paper>)}{!drafts.length && <Typography color="text.secondary">Seus rascunhos aparecerão aqui.</Typography>}</Stack></Box>
  const total = durationOf(document), active = document.segments.find(s => s.id === selected) || document.segments[0]
  const ratio = document.framing.aspect === 'vertical' ? 9 / 16 : document.framing.aspect === 'square' ? 1 : draft.width / draft.height
  const captionWords = wordsAt(document, time), busy = exporting || ['pending', 'running'].includes(job?.status)
  const wordList = document.words.slice(wordPage * 30, wordPage * 30 + 30)
  const slider = (label, value, min, max, step, onChange, suffix = '') => <Box sx={{ mt: 2 }}><Stack direction="row" justifyContent="space-between"><Typography variant="body2">{label}</Typography><Typography variant="caption" color="text.secondary">{Math.round(value * 100) / 100}{suffix}</Typography></Stack><Slider aria-label={label} min={min} max={max} step={step} value={value} onChange={(_, v) => onChange(v)} size="small" /></Box>
  return <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1600, mx: 'auto', width: '100%', animation: 'decupa-panel-in .35s ease' }}>
    <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" sx={{ mb: 2.5 }}><IconButton onClick={leave} aria-label="Voltar aos cortes"><ArrowBackIcon /></IconButton><Box sx={{ flex: 1, minWidth: 130 }}><Typography variant="h5">{draft.title}</Typography><Typography variant="caption" color="text.secondary" role="status">{saving ? 'Salvando...' : saved ? `Salvo no PC · revisão ${draft.revision}` : 'Alterações pendentes'}</Typography></Box><Button variant="outlined" startIcon={<SaveIcon />} disabled={saving || saved || conflict} onClick={() => save().catch(() => {})}>Salvar</Button><Button variant="contained" startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />} disabled={busy || conflict} onClick={exportVideo}>Exportar edição</Button></Stack>
    {error && <Alert severity="error" sx={{ mb: 2 }} action={conflict ? <Button color="inherit" onClick={load}>Recarregar</Button> : undefined}>{error}</Alert>}
    {draft.provenance.note && <Alert severity="info" sx={{ mb: 2 }}>{draft.provenance.note}</Alert>}
    {job && <Paper variant="outlined" sx={{ p: 2, mb: 2 }}><Stack direction="row" gap={1} justifyContent="space-between" alignItems="center"><Typography role="status">{job.status === 'success' ? 'Exportação concluída' : job.status === 'cancelled' ? 'Cancelamento solicitado' : job.current_step || 'Aguardando o motor local'}</Typography>{['pending', 'running'].includes(job.status) && <Button onClick={cancel}>Cancelar</Button>}{job.status === 'success' && <Button onClick={() => navigate(`/videos?open=g:${JSON.parse(job.output_json || '{}').video_id}`)}>Abrir na biblioteca</Button>}</Stack><LinearProgress variant="determinate" value={job.progress_pct || 0} sx={{ mt: 1, height: 5, borderRadius: 4 }} />{job.status === 'success' && <Button startIcon={<DownloadIcon />} component="a" href={`/api/videos/${JSON.parse(job.output_json || '{}').video_id}/stream?download=1`} download sx={{ mt: 1 }}>Baixar MP4</Button>}</Paper>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) 320px' }, gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 2, minWidth: 0, bgcolor: 'background.subtle' }}><Box sx={{ width: ratio < 1 ? 'min(100%, 250px)' : '100%', mx: 'auto', aspectRatio: String(ratio), position: 'relative', bgcolor: '#080808', overflow: 'hidden', borderRadius: 2 }}>
        <video ref={video} key={draft.id} src={`/api/editor/drafts/${draft.id}/stream`} preload="metadata" playsInline
          aria-label="Prévia do corte sem alterar o original" onLoadedMetadata={() => { if (video.current) video.current.currentTime = active.start }}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onTimeUpdate={() => {
            const element = video.current, d = docRef.current, index = Math.min(activeSegment.current, d.segments.length - 1), s = d.segments[index]
            if (!element) return
            setTime(element.currentTime)
            if (!element.paused && element.currentTime >= s.end - .03) {
              const next = d.segments[index + 1]
              if (next) { activeSegment.current = index + 1; setSelected(next.id); element.currentTime = next.start }
              else { element.pause(); element.currentTime = s.end }
            }
          }} style={{ width: '100%', height: '100%', display: 'block', objectFit: document.framing.fit, objectPosition: `${document.framing.x * 100}% ${document.framing.y * 100}%`, transform: `scale(${document.framing.zoom})`, filter: `brightness(${document.effects.brightness}%) contrast(${document.effects.contrast}%) saturate(${document.effects.saturation}%) blur(${document.effects.blur}px) hue-rotate(${document.effects.hue}deg)` }} />
        {document.captions.enabled && captionWords.length > 0 && <Box sx={{ position: 'absolute', top: `${document.captions.y * 100}%`, left: '5%', width: '90%', transform: 'translateY(-50%)', textAlign: 'center', pointerEvents: 'none', fontSize: `${document.captions.size / 1080 * (ratio < 1 ? 250 : 540)}px`, lineHeight: 1.2, color: document.captions.color, fontFamily: document.captions.font, textShadow: '0 1px 3px #000' }}><span style={{ background: document.captions.background ? '#111c' : 'transparent', padding: '2px 4px', borderRadius: 3 }}>{captionWords.map(w => <span key={w.id} style={{ color: w.highlight ? document.captions.accent : 'inherit' }}>{w.text} </span>)}</span></Box>}
      </Box><Stack direction="row" justifyContent="center" alignItems="center" gap={1} sx={{ mt: 1.5 }}><IconButton aria-label={playing ? 'Pausar prévia' : 'Reproduzir trechos'} onClick={() => { const v = video.current; if (v.paused) { if (v.currentTime < active.start || v.currentTime >= active.end) seek(active); v.play().catch(e => setError(detail(e))) } else v.pause() }} sx={{ animation: playing ? `${pulseGlowWarm} 2.8s infinite` : 'none' }}>{playing ? <PauseIcon /> : <PlayIcon />}</IconButton><Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>Fonte {formatTime(time)} · Edição {formatTime(total)}</Typography></Stack>{document.framing.mode === 'face' && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>O acompanhamento de rostos será calculado na exportação. A prévia mostra a fonte.</Typography>}</Paper>
      <Paper variant="outlined" sx={{ minWidth: 0, p: 2 }}><Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" aria-label="Ajustes da edição"><Tab icon={<SubtitlesIcon />} aria-label="Legendas" /><Tab icon={<CropIcon />} aria-label="Enquadramento" /><Tab icon={<VolumeIcon />} aria-label="Áudio" /><Tab icon={<TuneIcon />} aria-label="Imagem" /></Tabs>
        {tab === 0 && <Box sx={{ mt: 2 }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography>Legendas</Typography><Switch checked={document.captions.enabled} onChange={e => setSection('captions', 'enabled', e.target.checked)} slotProps={{ input: { 'aria-label': 'Ativar legendas' } }} /></Stack><TextField select label="Fonte" fullWidth size="small" value={document.captions.font} onChange={e => setSection('captions', 'font', e.target.value)} sx={{ mt: 2 }}>{['Arial', 'Arial Black', 'DejaVu Sans'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField>{slider('Tamanho', document.captions.size, 20, 100, 1, v => setSection('captions', 'size', v), ' px')}{slider('Posição vertical', document.captions.y * 100, 10, 90, 1, v => setSection('captions', 'y', v / 100), '%')}{slider('Palavras por linha', document.captions.wordsPerLine, 1, 8, 1, v => setSection('captions', 'wordsPerLine', v))}<Stack direction="row" gap={2} sx={{ mt: 1 }}><TextField type="color" label="Texto" value={document.captions.color} onChange={e => setSection('captions', 'color', e.target.value)} size="small" fullWidth /><TextField type="color" label="Destaque" value={document.captions.accent} onChange={e => setSection('captions', 'accent', e.target.value)} size="small" fullWidth /></Stack><Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="body2">Fundo da legenda</Typography><Switch checked={document.captions.background} onChange={e => setSection('captions', 'background', e.target.checked)} slotProps={{ input: { 'aria-label': 'Fundo da legenda' } }} /></Stack></Box>}
        {tab === 1 && <Box sx={{ mt: 2 }}><TextField select fullWidth size="small" label="Formato" value={document.framing.aspect} onChange={e => setSection('framing', 'aspect', e.target.value)}><MenuItem value="vertical">Vertical 9:16</MenuItem><MenuItem value="square">Quadrado 1:1</MenuItem><MenuItem value="original">Formato da fonte</MenuItem></TextField><TextField select fullWidth size="small" label="Enquadramento" value={document.framing.mode} onChange={e => setSection('framing', 'mode', e.target.value)} sx={{ mt: 2 }}><MenuItem value="manual">Ajuste manual</MenuItem><MenuItem value="face" disabled={document.framing.aspect !== 'vertical'}>Acompanhar rosto</MenuItem></TextField><TextField select fullWidth size="small" label="Preenchimento manual" value={document.framing.fit} onChange={e => setSection('framing', 'fit', e.target.value)} sx={{ mt: 2 }}><MenuItem value="contain">Manter quadro inteiro</MenuItem><MenuItem value="cover">Preencher recortando</MenuItem></TextField>{slider('Posição horizontal', document.framing.x * 100, 0, 100, 1, v => setSection('framing', 'x', v / 100), '%')}{slider('Posição vertical do vídeo', document.framing.y * 100, 0, 100, 1, v => setSection('framing', 'y', v / 100), '%')}{slider('Zoom', document.framing.zoom, 1, 3, .05, v => setSection('framing', 'zoom', v), '×')}<Typography variant="caption" color="text.secondary">A detecção escolhe rostos, sem identificar automaticamente quem fala. Use o ajuste manual para escolher outra pessoa.</Typography></Box>}
        {tab === 2 && <Box sx={{ mt: 2 }}>{slider('Volume', document.volume * 100, 0, 200, 5, v => change(d => { d.volume = v / 100; return d }), '%')}<Stack direction="row" alignItems="center" justifyContent="space-between"><Typography>Silenciar</Typography><Switch checked={document.muted} onChange={e => change(d => { d.muted = e.target.checked; return d })} slotProps={{ input: { 'aria-label': 'Silenciar áudio' } }} /></Stack><Typography variant="caption" color="text.secondary">Ganho acima de 100% será aplicado na exportação.</Typography></Box>}
        {tab === 3 && <Box sx={{ mt: 2 }}>{slider('Brilho', document.effects.brightness, 40, 180, 1, v => setSection('effects', 'brightness', v), '%')}{slider('Contraste', document.effects.contrast, 40, 180, 1, v => setSection('effects', 'contrast', v), '%')}{slider('Saturação', document.effects.saturation, 0, 220, 1, v => setSection('effects', 'saturation', v), '%')}{slider('Desfoque', document.effects.blur, 0, 8, .1, v => setSection('effects', 'blur', v))}{slider('Matiz', document.effects.hue, -180, 180, 1, v => setSection('effects', 'hue', v), '°')}</Box>}
      </Paper>
    </Box>
    <Paper variant="outlined" sx={{ mt: 2, p: 2 }}><Stack direction="row" alignItems="center" gap={1} flexWrap="wrap"><Typography variant="subtitle2" sx={{ flex: 1 }}>Linha do tempo</Typography><Button size="small" startIcon={<ContentCutIcon />} onClick={() => { try { change(splitDocument(document, active.id, time, uid())) } catch (e) { setError(e.message) } }}>Dividir</Button><Tooltip title="Desfazer"><span><IconButton aria-label="Desfazer" disabled={!history.length} onClick={() => rewind(false)}><UndoIcon /></IconButton></span></Tooltip><Tooltip title="Refazer"><span><IconButton aria-label="Refazer" disabled={!future.length} onClick={() => rewind(true)}><RedoIcon /></IconButton></span></Tooltip></Stack><Stack direction="row" gap={.5} sx={{ my: 2, minHeight: 55 }}>{document.segments.map((s, i) => <Button key={s.id} onClick={() => seek(s)} variant={s.id === selected ? 'contained' : 'outlined'} aria-pressed={s.id === selected} aria-label={`Trecho ${i + 1}: ${formatTime(s.start)} a ${formatTime(s.end)}`} sx={{ flex: Math.max(.3, (s.end - s.start) / total), minWidth: 25, px: .5, overflow: 'hidden', whiteSpace: 'nowrap' }}>{i + 1}</Button>)}</Stack>{slider('Cursor na fonte', time, 0, draft.duration, .02, v => { setTime(v); if (video.current) video.current.currentTime = v }, ' s')}<Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}><TextField label="Entrada (s)" type="number" size="small" value={active.start} inputProps={{ min: 0, max: active.end - .04, step: .02 }} onChange={e => { const v = Number(e.target.value); if (v >= 0 && v < active.end - .04) change(d => { d.segments.find(s => s.id === active.id).start = v; return d }) }} /><TextField label="Saída (s)" type="number" size="small" value={active.end} inputProps={{ min: active.start + .04, max: draft.duration, step: .02 }} onChange={e => { const v = Number(e.target.value); if (v > active.start + .04 && v <= draft.duration) change(d => { d.segments.find(s => s.id === active.id).end = v; return d }) }} /><Stack direction="row" gap={.5}><IconButton aria-label="Mover trecho para a esquerda" onClick={() => change(moveSegment(document, active.id, -1))} disabled={document.segments[0].id === active.id}><LeftIcon /></IconButton><IconButton aria-label="Mover trecho para a direita" onClick={() => change(moveSegment(document, active.id, 1))} disabled={document.segments.at(-1).id === active.id}><RightIcon /></IconButton><IconButton aria-label="Remover trecho" disabled={document.segments.length === 1} onClick={() => { change(d => { d.segments = d.segments.filter(s => s.id !== active.id); return d }); setSelected(document.segments.find(s => s.id !== active.id).id) }}><DeleteIcon /></IconButton></Stack></Stack></Paper>
    <Paper variant="outlined" sx={{ mt: 2, p: 2 }}><Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}><Typography variant="subtitle2">Revisão das palavras</Typography><Typography variant="caption" color="text.secondary">{document.words.length} palavras</Typography></Stack>{wordList.length ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', lg: 'repeat(3,minmax(0,1fr))' }, gap: 1.5, mt: 2 }}>{wordList.map(w => <Stack key={w.id} direction="row" alignItems="center" gap={.5}><TextField size="small" fullWidth label={`${formatTime(w.start)} a ${formatTime(w.end)}`} value={w.text} onFocus={() => { if (video.current) { video.current.pause(); video.current.currentTime = w.start }; setTime(w.start) }} onChange={e => change(d => { d.words.find(item => item.id === w.id).text = e.target.value.slice(0, 120); return d })} /><Switch size="small" checked={w.highlight} onChange={e => change(d => { d.words.find(item => item.id === w.id).highlight = e.target.checked; return d })} slotProps={{ input: { 'aria-label': `Destacar palavra ${w.text}` } }} /></Stack>)}</Box> : <Typography color="text.secondary" sx={{ mt: 2 }}>Este corte não tem palavras temporizadas. Gere o corte com transcrição para editar as legendas.</Typography>}<Stack direction="row" justifyContent="center" alignItems="center" sx={{ mt: 2 }}><IconButton aria-label="Palavras anteriores" disabled={wordPage === 0} onClick={() => setWordPage(p => p - 1)}><LeftIcon /></IconButton><Typography variant="caption">Página {wordPage + 1} de {Math.max(1, Math.ceil(document.words.length / 30))}</Typography><IconButton aria-label="Próximas palavras" disabled={(wordPage + 1) * 30 >= document.words.length} onClick={() => setWordPage(p => p + 1)}><RightIcon /></IconButton></Stack></Paper>
  </Box>
}
