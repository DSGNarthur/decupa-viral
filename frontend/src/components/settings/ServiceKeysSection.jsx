import { useState, useEffect } from "react"
import {
  Box, Stack, Typography, Alert, TextField, Button, IconButton, InputAdornment,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, Link,
} from "@mui/material"
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined"
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined"
import SaveIcon from "@mui/icons-material/SaveOutlined"
import EditIcon from "@mui/icons-material/EditOutlined"
import DeleteIcon from "@mui/icons-material/DeleteOutlineOutlined"
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline"
import YouTubeIcon from "@mui/icons-material/YouTube"
import useAppStore from "../../store/appStore"

/**
 * Generic per-service BYOK key card. Drop more entries into SERVICES below to
 * add Pexels / TikHub / etc. — the row keeps its own form state.
 */
const SERVICES = [
  {
    id: "youtube",
    label: "YouTube Data API",
    description: "Alimenta a busca no YouTube, o leitor de canais e a análise de comentários",
    icon: <YouTubeIcon sx={{ color: "#FF0000", fontSize: 28 }} />,
    settingsKey: "youtube_api_key",      // POST /api/settings field
    setFlag: "youtube_api_key_set",       // GET response flag (masked)
    placeholder: "AIzaSy...",
    docsHref: "https://console.cloud.google.com/apis/credentials",
    docsHint: "Get a free key at Google Cloud Console → Credentials → Create API key (10K units/day free)",
  },
  // To add more services later, append:
  // { id: "pexels", label: "Pexels API", description: "Stock footage", ...,
  //   settingsKey: "pexels_api_key", setFlag: "pexels_api_key_set", ... }
]

function ServiceKeyRow({ service, settings, updateSettings }) {
  const showSnackbar = useAppStore((s) => s.showSnackbar)
  const keyIsSet = !!settings?.[service.setFlag]

  const [editing, setEditing] = useState(!keyIsSet)
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  // When the parent's keyIsSet flips (e.g. another tab cleared the key),
  // jump back to edit mode so the form is shown. Don't yank the user OUT of
  // edit mode if a save just landed — handleSave() owns that transition.
  useEffect(() => {
    if (!keyIsSet) setEditing(true)
  }, [keyIsSet])

  const handleSave = async () => {
    const value = apiKey.trim()
    if (!value) {
      showSnackbar("Cole a sua chave de API primeiro", "warning")
      return
    }
    setSaving(true)
    try {
      await updateSettings({ [service.settingsKey]: value })
      setApiKey("")
      setEditing(false)
      showSnackbar(("Chave " + String(service.label) + " salva"), "success")
    } catch (e) {
      // updateSettings already shows a snackbar on error
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setConfirmRemove(false)
    setSaving(true)
    try {
      await updateSettings({ [service.settingsKey]: "" })
      setApiKey("")
      setEditing(true)
      showSnackbar(("Chave " + String(service.label) + " removida , voltando para .env (se configurado)"), "info")
    } catch (e) {
      // handled in updateSettings
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box
      sx={{
        p: 2,
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        "&:not(:last-of-type)": { mb: 2 },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
        {service.icon}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {service.label}
            </Typography>
            {keyIsSet && (
              <Chip
                size="small"
                color="success"
                variant="outlined"
                icon={<CheckCircleIcon fontSize="small" />}
                label={"chave definida"}
                sx={{ fontWeight: 500 }}
              />
            )}
          </Stack>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {service.description}
          </Typography>
        </Box>
      </Stack>

      {!editing && keyIsSet ? (
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<EditIcon />}
            onClick={() => { setEditing(true); setApiKey("") }}
            disabled={saving}
          >
            Atualizar
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<DeleteIcon />}
            onClick={() => setConfirmRemove(true)}
            disabled={saving}
          >
            Remover
          </Button>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <TextField
            type={showKey ? "text" : "password"}
            size="small"
            fullWidth
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={service.placeholder}
            helperText={
              <>
                {service.docsHint}{" "}
                <Link href={service.docsHref} target="_blank" rel="noreferrer">
                  abrir documentação
                </Link>
              </>
            }
            disabled={saving}
            autoComplete="off"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowKey((v) => !v)} edge="end" tabIndex={-1}>
                    {showKey ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              size="small"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
            >
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            {keyIsSet && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => { setEditing(false); setApiKey("") }}
                disabled={saving}
              >
                Cancelar
              </Button>
            )}
          </Stack>
        </Stack>
      )}

      <Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Remover {service.label} chave?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Isso exclui a chave criptografada do seu banco de dados local. O Decupa Viral voltará a usar
            a chave correspondente no seu arquivo <code>.env</code> (se definida). Os recursos que dependem
            deste serviço pararão de funcionar até você adicionar uma nova chave ou restaurar a do .env.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleRemove}>
            Remover chave
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default function ServiceKeysSection({ settings, updateSettings }) {
  return (
    <Stack spacing={0}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Chaves de API por serviço, criptografadas (AES-256) antes do armazenamento. Elas têm prioridade sobre as
        chaves no seu <code>.env</code> em tempo de execução.
      </Typography>
      {SERVICES.map((service) => (
        <ServiceKeyRow
          key={service.id}
          service={service}
          settings={settings}
          updateSettings={updateSettings}
        />
      ))}
    </Stack>
  )
}
