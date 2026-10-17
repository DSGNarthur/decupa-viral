import { useEffect, useMemo, useRef, useState } from "react"
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom"
import useWebSocket from "../hooks/useWebSocket"
import useJobs from "../hooks/useJobs"
import http from "../api/http"
import { interceptPCDownloads } from '../companion/downloads'
import ActivityPanel from "./librarynext/ActivityPanel"
import { activityFromJob } from "./librarynext/assetModel"
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, Divider, IconButton, useMediaQuery, useTheme, Tooltip, Badge, Alert, Button,
} from "@mui/material"
import useAppStore from "../store/appStore"
import { pluginNavItems } from "../plugins"
import MenuIcon from "@mui/icons-material/MenuOutlined"
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import ChatIcon from "@mui/icons-material/ChatBubbleOutline"
import VideoLibraryIcon from "@mui/icons-material/OndemandVideoOutlined"
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibraryOutlined"
import SensorsIcon from "@mui/icons-material/SensorsOutlined"
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphoneOutlined"
import ContentCutIcon from "@mui/icons-material/ContentCutOutlined"
import MovieFilterIcon from "@mui/icons-material/MovieFilterOutlined"
import BuildIcon from "@mui/icons-material/BuildOutlined"
import SettingsIcon from "@mui/icons-material/SettingsOutlined"
import TravelExploreIcon from "@mui/icons-material/TravelExploreOutlined"
import LightModeIcon from '@mui/icons-material/LightModeOutlined'
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined'

const DRAWER_WIDTH = 240
const COLLAPSED_WIDTH = 64

const navItems = [
  { to: "/clips",     icon: <ContentCutIcon />,       label: "Estúdio de cortes" },
  { to: "/editor",    icon: <MovieFilterIcon />,      label: "Editor de cortes" },
  { to: "/tools/video-download", icon: <VideoLibraryIcon />, label: "Baixar vídeo" },
  { to: "/chat",      icon: <ChatIcon />,             label: "Conversas" },
  { to: "/scout",     icon: <TravelExploreIcon />,    label: "Pesquisa de vídeos" },
  { to: "/channels",  icon: <SensorsIcon />,          label: "Meus canais" },
  { to: "/videos",    icon: <VideoLibraryIcon />,     label: "Biblioteca" },
  { to: "/stock",     icon: <PhotoLibraryIcon />,     label: "Vídeo de banco" },
  { to: "/motion",    icon: <MovieFilterIcon />,      label: "Animações" },
  { to: "/tools",     icon: <BuildIcon />,            label: "Ferramentas" },
  { to: "/messaging", icon: <PhoneIphoneIcon />,      label: "Mensagens" },
  ...pluginNavItems.filter(i => (i.position || "top") === "top"),
]

const bottomItems = [
  ...pluginNavItems.filter(i => i.position === "bottom"),
  { to: "/settings",  icon: <SettingsIcon />,     label: "Configurações" },
  { to: "/about",     icon: <BuildIcon />,        label: "Sobre e código-fonte" },
  ...(import.meta.env.VITE_BROWSER_RUNTIME === 'true' ? [{ to: '/diagnostico', icon: <BuildIcon />, label: 'Verificar dispositivo' }] : []),
]

