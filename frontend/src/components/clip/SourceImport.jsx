import { useEffect, useState } from "react"
import { Alert, Box, Button, LinearProgress, Stack, TextField, Typography } from "@mui/material"
import DownloadIcon from "@mui/icons-material/DownloadOutlined"
import UploadIcon from "@mui/icons-material/UploadFileOutlined"
import http from "../../api/http"
import useAppStore from "../../store/appStore"
import { storageKey } from "../../utils/storage"
import { jobStep } from '../../utils/jobStep'

const pendingKey = storageKey("clipper", "source-import")
function readPending() {
  try { return JSON.parse(sessionStorage.getItem(pendingKey) || "null") } catch { return null }
}

export default function SourceImport({ onReady }) {
  const [url, setUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [pending, setPending] = useState(readPending)
  const jobId = pending?.jobId
  const [status, setStatus] = useState(null)
  const [error, setError] = useState("")
  const [delivery, setDelivery] = useState(null)
  const startJob = useAppStore(s => s.startJob)
  const busy = submitting || !!jobId

  useEffect(() => {
    try {
      if (pending) sessionStorage.setItem(pendingKey, JSON.stringify(pending))
      else sessionStorage.removeItem(pendingKey)
    } catch { /* The job still runs if browser storage is unavailable. */ }
  }, [pending])

  useEffect(() => {
    if (!jobId) return
    let disposed = false
    let timer
    const poll = async () => {
      try {
        const { data } = await http.get(`/api/jobs/${jobId}`)
        if (disposed) return
        setError("")
        setStatus(data)
        if (["success", "failed", "cancelled"].includes(data.status)) {
          setPending(null)
          if (data.status === "success") {
            let output = {}
            try { output = JSON.parse(data.output_json || "{}") } catch { /* Legacy job. */ }
            setDelivery(output.videos?.[0] || null)
            setUrl("")
            onReady(pending.sourceId || output.downloaded_ids?.[0])
          }
          else setError(data.error_message || "Não foi possível concluir a importação.")
          return
        }
      } catch (e) {
        if (e.response?.status === 404) { setPending(null); return }
        if (!disposed) setError(e.response?.data?.detail || "Não foi possível consultar a tarefa. Tentando novamente.")
      }
      if (!disposed) timer = setTimeout(poll, 2000)
    }
    poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [pending, jobId, onReady])

  const download = async e => {
    e.preventDefault()
    if (busy) return
    try {
      const parsed = new URL(url.trim())
      if (!["https:", "http:"].includes(parsed.protocol)) throw new Error()
    } catch { setError("Cole uma URL de vídeo válida."); return }
    setSubmitting(true); setError(""); setStatus(null); setDelivery(null)
    try {
      const { data } = await http.post("/api/downloaded/batch-download", {
        urls: [{ url: url.trim() }], options: { quality: "1080p", container: "mp4" }, analyze: false,
      })
      startJob(data.job_id, "download", "Baixando vídeo…")
      setPending({ jobId: data.job_id })
    } catch (e) { setError(e.response?.data?.detail || "Não foi possível iniciar o download.") }
    finally { setSubmitting(false) }
  }

  const upload = async e => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || busy) return
    setSubmitting(true); setError(""); setStatus(null); setDelivery(null)
    const form = new FormData(); form.append("file", file)
    try {
      const { data } = await http.post("/api/downloaded/import", form, { timeout: 0 })
      startJob(data.job_id, "analyze", "Transcrevendo arquivo…")
      onReady(data.id)
      setPending({ jobId: data.job_id, sourceId: data.id })
      setStatus({ status: "running", current_step: "Arquivo importado. Transcrevendo e analisando…" })
    } catch (e) { setError(e.response?.data?.detail || "Não foi possível importar o arquivo.") }
    finally { setSubmitting(false) }
  }

  return (
    <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}>
      <Stack component="form" onSubmit={download} direction={{ xs: "column", md: "row" }} spacing={1.5}>
        <TextField label={"Link do vídeo"} placeholder={"Cole o link do YouTube"} size="small" fullWidth
          value={url} onChange={e => setUrl(e.target.value)} disabled={busy} />
        <Button type="submit" variant="contained" startIcon={<DownloadIcon />} disabled={busy || !url.trim()} sx={{ whiteSpace: "nowrap", minWidth: 165 }}>
          {busy ? "Importando…" : "Baixar vídeo"}
        </Button>
        <Button component="label" variant="outlined" startIcon={<UploadIcon />} disabled={busy} sx={{ whiteSpace: "nowrap", minWidth: 175 }}>
          Importar arquivo
          <input type="file" hidden accept="video/*,audio/*,.mp4,.mov,.mkv,.webm,.mp3,.wav,.m4a" onChange={upload} disabled={busy} />
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        Depois de importar, use Corte automático para a IA escolher os cortes ou marque os trechos na linha do tempo.
        A transcrição e a exportação rodam no PC. Mantenha o aplicativo local aberto durante as tarefas. YouTube e DeepSeek precisam de internet.
      </Typography>
      {busy && <LinearProgress sx={{ mt: 1 }} variant={status?.progress_pct ? "determinate" : "indeterminate"} value={status?.progress_pct || 0} />}
      {status?.current_step && <Typography variant="caption">{jobStep(status.current_step)}</Typography>}
      {delivery?.height && <Alert severity={delivery.height < 1080 ? "warning" : "success"} sx={{ mt: 1 }}>
        Vídeo recebido em {delivery.height}p{delivery.ext ? (" (" + String(delivery.ext.toUpperCase()) + ")") : ""}.
        {delivery.height < 1080 && " A origem entregou qualidade menor que o limite de 1080p solicitado."}
      </Alert>}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  )
}
