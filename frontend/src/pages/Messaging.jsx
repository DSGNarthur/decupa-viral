import { useState, useEffect, useCallback } from "react"
import {
  Box, Typography, Button, Stack, Card, CardContent, Chip, TextField,
  CircularProgress, Divider, Alert, Link, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Grid, Tooltip,
} from "@mui/material"
import ContentCopyIcon from "@mui/icons-material/ContentCopyOutlined"
import CheckIcon from "@mui/icons-material/Check"
import CloseIcon from "@mui/icons-material/CloseOutlined"
import TelegramIcon from "@mui/icons-material/Telegram"
import WhatsAppIcon from "@mui/icons-material/WhatsApp"
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline"
import SendIcon from "@mui/icons-material/SendOutlined"
import LogoutIcon from "@mui/icons-material/LogoutOutlined"
import QrCodeIcon from "@mui/icons-material/QrCode2Outlined"
import ChatBubbleIcon from "@mui/icons-material/ChatBubbleOutlined"
import TagIcon from "@mui/icons-material/TagOutlined"
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphoneOutlined"
import { QRCodeCanvas } from "qrcode.react"
import http from "../api/http"
import { ws } from "../api/websocket"
import useAppStore from "../store/appStore"
import useDocumentTitle from "../hooks/useDocumentTitle"

const STATE = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  AWAITING_START: "awaiting_start",
  CONNECTED: "connected",
  // Paired, but the link is down for now and the backend is bringing it back
  // on its own. Shown like Connected (Test / Disconnect) — never the connect
  // or pairing screens, whose buttons would throw a working pairing away.
  RECONNECTING: "reconnecting",
}

const WA_STATE = {
  DISCONNECTED: "disconnected",
  PAIRING: "pairing",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  UNAVAILABLE: "unavailable",
}

const DC_STATE = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  AWAITING_DM: "awaiting_dm",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  UNAVAILABLE: "unavailable",
}

const SL_STATE = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  AWAITING_DM: "awaiting_dm",
  CONNECTED: "connected",
  UNAVAILABLE: "unavailable",
}

// The bot links to whoever sends the pairing code and ignores everyone else —
// a bot token alone lets anyone message it (Telegram usernames are public, any
// Discord server member can DM a bot, every Slack workspace member can DM an app).
const PRIVATE_NOTE = "The bot links to whoever sends this code and ignores everyone else."

/** The one-time pairing code, big enough to read off the screen, with a copy button. */
function PairCode({ code }) {
  const [copied, setCopied] = useState(false)
  if (!code) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — the code is on screen */ }
  }
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="pair-code">
      <Box sx={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "1.35rem", fontWeight: 700, letterSpacing: "0.22em",
        px: 1.5, py: 0.5, borderRadius: 1.5,
        border: 1, borderColor: "divider", bgcolor: "action.hover",
      }}>
        {code}
      </Box>
      <Tooltip title={copied ? "Copiado" : "Copiar código"}>
        <IconButton size="small" onClick={copy} aria-label={"Copiar código de pareamento"}>
          {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Stack>
  )
}

// Paired but offline for now: same actions as Connected, honest wording.
function ReconnectingNote() {
  return (
    <Alert severity="warning" variant="outlined">
      Pareado, mas a conexão caiu. O Decupa Viral está reconectando sozinho , não há
      nada a refazer. Mensagens enviadas nesse meio tempo podem chegar atrasadas.
    </Alert>
  )
}

