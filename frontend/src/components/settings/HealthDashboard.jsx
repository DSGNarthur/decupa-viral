import { useState, useEffect } from "react"
import {
  Box, Typography, Button, Stack, LinearProgress, Chip,
  alpha, useTheme, IconButton, Tooltip,
} from "@mui/material"
import RefreshIcon from "@mui/icons-material/Refresh"
import FolderOpenIcon from "@mui/icons-material/FolderOpenOutlined"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import WarningIcon from "@mui/icons-material/Warning"
import ErrorIcon from "@mui/icons-material/Error"
import HelpOutlineIcon from "@mui/icons-material/HelpOutline"
import http from "../../api/http"

const STATUS_ICON = {
  running: CheckCircleIcon, ok: CheckCircleIcon, valid: CheckCircleIcon,
  expiring_soon: WarningIcon, expired: ErrorIcon,
  not_configured: HelpOutlineIcon, not_running: ErrorIcon, not_found: ErrorIcon,
  unknown_age: WarningIcon, stuck: ErrorIcon,
}

const STATUS_COLOR = {
  running: "success", ok: "success", valid: "success",
  expiring_soon: "warning", expired: "error",
  not_configured: "default", not_running: "error", not_found: "error",
  unknown_age: "warning", stuck: "error",
}
const STATUS_LABEL = {
  running: 'em execução', ok: 'disponível', valid: 'válido', configured: 'configurado',
  expiring_soon: 'expira em breve', expired: 'expirado', not_configured: 'não configurado',
  not_running: 'parado', not_found: 'não encontrado', unknown_age: 'idade desconhecida', stuck: 'travado',
  browser: 'neste dispositivo', remote_resolver: 'consulta na Vercel',
}

export default function HealthDashboard() {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const theme = useTheme()

  const fetchHealth = async () => {
    setLoading(true)
    try { const res = await http.get("/api/settings/health"); setHealth(res.data) }
    catch (e) { console.error("Failed to fetch health:", e) }
    finally { setLoading(false) }
  }

  const openFolder = async (folder) => {
    try { await http.post("/api/settings/open-folder", { folder }) } catch {}
  }

  useEffect(() => { fetchHealth() }, [])

  if (loading) return (
    <Box sx={{ py: 2 }}>
      <LinearProgress sx={{ borderRadius: 1 }} />
      <Typography variant="body2" sx={{ color: "text.secondary", mt: 1, textAlign: "center", fontSize: "0.82rem" }}>
        Verificando a integridade do sistema...
      </Typography>
    </Box>
  )
  if (!health) return <Typography sx={{ color: "error.main", fontSize: "0.85rem" }}>Falha ao carregar o status do sistema</Typography>

  // Download / transcription worker pools. A non-zero "abandoned" means a
  // stalled download or transcription was given up on while its thread kept
  // running — Python cannot kill a thread, so only a restart frees it.
  const pools = Array.isArray(health.thread_pools) ? health.thread_pools : null
  const stuck = pools ? pools.reduce((n, p) => n + (p.abandoned || 0), 0) : 0
  const view = pools ? { ...health, workers: { status: stuck ? "stuck" : "ok" } } : health

  const items = import.meta.env.VITE_BROWSER_RUNTIME === 'true' ? [
    { label: 'Vídeo e áudio', key: 'ffmpeg', description: 'Processamento neste dispositivo' },
    { label: 'Transcrição', key: 'whisper', description: 'Modelo de fala neste dispositivo' },
    { label: 'Inteligência artificial', key: 'ai_provider', description: 'Credencial do provedor' },
    { label: 'Download por link', key: 'ytdlp', description: 'Depende da disponibilidade do YouTube' },
  ] : [
    ...(pools ? [{
      label: "Workers em segundo plano", key: "workers",
      description: "Downloads e transcrição",
      extra: stuck ? `${stuck} tarefa(s) travada(s). Reinicie o Decupa Viral para liberar os recursos.` : null,
    }] : []),
    { label: "ImageMagick", key: "imagemagick", description: "Necessário para renderização de legendas" },
    { label: "yt-dlp", key: "ytdlp", description: "Baixador de vídeos", extra: health.ytdlp?.version ? `v${health.ytdlp.version}` : null },
    { label: "Cookie do Douyin", key: "douyin_cookie", description: "Acesso de busca do Douyin", extra: health.douyin_cookie?.age_days != null ? `${health.douyin_cookie.age_days}d old` : null },
    { label: "Cookie do TikTok", key: "tiktok_cookie", description: "Acesso de busca do TikTok", extra: health.tiktok_cookie?.age_days != null ? `${health.tiktok_cookie.age_days}d old` : null },
  ]

  return (
    <Box>
      {/* Header row */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1}>
          {import.meta.env.VITE_BROWSER_RUNTIME !== 'true' && <Tooltip title={"Abrir pasta de armazenamento"}>
            <IconButton size="small" onClick={() => openFolder("storage")} sx={{ color: "text.secondary" }}>
              <FolderOpenIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>}
        </Stack>
        <Button size="small" variant="outlined" color="inherit" startIcon={<RefreshIcon sx={{ fontSize: 16 }} />} onClick={fetchHealth}>
          Atualizar
        </Button>
      </Stack>

      {/* Status items */}
      <Stack spacing={0.75}>
        {items.map(item => {
          const data = view[item.key]
          const status = data?.status || "not_configured"
          const color = STATUS_COLOR[status] || "default"
          const Icon = STATUS_ICON[status] || HelpOutlineIcon
          const chipColor = color === "default" ? undefined : color

          return (
            <Box
              key={item.key}
              sx={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                px: 2, py: 1.25,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.text.primary, 0.02),
                border: 1, borderColor: "divider",
                transition: "all 0.15s",
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Icon sx={{ fontSize: 18, color: chipColor ? `${chipColor}.main` : "text.disabled" }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "0.85rem", lineHeight: 1.3 }}>
                    {item.label}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.72rem" }}>
                    {item.description}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                {item.extra && (
                  <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.75rem" }}>
                    {item.extra}
                  </Typography>
                )}
                <Chip
                  label={STATUS_LABEL[status] || 'não verificado'}
                  size="small"
                  color={chipColor}
                  variant={chipColor ? "outlined" : "outlined"}
                  sx={{ textTransform: "capitalize", fontWeight: 500, fontSize: "0.72rem", height: 24 }}
                />
              </Stack>
            </Box>
          )
        })}

        {/* YouTube quota */}
        {health.youtube_quota && (
          <Box sx={{
            px: 2, py: 1.5,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.text.primary, 0.02),
            border: 1, borderColor: "divider",
          }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "0.85rem", lineHeight: 1.3 }}>
                  Cota da API do YouTube
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.72rem" }}>
                  Cota diária de busca e upload
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem", color: "text.secondary" }}>
                {health.youtube_quota.used.toLocaleString()} / {health.youtube_quota.limit.toLocaleString()}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={Math.min((health.youtube_quota.used / health.youtube_quota.limit) * 100, 100)}
              color={health.youtube_quota.used > health.youtube_quota.limit * 0.8 ? "error" : "primary"}
              sx={{ borderRadius: 1, height: 6 }}
            />
          </Box>
        )}
      </Stack>
    </Box>
  )
}
