from pathlib import Path
path=Path(__file__).resolve().parents[1]/'frontend/src/pages/ClipEditor.jsx'
s=path.read_text(encoding='utf-8')
s=s.replace('<Button onClick={() => navigate(\'/clips\')} startIcon={<ContentCutIcon />}>Abrir estúdio de cortes</Button>', '''<Stack direction="row" gap={1} flexWrap="wrap"><Button onClick={() => navigate('/clips')} startIcon={<ContentCutIcon />}>Abrir estúdio de cortes</Button><Button variant="contained" onClick={combineDrafts} disabled={combineIds.length < 2 || ['pending', 'running'].includes(combineJob?.status)}>Juntar {combineIds.length || ''} rascunhos</Button></Stack>{combineJob && <Box sx={{ mt: 2 }}><Typography role="status">{combineJob.current_step || 'Preparando montagem no PC'}</Typography><LinearProgress variant="determinate" value={combineJob.progress_pct || 0} /></Box>}''')
s=s.replace("<Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={600}>{d.title}",'''<Checkbox checked={combineIds.includes(d.id)} disabled={combineIds.length >= 8 && !combineIds.includes(d.id)} onChange={e => setCombineIds(ids => e.target.checked ? [...ids, d.id] : ids.filter(id => id !== d.id))} slotProps={{ input: { 'aria-label': `Selecionar ${d.title} para juntar` } }} /><Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={600}>{d.title}''')
s=s.replace('const video = useRef(null), activeSegment = useRef(0), lastLoaded = useRef(\'\')','const video = useRef(null), activeSegment = useRef(0)')
s=s.replace('      lastLoaded.current = data.id\n','')
path.write_text(s,encoding='utf-8')