export default function Messaging() {
  useDocumentTitle("Mensagens")
  const showSnackbar = useAppStore((s) => s.showSnackbar)

  const [loading, setLoading] = useState(true)
  const [tgState, setTgState] = useState(STATE.DISCONNECTED)
  const [tgInfo, setTgInfo] = useState({ bot_username: "", bot_url: "", chat_id: "", pair_code: "" })
  const [botToken, setBotToken] = useState("")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const [waState, setWaState] = useState(WA_STATE.DISCONNECTED)
  const [waInfo, setWaInfo] = useState({ chat_id: "", error: "" })
  const [waQr, setWaQr] = useState("")
  const [waSaving, setWaSaving] = useState(false)
  const [waTesting, setWaTesting] = useState(false)

  const [dcState, setDcState] = useState(DC_STATE.DISCONNECTED)
  const [dcInfo, setDcInfo] = useState({ bot_username: "", bot_invite_url: "", chat_id: "", error: "", pair_code: "" })
  const [dcToken, setDcToken] = useState("")
  const [dcSaving, setDcSaving] = useState(false)
  const [dcTesting, setDcTesting] = useState(false)

  const [slState, setSlState] = useState(SL_STATE.DISCONNECTED)
  const [slInfo, setSlInfo] = useState({ bot_user_id: "", team_name: "", chat_id: "", error: "", pair_code: "" })
  const [slBotToken, setSlBotToken] = useState("")
  const [slAppToken, setSlAppToken] = useState("")
  const [slSaving, setSlSaving] = useState(false)
  const [slTesting, setSlTesting] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await http.get("/api/messaging/status")
      const tg = data.telegram || {}
      if (tg.connected && tg.chat_id) {
        setTgState(STATE.CONNECTED)
        setTgInfo({ bot_username: tg.bot_username || "", bot_url: tg.bot_url || "", chat_id: tg.chat_id || "", pair_code: "" })
      } else if (tg.retrying) {
        // The saved bot failed to start (offline at boot); a retry is scheduled.
        setTgState(STATE.RECONNECTING)
        setTgInfo({ bot_username: "", bot_url: "", chat_id: "", pair_code: "" })
      } else if (tg.bot_username) {
        // bot_url carries ?start=<pair_code> while unpaired — one tap pairs.
        setTgState(STATE.AWAITING_START)
        setTgInfo({ bot_username: tg.bot_username || "", bot_url: tg.bot_url || "", chat_id: "", pair_code: tg.pair_code || "" })
      } else {
        setTgState(STATE.DISCONNECTED)
        setTgInfo({ bot_username: "", bot_url: "", chat_id: "", pair_code: "" })
      }

      const wa = data.whatsapp || {}
      if (wa.installed === false) {
        setWaState(WA_STATE.UNAVAILABLE)
        setWaInfo({ chat_id: "", error: wa.error || "neonize not installed" })
      } else if (wa.connected) {
        setWaState(WA_STATE.CONNECTED)
        setWaInfo({ chat_id: wa.chat_id || "", error: "" })
        setWaQr("")
      } else if (wa.paired) {
        // Paired but offline (a drop, sleep, boot before the socket is up):
        // it reconnects on its own. Offering the QR here would log out a
        // working session.
        setWaState(WA_STATE.RECONNECTING)
        setWaInfo({ chat_id: wa.chat_id || "", error: "" })
        setWaQr("")
      } else if (wa.pairing) {
        setWaState(WA_STATE.PAIRING)
      } else {
        setWaState(WA_STATE.DISCONNECTED)
        setWaInfo({ chat_id: "", error: "" })
        setWaQr("")
      }

      const dc = data.discord || {}
      if (dc.installed === false) {
        setDcState(DC_STATE.UNAVAILABLE)
        setDcInfo({ bot_username: "", bot_invite_url: "", chat_id: "", error: dc.error || "discord.py not installed" })
      } else if (dc.connected) {
        setDcState(DC_STATE.CONNECTED)
        setDcInfo({
          bot_username: dc.bot_username || "",
          bot_invite_url: dc.bot_invite_url || "",
          chat_id: dc.chat_id || "",
          error: "",
        })
      } else if (dc.chat_id) {
        // Paired, but the gateway isn't ready (a drop, or still logging in).
        setDcState(DC_STATE.RECONNECTING)
        setDcInfo({
          bot_username: dc.bot_username || "",
          bot_invite_url: dc.bot_invite_url || "",
          chat_id: dc.chat_id || "",
          error: "",
        })
      } else if (dc.bot_username) {
        setDcState(DC_STATE.AWAITING_DM)
        setDcInfo({
          bot_username: dc.bot_username || "",
          bot_invite_url: dc.bot_invite_url || "",
          chat_id: "",
          error: "",
          pair_code: dc.pair_code || "",
        })
      } else {
        setDcState(DC_STATE.DISCONNECTED)
        setDcInfo({ bot_username: "", bot_invite_url: "", chat_id: "", error: "" })
      }

      const sl = data.slack || {}
      if (sl.installed === false) {
        setSlState(SL_STATE.UNAVAILABLE)
        setSlInfo({ bot_user_id: "", team_name: "", chat_id: "", error: sl.error || "slack-sdk not installed" })
      } else if (sl.connected) {
        setSlState(SL_STATE.CONNECTED)
        setSlInfo({
          bot_user_id: sl.bot_user_id || "",
          team_name: sl.team_name || "",
          chat_id: sl.chat_id || "",
          error: "",
        })
      } else if (sl.awaiting_dm) {
        setSlState(SL_STATE.AWAITING_DM)
        setSlInfo({
          bot_user_id: sl.bot_user_id || "",
          team_name: sl.team_name || "",
          chat_id: "",
          error: "",
          pair_code: sl.pair_code || "",
        })
      } else {
        setSlState(SL_STATE.DISCONNECTED)
        setSlInfo({ bot_user_id: "", team_name: "", chat_id: "", error: "" })
      }
    } catch (e) {
      showSnackbar("Falha ao carregar o status de mensagens", "error")
    } finally {
      setLoading(false)
    }
  }, [showSnackbar])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  useEffect(() => {
    const unsubs = [
      ws.on("telegram_connected", (msg) => {
        setTgState(STATE.CONNECTED)
        setTgInfo(prev => ({ ...prev, chat_id: msg.chat_id || prev.chat_id }))
        showSnackbar("Telegram conectado , você receberá notificações aqui", "success")
      }),
      ws.on("whatsapp_qr", (msg) => {
        setWaQr(msg.qr || "")
        setWaState(WA_STATE.PAIRING)
      }),
      ws.on("whatsapp_connected", (msg) => {
        setWaState(WA_STATE.CONNECTED)
        setWaInfo({ chat_id: msg.chat_id || "", error: "" })
        setWaQr("")
      }),
      ws.on("whatsapp_disconnected", (msg) => {
        // "disconnected" is a transient network drop — the client reconnects
        // by itself and the session stays paired. Only a log-out or an
        // explicit disconnect ends the pairing.
        if (msg?.reason === "disconnected") {
          setWaState(s => (s === WA_STATE.CONNECTED ? WA_STATE.RECONNECTING : s))
          return
        }
        setWaState(WA_STATE.DISCONNECTED)
        setWaInfo({ chat_id: "", error: "" })
        setWaQr("")
      }),
      ws.on("discord_connected", (msg) => {
        setDcState(DC_STATE.CONNECTED)
        setDcInfo(prev => ({ ...prev, chat_id: msg.chat_id || prev.chat_id }))
        showSnackbar("Discord conectado , você receberá notificações aqui", "success")
      }),
      ws.on("slack_connected", (msg) => {
        setSlState(SL_STATE.CONNECTED)
        setSlInfo(prev => ({ ...prev, chat_id: msg.chat_id || prev.chat_id }))
        showSnackbar("Slack conectado , você receberá notificações aqui", "success")
      }),
    ]
    return () => { unsubs.forEach(fn => fn()) }
  }, [showSnackbar])

  const handleConnect = async () => {
    if (!botToken.trim()) {
      showSnackbar("Cole primeiro o token do seu bot", "warning")
      return
    }
    setSaving(true)
    setTgState(STATE.CONNECTING)
    try {
      const { data } = await http.post("/api/messaging/telegram/connect", { bot_token: botToken.trim() })
      setTgInfo({
        bot_username: data.bot_username || "",
        bot_url: data.bot_url || (data.bot_username ? `https://t.me/${data.bot_username}` : ""),
        chat_id: data.chat_id || "",
        pair_code: data.pair_code || "",
      })
      setTgState(data.chat_id ? STATE.CONNECTED : STATE.AWAITING_START)
      setBotToken("")
      showSnackbar(
        data.chat_id ? "Telegram conectado" : "Bot pronto , abra ele e toque em Iniciar para vincular sua conta",
        "success",
      )
    } catch (e) {
      setTgState(STATE.DISCONNECTED)
      showSnackbar(e.response?.data?.detail || "Falha na conexão", "error")
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await http.post("/api/messaging/telegram/disconnect")
      setTgState(STATE.DISCONNECTED)
      setTgInfo({ bot_username: "", bot_url: "", chat_id: "", pair_code: "" })
      showSnackbar("Telegram desconectado", "info")
    } catch (e) {
      showSnackbar(e.response?.data?.detail || "Falha ao desconectar", "error")
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      await http.post("/api/messaging/telegram/test")
      showSnackbar("Mensagem de teste enviada , verifique o Telegram", "success")
    } catch (e) {
      showSnackbar(e.response?.data?.detail || "Teste falhou , vincule o bot à sua conta primeiro", "error")
    } finally {
      setTesting(false)
    }
  }

  const handleWAConnect = async () => {
    setWaSaving(true)
    setWaQr("")
    try {
      await http.post("/api/messaging/whatsapp/connect")
      setWaState(WA_STATE.PAIRING)
      showSnackbar("Gerando código QR , escaneie pelo seu celular", "info")
    } catch (e) {
      setWaState(WA_STATE.DISCONNECTED)
      showSnackbar(e.response?.data?.detail || "Falha na conexão com WhatsApp", "error")
    } finally {
      setWaSaving(false)
    }
  }

  const handleWADisconnect = async () => {
    try {
      await http.post("/api/messaging/whatsapp/disconnect")
      setWaState(WA_STATE.DISCONNECTED)
      setWaInfo({ chat_id: "", error: "" })
      setWaQr("")
      showSnackbar("WhatsApp desconectado", "info")
    } catch (e) {
      showSnackbar(e.response?.data?.detail || "Falha ao desconectar", "error")
    }
  }

  const handleWATest = async () => {
    setWaTesting(true)
    try {
      await http.post("/api/messaging/whatsapp/test")
      showSnackbar("Mensagem de teste enviada , verifique o WhatsApp", "success")
    } catch (e) {
      showSnackbar(e.response?.data?.detail || "Teste falhou , o WhatsApp está pareado?", "error")
    } finally {
      setWaTesting(false)
    }
  }

  const handleDCConnect = async () => {
    if (!dcToken.trim()) {
      showSnackbar("Cole primeiro o token do seu bot do Discord", "warning")
      return
    }
    setDcSaving(true)
    setDcState(DC_STATE.CONNECTING)
    try {
      const { data } = await http.post("/api/messaging/discord/connect", { bot_token: dcToken.trim() })
      setDcInfo({
        bot_username: data.bot_username || "",
        bot_invite_url: data.bot_invite_url || "",
        chat_id: data.chat_id || "",
        error: "",
        pair_code: data.pair_code || "",
      })
      setDcState(data.chat_id ? DC_STATE.CONNECTED : DC_STATE.AWAITING_DM)
      setDcToken("")
      showSnackbar(
        data.chat_id ? "Discord conectado" : "Bot online , envie o código de pareamento por mensagem direta para concluir a configuração",
        "success",
      )
    } catch (e) {
      setDcState(DC_STATE.DISCONNECTED)
      showSnackbar(e.response?.data?.detail || "Falha na conexão com Discord", "error")
    } finally {
      setDcSaving(false)
    }
  }

  const handleDCDisconnect = async () => {
    try {
      await http.post("/api/messaging/discord/disconnect")
      setDcState(DC_STATE.DISCONNECTED)
      setDcInfo({ bot_username: "", bot_invite_url: "", chat_id: "", error: "" })
      showSnackbar("Discord desconectado", "info")
    } catch (e) {
      showSnackbar(e.response?.data?.detail || "Falha ao desconectar", "error")
    }
  }

  const handleDCTest = async () => {
    setDcTesting(true)
    try {
      await http.post("/api/messaging/discord/test")
      showSnackbar("Mensagem de teste enviada , verifique o Discord", "success")
    } catch (e) {
      showSnackbar(e.response?.data?.detail || "Teste falhou , envie o código de pareamento por mensagem direta para o seu bot primeiro", "error")
    } finally {
      setDcTesting(false)
    }
  }

  const handleSLConnect = async () => {
    if (!slBotToken.trim() || !slAppToken.trim()) {
      showSnackbar("Cole tanto o token do bot (xoxb-) quanto o token de nível de aplicativo (xapp-)", "warning")
      return
    }
    setSlSaving(true)
    setSlState(SL_STATE.CONNECTING)
    try {
      const { data } = await http.post("/api/messaging/slack/connect", {
        bot_token: slBotToken.trim(),
        app_token: slAppToken.trim(),
      })
      setSlInfo({
        bot_user_id: data.bot_user_id || "",
        team_name: data.team_name || "",
        chat_id: data.chat_id || "",
        error: "",
        pair_code: data.pair_code || "",
      })
      setSlState(data.chat_id ? SL_STATE.CONNECTED : SL_STATE.AWAITING_DM)
      setSlBotToken("")
      setSlAppToken("")
      showSnackbar(
        data.chat_id ? "Slack conectado" : "Bot online , envie o código de pareamento por mensagem direta para concluir a configuração",
        "success",
      )
    } catch (e) {
      setSlState(SL_STATE.DISCONNECTED)
      showSnackbar(e.response?.data?.detail || "Falha na conexão com Slack", "error")
    } finally {
      setSlSaving(false)
    }
  }

  const handleSLDisconnect = async () => {
    try {
      await http.post("/api/messaging/slack/disconnect")
      setSlState(SL_STATE.DISCONNECTED)
      setSlInfo({ bot_user_id: "", team_name: "", chat_id: "", error: "" })
      showSnackbar("Slack desconectado", "info")
    } catch (e) {
      showSnackbar(e.response?.data?.detail || "Falha ao desconectar", "error")
    }
  }

  const handleSLTest = async () => {
    setSlTesting(true)
    try {
      await http.post("/api/messaging/slack/test")
      showSnackbar("Mensagem de teste enviada , verifique o Slack", "success")
    } catch (e) {
      showSnackbar(e.response?.data?.detail || "Teste falhou , envie o código de pareamento por mensagem direta para o seu bot primeiro", "error")
    } finally {
      setSlTesting(false)
    }
  }

  const statusChip = () => {
    if (tgState === STATE.CONNECTED) return <Chip icon={<CheckCircleIcon />} label={"Conectado"} color="success" size="small" />
    if (tgState === STATE.AWAITING_START) return <Chip label={"Precisa de pareamento"} color="warning" size="small" />
    if (tgState === STATE.RECONNECTING) return <Chip label={"Reconectando…"} color="warning" size="small" />
    if (tgState === STATE.CONNECTING) return <Chip label={"Conectando…"} size="small" />
    return <Chip label={"Não conectado"} size="small" />
  }

  const waStatusChip = () => {
    if (waState === WA_STATE.CONNECTED) return <Chip icon={<CheckCircleIcon />} label={"Conectado"} color="success" size="small" />
    if (waState === WA_STATE.PAIRING) return <Chip label={"Escanear código QR"} color="warning" size="small" />
    if (waState === WA_STATE.RECONNECTING) return <Chip label={"Reconectando…"} color="warning" size="small" />
    if (waState === WA_STATE.UNAVAILABLE) return <Chip label={"Indisponível"} size="small" />
    return <Chip label={"Não conectado"} size="small" />
  }

  const dcStatusChip = () => {
    if (dcState === DC_STATE.CONNECTED) return <Chip icon={<CheckCircleIcon />} label={"Conectado"} color="success" size="small" />
    if (dcState === DC_STATE.AWAITING_DM) return <Chip label={"Precisa de pareamento"} color="warning" size="small" />
    if (dcState === DC_STATE.RECONNECTING) return <Chip label={"Reconectando…"} color="warning" size="small" />
    if (dcState === DC_STATE.CONNECTING) return <Chip label={"Conectando…"} size="small" />
    if (dcState === DC_STATE.UNAVAILABLE) return <Chip label={"Indisponível"} size="small" />
    return <Chip label={"Não conectado"} size="small" />
  }

  const slStatusChip = () => {
    if (slState === SL_STATE.CONNECTED) return <Chip icon={<CheckCircleIcon />} label={"Conectado"} color="success" size="small" />
    if (slState === SL_STATE.AWAITING_DM) return <Chip label={"Precisa de pareamento"} color="warning" size="small" />
    if (slState === SL_STATE.CONNECTING) return <Chip label={"Conectando…"} size="small" />
    if (slState === SL_STATE.UNAVAILABLE) return <Chip label={"Indisponível"} size="small" />
    return <Chip label={"Não conectado"} size="small" />
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── Header ────────────────────────────────────────── */}
      <Box sx={{
        px: 3, py: 2, flexShrink: 0,
        borderBottom: 1, borderColor: "divider",
        background: (t) => t.palette.mode === "dark"
          ? "linear-gradient(135deg, rgba(88,101,242,0.12) 0%, rgba(30,28,26,1) 100%)"
          : "linear-gradient(135deg, rgba(88,101,242,0.08) 0%, rgba(255,255,255,1) 100%)",
      }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <PhoneIphoneIcon sx={{ color: "#5865F2", fontSize: 26 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: -0.3 }}>
              Mensagens
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Conecte um aplicativo de mensagens para controlar o Decupa Viral pelo seu celular e receber notificações de tarefas
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* ── Scrollable content ───────────────────────────── */}
      <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, md: 3 } }}>
      {loading ? (
        <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      ) : (
      <Grid container spacing={3} alignItems="stretch">
      {/* Telegram */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
      <Card sx={{ width: "100%", display: "flex", flexDirection: "column" }}>
        <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
            <TelegramIcon sx={{ fontSize: 32, color: "#229ED9" }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Telegram</Typography>
              <Typography variant="caption" color="text.secondary">
                Chat bidirecional com seu planejador Decupa Viral e notificações de tarefas
              </Typography>
            </Box>
            {statusChip()}
          </Stack>

          <Divider sx={{ my: 2 }} />

          {(tgState === STATE.CONNECTED || tgState === STATE.RECONNECTING) && (
            <Stack spacing={2}>
              {tgState === STATE.RECONNECTING ? <ReconnectingNote /> : (
              <Alert severity="success" variant="outlined">
                Conectado a{" "}
                {tgInfo.bot_url ? (
                  <Link href={tgInfo.bot_url} target="_blank" rel="noreferrer" sx={{ fontWeight: 600 }}>
                    @{tgInfo.bot_username}
                  </Link>
                ) : (
                  <strong>@{tgInfo.bot_username}</strong>
                )}
                . Envie qualquer mensagem para seu bot para conversar com o planejador.
              </Alert>
              )}
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="contained"
                  startIcon={testing ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                  onClick={handleTest}
                  disabled={testing}
                >
                  Enviar mensagem de teste
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<LogoutIcon />}
                  onClick={handleDisconnect}
                >
                  Desconectar
                </Button>
              </Stack>
            </Stack>
          )}

          {tgState === STATE.AWAITING_START && (
            <Stack spacing={2}>
              <Alert severity="info" variant="outlined" icon={false}>
                <Stack spacing={1.25}>
                  <Typography variant="body2">
                    Bot pronto. Abra{" "}
                    {tgInfo.bot_url ? (
                      <Link href={tgInfo.bot_url} target="_blank" rel="noreferrer" sx={{ fontWeight: 600 }}>
                        @{tgInfo.bot_username}
                      </Link>
                    ) : (
                      <strong>seu bot</strong>
                    )}
                    {" "}no Telegram e toque em <strong>Start</strong> , o link carrega seu código
                    de pareamento, então esse único toque vincula o bot à sua conta. Se o Telegram não mostrar um
                    botão Start, envie este código para o bot:
                  </Typography>
                  <PairCode code={tgInfo.pair_code} />
                  <Typography variant="caption" color="text.secondary">{PRIVATE_NOTE}</Typography>
                </Stack>
              </Alert>
              <Stack direction="row" spacing={1.5}>
                <Button variant="outlined" onClick={fetchStatus}>Atualizar status</Button>
                <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={handleDisconnect}>
                  Cancelar
                </Button>
              </Stack>
            </Stack>
          )}

          {(tgState === STATE.DISCONNECTED || tgState === STATE.CONNECTING) && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Crie um bot via{" "}
                <Link href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</Link>
                {" "}no Telegram (envie <code>/newbot</code>), depois cole o token do bot abaixo.
              </Typography>
              <TextField
                label={"Token do bot"}
                type="password"
                fullWidth
                size="small"
                placeholder={"123456789:ABCdef..."}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                disabled={saving}
                autoComplete="off"
              />
              <Box>
                <Button
                  variant="contained"
                  onClick={handleConnect}
                  disabled={saving || !botToken.trim()}
                  startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  {saving ? "Conectando…" : "Conectar"}
                </Button>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>
      </Grid>

      {/* WhatsApp */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
      <Card sx={{ width: "100%", display: "flex", flexDirection: "column" }}>
        <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
            <WhatsAppIcon sx={{ fontSize: 32, color: "#25D366" }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>WhatsApp</Typography>
              <Typography variant="caption" color="text.secondary">
                Chat bidirecional + notificações via pareamento de dispositivo por leitura de QR code
              </Typography>
            </Box>
            {waStatusChip()}
          </Stack>

          <Divider sx={{ my: 2 }} />

          {waState === WA_STATE.UNAVAILABLE && (
            <Alert severity="warning" variant="outlined">
              O suporte ao WhatsApp requer o pacote Python <code>neonize</code> , que inclui uma
              biblioteca nativa. Instale as dependências com <code>pip install -r requirements.txt</code>,
              depois reinicie o app.
              {waInfo.error && (
                <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.8 }}>
                  Detalhes: {waInfo.error}
                </Typography>
              )}
            </Alert>
          )}

          {(waState === WA_STATE.CONNECTED || waState === WA_STATE.RECONNECTING) && (
            <Stack spacing={2}>
              {waState === WA_STATE.RECONNECTING ? <ReconnectingNote /> : (
              <Alert severity="success" variant="outlined">
                WhatsApp pareado. Para conversar com o planejador, escreva na sua própria conversa de <strong>Mensagem
                para si mesmo</strong> ; as notificações de tarefas também chegam lá. Mensagens em qualquer outro
                chat nunca são lidas.
              </Alert>
              )}
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="contained"
                  startIcon={waTesting ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                  onClick={handleWATest}
                  disabled={waTesting}
                  sx={{ bgcolor: "#25D366", "&:hover": { bgcolor: "#128C7E" } }}
                >
                  Enviar mensagem de teste
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<LogoutIcon />}
                  onClick={handleWADisconnect}
                >
                  Desconectar
                </Button>
              </Stack>
            </Stack>
          )}

          {(waState === WA_STATE.DISCONNECTED || waState === WA_STATE.PAIRING) && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Receba alertas de busca, download e upload no WhatsApp , e converse com o Decupa Viral
                direto do seu celular. Pareia em segundos, igual ao WhatsApp Web.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Clique em Conectar para gerar um QR code, depois abra WhatsApp → Configurações → Dispositivos
                Conectados → Conectar um dispositivo para escaneá-lo.
              </Typography>
              <Box>
                <Button
                  variant="contained"
                  startIcon={
                    (waSaving || waState === WA_STATE.PAIRING)
                      ? <CircularProgress size={16} color="inherit" />
                      : <QrCodeIcon />
                  }
                  onClick={handleWAConnect}
                  disabled={waSaving || waState === WA_STATE.PAIRING}
                  sx={{ bgcolor: "#25D366", "&:hover": { bgcolor: "#128C7E" } }}
                >
                  {waState === WA_STATE.PAIRING
                    ? "Aguardando leitura…"
                    : waSaving ? "Gerando QR…" : "Conectar WhatsApp"}
                </Button>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>
      </Grid>

      {/* Discord */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
      <Card sx={{ width: "100%", display: "flex", flexDirection: "column" }}>
        <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
            <ChatBubbleIcon sx={{ fontSize: 32, color: "#5865F2" }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Discord</Typography>
              <Typography variant="caption" color="text.secondary">
                Envie uma DM para seu bot para conversar com o planejador e receber notificações de tarefas
              </Typography>
            </Box>
            {dcStatusChip()}
          </Stack>

          <Divider sx={{ my: 2 }} />

          {dcState === DC_STATE.UNAVAILABLE && (
            <Alert severity="warning" variant="outlined">
              O suporte ao Discord requer o pacote Python <code>discord.py</code> . Instale
              as dependências com <code>pip install -r requirements.txt</code>, depois reinicie o app.
              {dcInfo.error && (
                <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.8 }}>
                  Detalhes: {dcInfo.error}
                </Typography>
              )}
            </Alert>
          )}

          {(dcState === DC_STATE.CONNECTED || dcState === DC_STATE.RECONNECTING) && (
            <Stack spacing={2}>
              {dcState === DC_STATE.RECONNECTING ? <ReconnectingNote /> : (
              <Alert severity="success" variant="outlined">
                Conectado como <strong>{dcInfo.bot_username}</strong>. Envie uma DM para seu bot no Discord para
                conversar com o planejador , as notificações chegam na mesma conversa.
              </Alert>
              )}
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="contained"
                  startIcon={dcTesting ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                  onClick={handleDCTest}
                  disabled={dcTesting}
                  sx={{ bgcolor: "#5865F2", "&:hover": { bgcolor: "#4752C4" } }}
                >
                  Enviar mensagem de teste
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<LogoutIcon />}
                  onClick={handleDCDisconnect}
                >
                  Desconectar
                </Button>
              </Stack>
            </Stack>
          )}

          {dcState === DC_STATE.AWAITING_DM && (
            <Stack spacing={2}>
              <Alert severity="info" variant="outlined" icon={false}>
                <Stack spacing={1.25}>
                  <Typography variant="body2">
                    Bot online como <strong>{dcInfo.bot_username}</strong>.
                    {dcInfo.bot_invite_url && (
                      <>
                        {" "}
                        <Link href={dcInfo.bot_invite_url} target="_blank" rel="noreferrer" sx={{ fontWeight: 600 }}>
                          Convide-o para um servidor
                        </Link>
                        {" "}se ainda não fez isso, depois
                      </>
                    )}
                    {" "}envie ao bot este código de pareamento por DM:
                  </Typography>
                  <PairCode code={dcInfo.pair_code} />
                  <Typography variant="caption" color="text.secondary">{PRIVATE_NOTE}</Typography>
                </Stack>
              </Alert>
              <Stack direction="row" spacing={1.5}>
                <Button variant="outlined" onClick={fetchStatus}>Atualizar status</Button>
                <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={handleDCDisconnect}>
                  Cancelar
                </Button>
              </Stack>
            </Stack>
          )}

          {(dcState === DC_STATE.DISCONNECTED || dcState === DC_STATE.CONNECTING) && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Crie um bot em{" "}
                <Link href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
                  discord.com/developers/applications
                </Link>
                {" "}, clique em <strong>New Application</strong> → <strong>Bot</strong> → copie o token e cole abaixo.
                DMs funcionam sem nenhum privileged intent.
              </Typography>
              <TextField
                label={"Token do bot"}
                type="password"
                fullWidth
                size="small"
                placeholder={"MTI..."}
                value={dcToken}
                onChange={(e) => setDcToken(e.target.value)}
                disabled={dcSaving}
                autoComplete="off"
              />
              <Box>
                <Button
                  variant="contained"
                  onClick={handleDCConnect}
                  disabled={dcSaving || !dcToken.trim()}
                  startIcon={dcSaving ? <CircularProgress size={16} color="inherit" /> : null}
                  sx={{ bgcolor: "#5865F2", "&:hover": { bgcolor: "#4752C4" } }}
                >
                  {dcSaving ? "Conectando…" : "Conectar"}
                </Button>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>
      </Grid>

      {/* Slack */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
      <Card sx={{ width: "100%", display: "flex", flexDirection: "column" }}>
        <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
            <TagIcon sx={{ fontSize: 32, color: "#611F69" }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Slack</Typography>
              <Typography variant="caption" color="text.secondary">
                Socket Mode , sem necessidade de URL pública. Envie uma DM para seu bot para conversar e receber notificações.
              </Typography>
            </Box>
            {slStatusChip()}
          </Stack>

          <Divider sx={{ my: 2 }} />

          {slState === SL_STATE.UNAVAILABLE && (
            <Alert severity="warning" variant="outlined">
              O suporte ao Slack requer o <code>slack-sdk</code> . Instale
              as dependências com <code>pip install -r requirements.txt</code>, depois reinicie o app.
              {slInfo.error && (
                <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.8 }}>
                  Detalhes: {slInfo.error}
                </Typography>
              )}
            </Alert>
          )}

          {slState === SL_STATE.CONNECTED && (
            <Stack spacing={2}>
              <Alert severity="success" variant="outlined">
                Conectado ao <strong>{slInfo.team_name || "seu workspace do Slack"}</strong>. Envie
                uma DM para seu bot no Slack para conversar com o planejador , as notificações chegam na mesma conversa.
              </Alert>
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="contained"
                  startIcon={slTesting ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                  onClick={handleSLTest}
                  disabled={slTesting}
                  sx={{ bgcolor: "#611F69", "&:hover": { bgcolor: "#4A154B" } }}
                >
                  Enviar mensagem de teste
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<LogoutIcon />}
                  onClick={handleSLDisconnect}
                >
                  Desconectar
                </Button>
              </Stack>
            </Stack>
          )}

          {slState === SL_STATE.AWAITING_DM && (
            <Stack spacing={2}>
              <Alert severity="info" variant="outlined" icon={false}>
                <Stack spacing={1.25}>
                  <Typography variant="body2">
                    Bot online{slInfo.team_name ? (" em " + String(slInfo.team_name) + "") : ""}. Abra o Slack, encontre
                    seu bot na barra lateral e envie esta DM com o código de pareamento:
                  </Typography>
                  <PairCode code={slInfo.pair_code} />
                  <Typography variant="caption" color="text.secondary">{PRIVATE_NOTE}</Typography>
                </Stack>
              </Alert>
              <Stack direction="row" spacing={1.5}>
                <Button variant="outlined" onClick={fetchStatus}>Atualizar status</Button>
                <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={handleSLDisconnect}>
                  Cancelar
                </Button>
              </Stack>
            </Stack>
          )}

          {(slState === SL_STATE.DISCONNECTED || slState === SL_STATE.CONNECTING) && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Crie um app do Slack em{" "}
                <Link href="https://api.slack.com/apps" target="_blank" rel="noreferrer">api.slack.com/apps</Link>.
                Ative o <strong>Socket Mode</strong>, gere um app-level token com{" "}
                <code>connections:write</code>, e instale o bot no seu workspace com os escopos{" "}
                <code>chat:write</code>, <code>im:history</code>, <code>im:read</code>,{" "}
                <code>im:write</code>, <code>users:read</code>. Depois, inscreva-se no evento{" "}
                <code>message.im</code> .
              </Typography>
              <TextField
                label={"Token do bot (xoxb-…)"}
                type="password"
                fullWidth
                size="small"
                placeholder={"xoxb-..."}
                value={slBotToken}
                onChange={(e) => setSlBotToken(e.target.value)}
                disabled={slSaving}
                autoComplete="off"
              />
              <TextField
                label={"Token no nível do app (xapp-…)"}
                type="password"
                fullWidth
                size="small"
                placeholder={"xapp-..."}
                value={slAppToken}
                onChange={(e) => setSlAppToken(e.target.value)}
                disabled={slSaving}
                autoComplete="off"
              />
              <Box>
                <Button
                  variant="contained"
                  onClick={handleSLConnect}
                  disabled={slSaving || !slBotToken.trim() || !slAppToken.trim()}
                  startIcon={slSaving ? <CircularProgress size={16} color="inherit" /> : null}
                  sx={{ bgcolor: "#611F69", "&:hover": { bgcolor: "#4A154B" } }}
                >
                  {slSaving ? "Conectando…" : "Conectar"}
                </Button>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>
      </Grid>
      </Grid>
      )}
      </Box>{/* end scrollable content */}

      {/* QR code dialog — opens on top without altering the page layout */}
      <Dialog
        open={waState === WA_STATE.PAIRING}
        onClose={handleWADisconnect}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pr: 6 }}>
          Escaneie para parear o WhatsApp
          <IconButton
            onClick={handleWADisconnect}
            size="small"
            sx={{ position: "absolute", right: 8, top: 8 }}
            aria-label={"Fechar"}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
              No seu celular, abra <strong>WhatsApp → Configurações → Dispositivos conectados → Conectar um dispositivo</strong>,
              depois escaneie este código.
            </Typography>
            {waQr ? (
              <Box sx={{ p: 2, bgcolor: "#fff", borderRadius: 2, boxShadow: 1 }}>
                <QRCodeCanvas value={waQr} size={240} level="M" includeMargin={false} />
              </Box>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 6 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">Aguardando o código QR…</Typography>
              </Box>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
              O código é atualizado automaticamente. Esta janela fecha quando o pareamento for concluído.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleWADisconnect} color="error" startIcon={<LogoutIcon />}>
            Cancelar pareamento
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