export default function Layout() {
  const openVercel = async () => {
    try {
      const { data } = await http.post('/api/companion/link')
      // Navigation keeps the token in a fragment, never in a server request.
      window.location.assign(data.url)
    } catch (error) { useAppStore.getState().showSnackbar(error.response?.data?.detail || 'Abra o aplicativo local atualizado para conectar à Vercel.', 'error') }
  }
  useWebSocket()  // Global WS connection — active on all pages
  const location = useLocation()
  const navigate = useNavigate()
  const theme = useTheme()
  const isNarrow = useMediaQuery(theme.breakpoints.down("md"))
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const activeJobs = useAppStore(s => s.activeJobs)
  const runningJobCount = Object.values(activeJobs).filter(j => j.status === "running").length
  // The Activity panel is mounted HERE, not on a page: jobs start from the
  // Clipper, Stock Video, a tool page and the Motion studio alike, and it used
  // to be a Library tab reachable from exactly one route.
  const activityOpen = useAppStore(s => s.activityOpen)
  const openActivity = useAppStore(s => s.openActivity)
  const closeActivity = useAppStore(s => s.closeActivity)
  const showSnackbar = useAppStore(s => s.showSnackbar)
  useEffect(() => {
    if (import.meta.env.VITE_COMPANION_RUNTIME !== 'true') return
    return interceptPCDownloads(message => showSnackbar(message, 'error'))
  }, [showSnackbar])
  const removeJob = useAppStore(s => s.removeJob)
  // ONE job poll for the whole app — pages read `jobs` from the store. A second
  // useJobs() instance would double the polling for the same rows.
  //
  // 200, not the default 20: the panel states counts and offers "clear all of
  // these", and computing either over a 20-row window would quietly lie the
  // moment a user had more.
  const { jobs: allJobs, jobTotal, fetchJobs } = useJobs(5000, 200)
  const activity = useMemo(() => allJobs.map(activityFromJob), [allJobs])
  // The poll backs off when nothing is in flight, but the WebSocket knows about
  // a new job immediately (job_started → activeJobs). Without this nudge, a run
  // you just started could be missing from Activity long enough to read as
  // never having started.
  const wsJobCount = Object.keys(activeJobs).length
  // This nudge reacts to a CHANGE in the count. Its first run is not a change,
  // and `useJobs` already fetches on mount — so firing it there sent the same
  // /api/jobs?limit=200 request twice on every single navigation. Skip the
  // mount run; keep every later one.
  const jobNudgeReady = useRef(false)
  useEffect(() => {
    if (!jobNudgeReady.current) { jobNudgeReady.current = true; return }
    fetchJobs()
  }, [wsJobCount])  // eslint-disable-line react-hooks/exhaustive-deps
  // Opening the panel is a question — answer it with fresh data.
  useEffect(() => { if (activityOpen) fetchJobs() }, [activityOpen])  // eslint-disable-line react-hooks/exhaustive-deps

  const drawerWidth = collapsed && !isNarrow ? COLLAPSED_WIDTH : DRAWER_WIDTH

  const isActive = (to) => {
    if (to === "/") return location.pathname === "/"
    return location.pathname.startsWith(to)
  }

  const renderNavItem = ({ to, icon, label }) => {
    const active = isActive(to)
    const isCollapsed = collapsed && !isNarrow
    const renderedIcon = (to === "/videos" && runningJobCount > 0)
      ? <Badge color="warning" variant="dot">{icon}</Badge>
      : icon
    const button = (
      <ListItemButton
        key={to}
        component={NavLink}
        to={to}
        end={to === "/"}
        selected={active}
        sx={{
          borderRadius: 2.5,
          mb: 0.5,
          py: 0.85,
          px: isCollapsed ? 0 : 1.5,
          justifyContent: isCollapsed ? "center" : "flex-start",
          position: "relative",
          color: active ? "primary.main" : "text.secondary",
          "&.Mui-selected": {
            bgcolor: "rgba(128,128,128,0.1)",
            boxShadow: (theme) => `inset 0 0 0 1px rgba(128,128,128,0.12), ${theme.customShadows?.sm}`,
            "&:hover": { bgcolor: "rgba(128,128,128,0.13)" },
          },
          "&:hover": {
            bgcolor: "action.hover",
            color: "text.primary",
            "& .nav-icon": { transform: "scale(1.1)" },
          },
          transition: "all 0.15s ease",
        }}
      >
        <ListItemIcon
          className="nav-icon"
          sx={{
            minWidth: isCollapsed ? 0 : 34,
            color: "inherit",
            fontSize: 20,
            transition: "transform 0.15s ease",
          }}
        >
          {renderedIcon}
        </ListItemIcon>
        {!isCollapsed && (
          <ListItemText
            primary={label}
            primaryTypographyProps={{
              fontSize: "0.875rem",
              fontWeight: active ? 700 : 500,
              letterSpacing: "-0.01em",
            }}
          />
        )}
      </ListItemButton>
    )

    if (collapsed && !isNarrow) {
      return <Tooltip key={to} title={label} placement="right" arrow>{button}</Tooltip>
    }
    return button
  }

  const drawerContent = (
    <>
      {/* Logo + collapse toggle */}
      <Box sx={{ px: collapsed && !isNarrow ? 1 : 2.5, py: 2.5, display: "flex", alignItems: "center", justifyContent: collapsed && !isNarrow ? "center" : "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, overflow: "hidden" }}>
          {collapsed && !isNarrow ? <ContentCutIcon sx={{ fontSize: 28 }} /> : <Box component="img" src="/decupa-logo.png" alt="Decupa" sx={{ width: 164, maxWidth: "100%", filter: theme.palette.mode === "dark" ? "invert(1)" : "none" }} />}
        </Box>
        {!isNarrow && !collapsed && (
          <IconButton size="small" onClick={() => setCollapsed(true)} sx={{
            ml: 0.5,
            color: "primary.main",
            bgcolor: "action.hover",
            border: 1,
            borderColor: "divider",
            "&:hover": { bgcolor: "primary.main", color: "primary.contrastText" },
            transition: "all 0.15s",
          }}>
            <ChevronLeftIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Box>

      <Divider sx={{ mx: collapsed && !isNarrow ? 1 : 2, mb: 1, opacity: 0.5 }} />

      <List sx={{ px: collapsed && !isNarrow ? 0.75 : 1.5, flex: 1 }}>
        {navItems.map(renderNavItem)}
      </List>

      {/* Work in flight, from any route. The job log used to be a Library tab,
          so the only way to answer "is my clip still rendering?" was to
          navigate away from whatever you were doing. */}
      {runningJobCount > 0 && (
        <Box sx={{ px: collapsed && !isNarrow ? 0.75 : 1.5, pb: 1 }}>
          <Tooltip title={"Mostrar atividade"} placement="right" arrow>
            <ListItemButton onClick={openActivity} aria-label={"Mostrar atividade"}
              sx={{
                borderRadius: 2, py: 0.75,
                justifyContent: collapsed && !isNarrow ? "center" : "flex-start",
                border: 1, borderColor: "divider", bgcolor: "action.hover",
              }}>
              <Badge color="warning" variant="dot" sx={{ mr: collapsed && !isNarrow ? 0 : 1.25 }}>
                <BuildIcon sx={{ fontSize: 18 }} />
              </Badge>
              {!(collapsed && !isNarrow) && (
                <Typography sx={{ fontSize: "0.78rem", fontWeight: 600 }}>
                  {runningJobCount} tarefa{runningJobCount === 1 ? "" : "s"} em execução
                </Typography>
              )}
            </ListItemButton>
          </Tooltip>
        </Box>
      )}

      <Divider sx={{ mx: collapsed && !isNarrow ? 1 : 2, mb: 0.5, opacity: 0.5 }} />

      <List sx={{ px: collapsed && !isNarrow ? 0.75 : 1.5, pb: 1 }}>
        {bottomItems.map(renderNavItem)}
        {/* Expand button at the bottom when collapsed */}
        {!isNarrow && collapsed && (
          <Tooltip title={"Expandir barra lateral"} placement="right" arrow>
            <ListItemButton
              onClick={() => setCollapsed(false)}
              sx={{
                borderRadius: 2, py: 0.75, justifyContent: "center",
                border: 1, borderColor: "divider",
                color: "primary.main",
                "&:hover": { bgcolor: "primary.main", color: "primary.contrastText" },
                transition: "all 0.15s",
              }}
            >
              <ChevronRightIcon sx={{ fontSize: 20 }} />
            </ListItemButton>
          </Tooltip>
        )}
      </List>
    </>
  )

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      {/* Mobile: overlay drawer */}
      {isNarrow ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            "& .MuiDrawer-paper": { width: DRAWER_WIDTH },
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            transition: "width 0.2s ease",
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              transition: "width 0.2s ease",
              overflowX: "hidden",
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flex: 1,
          overflow: "auto",
          bgcolor: "background.default",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box component="header" sx={{ minHeight: 52, px: { xs: 1.5, md: 3 }, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Meu espaço / {navItems.find(i => location.pathname.startsWith(i.to))?.label || 'Decupa'}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>Processamento no PC</Typography>
          <Tooltip title={theme.palette.mode === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}><IconButton aria-label={theme.palette.mode === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} onClick={() => { localStorage.setItem('decupa-theme', theme.palette.mode === 'dark' ? 'light' : 'dark'); window.dispatchEvent(new Event('decupa-theme-change')) }}>{theme.palette.mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}</IconButton></Tooltip>
        </Box>
        {import.meta.env.VITE_BROWSER_RUNTIME !== 'true' && <Alert severity="info" sx={{ borderRadius: 0 }} action={import.meta.env.VITE_COMPANION_RUNTIME !== 'true' ? <Button color="inherit" size="small" onClick={openVercel}>Abrir na Vercel</Button> : undefined}>
          {import.meta.env.VITE_COMPANION_RUNTIME === 'true' ? 'Conectado ao processador deste PC. Os motores originais e os arquivos estão no computador. Mantenha o PC ligado.' : 'Processamento completo neste PC. Abra na Vercel para usar a mesma biblioteca e os mesmos motores neste computador.'}
        </Alert>}
        {/* Mobile top bar with hamburger */}
        {isNarrow && (
          <Box sx={{
            display: "flex", alignItems: "center", gap: 1,
            px: 1.5, py: 1, flexShrink: 0,
            borderBottom: 1, borderColor: "divider",
            bgcolor: "background.paper",
          }}>
            <IconButton size="small" onClick={() => setMobileOpen(true)}>
              <MenuIcon />
            </IconButton>
            <Box component="img" src="/decupa-icon.svg" alt="" sx={{ width: 24, height: 24, borderRadius: 0.5 }} />
            <Typography
              sx={{
                fontWeight: 700, fontSize: "0.95rem",
                color: "text.primary",
                WebkitBackgroundClip: "text",

              }}
            >
              Decupa Viral
            </Typography>
          </Box>
        )}
        {import.meta.env.VITE_BROWSER_RUNTIME === 'true' && <Alert severity="info" sx={{ borderRadius: 0 }} action={<Button color="inherit" size="small" onClick={() => navigate('/diagnostico')}>Testar aparelho</Button>}>
          {['/scout', '/channels', '/stock', '/motion', '/messaging'].includes(location.pathname)
            ? 'Este módulo nativo do ViralMint ainda precisa de adaptação ao navegador. Ele não executa tarefas nesta publicação.'
            : 'Versão web em validação. Os vídeos ficam neste aparelho. Mantenha a página aberta durante o processamento. O download do YouTube está indisponível no teste atual; use Importar arquivo.'}
        </Alert>}
        <Box sx={{ flex: 1, overflow: "auto" }}>
          <Outlet />
        </Box>
      </Box>

      {/* App-wide job log. Cancel and clear act for real; "open what it made"
          hands the key to the Library, which knows how to show it. */}
      <ActivityPanel
        open={activityOpen}
        onClose={closeActivity}
        jobs={activity}
        total={jobTotal}
        onOpenResult={(key) => {
          closeActivity()
          navigate(`/videos?open=${encodeURIComponent(key)}`)
        }}
        onCancel={async (jobId) => {
          try {
            const { data } = await http.delete(`/api/jobs/${jobId}`)
            removeJob(jobId)
            // Cancellation is cooperative: the row flips at once, but a
            // transfer or ffmpeg pass already in flight finishes on its own.
            // A bare "Job cancelled" reads as a completed stop and invites a
            // duplicate, so when the server reports best_effort, say so.
            showSnackbar(
              data?.best_effort
                ? "Cancelando , a etapa já em execução vai terminar sozinha"
                : "Tarefa cancelada",
              "info",
            )
          } catch (e) {
            showSnackbar(e.response?.data?.detail || "Não foi possível cancelar essa tarefa", "error")
          } finally {
            fetchJobs()
          }
        }}
        onDelete={async (job) => {
          // DELETE /api/jobs/{id} CANCELS a live job and DELETES a terminal one,
          // by design, so a running render is never destroyed by a stray click.
          // Removing a running row therefore takes two calls.
          try {
            const { data } = await http.delete(`/api/jobs/${job.id}`)
            if (job.state === "running") {
              removeJob(job.id)
              if (data?.best_effort) {
                // The step in flight is still running and will write its
                // outcome (or its error) to this row. Deleting now would throw
                // that away, so leave the row; it can be removed once it stops.
                showSnackbar(
                  "Cancelando , a etapa já em execução vai terminar sozinha. Remova-a quando parar.",
                  "info",
                )
              } else {
                // Never started, so nothing will write to the row — remove it.
                // A 409 means it backs a Library file; say so rather than swallow it.
                try {
                  await http.delete(`/api/jobs/${job.id}`)
                  showSnackbar("Tarefa cancelada e removida", "info")
                } catch (e2) {
                  showSnackbar(e2.response?.data?.detail || "Tarefa cancelada, mas não foi possível removê-la", "warning")
                }
              }
            } else {
              showSnackbar("Tarefa removida", "info")
            }
          } catch (e) {
            showSnackbar(e.response?.data?.detail || "Não foi possível remover essa tarefa", "error")
          } finally {
            fetchJobs()
          }
        }}
        onClearSection={async (ids, what) => {
          if (!ids?.length) return
          try {
            // The server KEEPS rows that are Library items — clearing the log
            // must not delete files. Report what actually happened rather than
            // the count we asked for, or the toast lies.
            const { data } = await http.post("/api/jobs/bulk-delete", { job_ids: ids })
            const gone = data?.deleted ?? ids.length
            const kept = data?.kept_library ?? 0
            showSnackbar(
              gone === 0 && kept > 0
                ? ("Nada para limpar , todos os " + String(kept) + " são arquivos na sua Biblioteca")
                : ("Limpou " + String(gone) + " " + String(what) + " tarefa" + String(gone === 1 ? "" : "s") + "") +
                  (kept > 0 ? (" · manteve " + String(kept) + " ainda na sua Biblioteca") : ""),
              "info",
            )
          } catch (e) {
            showSnackbar(e.response?.data?.detail || "Não foi possível limpar essas tarefas", "error")
          } finally {
            fetchJobs()
          }
        }}
      />
    </Box>
  )
}
