// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState, useEffect, useRef } from "react"
import {
  Box, Stack, Typography, Button, Chip, Alert,
  CircularProgress, LinearProgress, alpha, useTheme,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from "@mui/material"
import MovieFilterIcon from "@mui/icons-material/MovieFilterOutlined"
import PlayArrowIcon from "@mui/icons-material/PlayArrowOutlined"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import DownloadIcon from "@mui/icons-material/DownloadOutlined"
import DeleteIcon from "@mui/icons-material/DeleteOutlineOutlined"
import http from "../../api/http"
import useAppStore from "../../store/appStore"
import useHashHighlight from "../../hooks/useHashHighlight"

/**
 * Motion Graphics (HyperFrames) — the opt-in, on-demand Node plugin that
 * renders code-driven motion graphics locally (HTML → MP4 via headless Chrome
 * + FFmpeg).
 *
 * Nothing ships in the base install; the portable Node runtime and the npm
 * package are downloaded here on first opt-in and removed in full on
 * uninstall. Rendering never leaves the machine and costs nothing.
 */
export default function MotionGraphicsSection() {
  const theme = useTheme()
  const showSnackbar = useAppStore((s) => s.showSnackbar)
  // Keep the app-wide opt-in badge (sidebar + Tools card) in sync as the user
  // installs / uninstalls here.
  const setMotionInstalled = useAppStore((s) => s.setMotionInstalled)

  const [status, setStatus] = useState(null)   // null while loading
  const [busy, setBusy] = useState(false)
  const [uninstallConfirm, setUninstallConfirm] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const pollRef = useRef(null)
  const anchorRef = useRef(null)
  const highlight = useHashHighlight("motion-graphics", anchorRef)

  const fetchStatus = async () => {
    try {
      const res = await http.get("/api/settings/motion-graphics/status")
      setStatus(res.data)
      setMotionInstalled(!!res.data?.installed)
      return res.data
    } catch (e) {
      console.error("Failed to fetch motion-graphics status:", e)
      return null
    }
  }

  const startPoll = () => {
    if (pollRef.current) return
    let nullStreak = 0
    const tick = async () => {
      const data = await fetchStatus()
      if (data == null) {
        // A transient fetch failure (network blip, or a dev reload bouncing the
        // server mid-install). Keep polling rather than silently freezing the
        // progress bar; give up only after several consecutive failures so we
        // don't spin forever against a server that is genuinely gone.
        nullStreak += 1
        if (nullStreak <= 5) {
          pollRef.current = setTimeout(tick, 2000)
        } else {
          pollRef.current = null
          showSnackbar("Perdemos contato com o servidor durante a instalação , recarregue para verificar o status.", "warning")
        }
        return
      }
      nullStreak = 0
      if (data.installing) {
        pollRef.current = setTimeout(tick, 2000)
      } else {
        pollRef.current = null
        if (data.installed && !data.error) {
          showSnackbar("Motion Graphics pronto , agora você pode renderizar vídeos em motion localmente.", "success")
        } else if (data.error) {
          showSnackbar(("Falha na instalação do Motion Graphics: " + String(data.error) + ""), "error")
        }
      }
    }
    pollRef.current = setTimeout(tick, 1500)
  }

  useEffect(() => {
    fetchStatus().then((data) => {
      if (data?.installing) startPoll()
    })
    return () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current)
        pollRef.current = null
      }
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const install = async () => {
    const updating = status?.update_available
    setBusy(true)
    setTestResult(null)
    try {
      const res = await http.post("/api/settings/motion-graphics/install")
      if (res.data?.ok) {
        showSnackbar(
          updating
            ? "Atualizando o Motion Graphics… isto reutiliza o runtime Node instalado."
            : ("Instalando o Motion Graphics… um download único de ~" + String(status?.approx_download_mb ?? 350) + " MB."),
          "info")
        await fetchStatus()
        startPoll()
      } else {
        showSnackbar(res.data?.error || "Não foi possível iniciar a instalação", "error")
      }
    } catch (e) {
      showSnackbar(("Falha na instalação: " + String(e.message) + ""), "error")
    } finally {
      setBusy(false)
    }
  }

  const uninstall = async () => {
    setUninstallConfirm(false)
    setBusy(true)
    try {
      await http.post("/api/settings/motion-graphics/uninstall")
      setTestResult(null)
      await fetchStatus()
      showSnackbar("Motion Graphics removido.", "success")
    } catch (e) {
      showSnackbar(("Falha na desinstalação: " + String(e.message) + ""), "error")
    } finally {
      setBusy(false)
    }
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await http.post("/api/settings/motion-graphics/test")
      setTestResult(res.data)
    } catch (e) {
      setTestResult({ ok: false, detail: e.message })
    } finally {
      setTesting(false)
    }
  }

  if (!status) {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Carregando o status do Motion Graphics…
        </Typography>
      </Stack>
    )
  }

  const { installed, installing, error, platform_supported, update_available } = status
  // A prior install of a different pinned version → offer a quick in-place
  // "Update" rather than the first-time "Install ~350 MB download".
  const showUpdate = !installed && update_available && !installing && platform_supported
  const showInstall = !installed && !update_available && !installing && platform_supported

  return (
    <Box
      ref={anchorRef}
      data-hash-target="motion-graphics"
      sx={{
        p: 1.5, borderRadius: 2,
        border: "1px solid",
        borderColor: highlight ? "primary.main" : "divider",
        boxShadow: highlight ? `0 0 0 4px ${alpha(theme.palette.primary.main, 0.18)}` : "none",
        transition: "box-shadow .4s, border-color .4s",
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
        <MovieFilterIcon sx={{ fontSize: 18, color: "primary.main" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Motion Graphics</Typography>

        {installed && (
          <>
            <Chip size="small" color="success" variant="outlined" icon={<CheckCircleIcon sx={{ fontSize: 14 }} />} label={"Instalado"} />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {status.disk_size_mb || status.approx_download_mb} MB no disco
              {status.engine_cache_mb ? (" · +" + String(status.engine_cache_mb) + " MB de cache do mecanismo") : ""}
            </Typography>
          </>
        )}
        {showInstall && <Chip size="small" variant="outlined" label={"Opcional"} />}
        {showUpdate && <Chip size="small" color="warning" variant="outlined" label={"Atualização disponível"} />}
        {installing && <Chip size="small" color="info" variant="outlined" label={"Instalando…"} />}
        {!platform_supported && <Chip size="small" color="default" variant="outlined" label={"Plataforma não suportada"} />}

        <Box sx={{ flexGrow: 1 }} />

        {showInstall && (
          <Button size="small" variant="contained" startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
            disabled={busy} onClick={install}>
            {busy ? "Iniciando…" : "Instalar"}
          </Button>
        )}
        {showUpdate && (
          <Button size="small" variant="contained" color="warning" startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
            disabled={busy} onClick={install}>
            {busy ? "Atualizando…" : "Atualizar"}
          </Button>
        )}
        {installed && (
          <>
            <Button size="small" variant="outlined" startIcon={<PlayArrowIcon sx={{ fontSize: 16 }} />}
              disabled={testing || busy} onClick={runTest}>
              {testing ? "Renderizando…" : "Renderizar teste"}
            </Button>
            <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon sx={{ fontSize: 16 }} />}
              disabled={busy} onClick={() => setUninstallConfirm(true)}>
              Remover
            </Button>
          </>
        )}
      </Stack>

      {showInstall && (
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary", fontSize: "0.76rem", lineHeight: 1.5, mb: 1 }}>
          Renderize vídeos de motion graphics , tipografia cinética, cartões de estatísticas, lower-thirds , inteiramente
          na sua máquina. Determinístico, repetível e gratuito para renderizar quantas vezes você
          quiser, porque nenhum modelo de IA está envolvido. Download único de ~{status.approx_download_mb} MB
          (um runtime Node portátil mais o mecanismo HyperFrames), tudo dentro da sua
          pasta de dados e tudo removido novamente se você desinstalar.
        </Typography>
      )}

      {showUpdate && (
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary", fontSize: "0.76rem", lineHeight: 1.5, mb: 1 }}>
          Um mecanismo de Motion Graphics mais novo vem com esta versão
          {status.installed_version ? (" (" + String(status.installed_version) + " → " + String(status.hyperframes_version) + ")") : ""}.
          A atualização é rápida , ela reutiliza o runtime Node instalado e os pacotes em cache, então
          não é um novo download completo.
        </Typography>
      )}

      {!platform_supported && (
        <Alert severity="info" sx={{ fontSize: "0.78rem", py: 0.25 }}>
          O Motion Graphics precisa de uma build portátil do Node para a sua plataforma, e não há uma
          publicada para esta arquitetura de CPU.
        </Alert>
      )}

      {installing && (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {status.current_step || "Instalando…"}
          </Typography>
          <LinearProgress
            variant={status.progress_pct ? "determinate" : "indeterminate"}
            value={status.progress_pct || 0}
            sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
          />
        </Box>
      )}

      {error && !installing && (
        <Alert severity="error" sx={{ mt: 1, fontSize: "0.78rem", py: 0.25 }}>{error}</Alert>
      )}

      {testResult && (
        <Alert severity={testResult.ok ? "success" : "error"} sx={{ mt: 1, fontSize: "0.78rem", py: 0.25 }}>
          {testResult.ok
            ? ("Renderização OK , " + String(testResult.output_size_kb) + " KB em " + String(testResult.latency_ms) + " ms.")
            : ("Falha na renderização: " + String(testResult.detail || testResult.error) + "")}
        </Alert>
      )}

      <Dialog open={uninstallConfirm} onClose={() => setUninstallConfirm(false)}>
        <DialogTitle>Remover Motion Graphics?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: "0.88rem" }}>
            Isso exclui o runtime Node portátil e o mecanismo HyperFrames
            (~{status.disk_size_mb || status.approx_download_mb} MB). Os vídeos de motion que você já
            renderizou permanecem na sua biblioteca, e você pode reinstalar a qualquer momento.
            {status.engine_cache_mb ? (
              <>
                {" "}O mecanismo também mantém um Chrome headless
                (~{status.engine_cache_mb} MB) em <code>{status.engine_cache_path}</code>.
                Essa pasta é compartilhada com qualquer outra instalação do HyperFrames nesta máquina, então
                ela é deixada em paz , exclua-a você mesmo se quiser recuperar o espaço.
              </>
            ) : null}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUninstallConfirm(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={uninstall} color="error" variant="contained" disabled={busy}>Remover</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
