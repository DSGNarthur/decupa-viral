import { useState, useEffect } from "react"
import {
  Box, Stack, Typography, Alert, TextField, Button, FormControl, InputLabel,
  Select, MenuItem, IconButton, InputAdornment, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions,
} from "@mui/material"
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined"
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined"
import SaveIcon from "@mui/icons-material/SaveOutlined"
import EditIcon from "@mui/icons-material/EditOutlined"
import DeleteIcon from "@mui/icons-material/DeleteOutlineOutlined"
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline"
import http from "../../api/http"
import useAppStore from "../../store/appStore"

const BROWSER = import.meta.env.VITE_BROWSER_RUNTIME === 'true'
const PROVIDER_LABEL = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  openrouter: "OpenRouter (Claude / GPT / Gemini / Llama)",
  openai_compatible: BROWSER ? 'DeepSeek ou API compatível' : "Compatível com OpenAI (Ollama, LM Studio, vLLM, …)",
}

// Any server that speaks OpenAI's /chat/completions, at a URL the user gives.
const COMPATIBLE = "openai_compatible"
const requiresKey = value => {
  try { return !['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname) } catch { return true }
}

const KEY_PLACEHOLDER = {
  anthropic: "sk-ant-...",
  openai: "sk-...",
  openrouter: "sk-or-...",
  openai_compatible: "Opcional , servidores locais geralmente não precisam de nenhuma",
}

const KEY_HINT = {
  anthropic: "Obtenha a sua em console.anthropic.com → API Keys",
  openai: "Obtenha a sua em platform.openai.com → API Keys",
  openrouter: "Uma chave, todos os modelos , obtenha a sua em openrouter.ai/keys",
  openai_compatible: "Apenas se o seu servidor exigir uma (DeepSeek, Groq, um gateway…)",
}

export default function AIProviderSection({ settings, updateSettings }) {
  const showSnackbar = useAppStore((s) => s.showSnackbar)

  const [provider, setProvider] = useState(settings?.ai_provider || "openai")
  const [model, setModel] = useState(settings?.ai_model || "")
  const [baseUrl, setBaseUrl] = useState(settings?.ai_base_url || "")
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [registry, setRegistry] = useState({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const isConfigured = (s) =>
    !!s?.ai_api_key_set || (s?.ai_provider === COMPATIBLE && !!s?.ai_base_url && !!s?.ai_model && !requiresKey(s.ai_base_url))
  const [editing, setEditing] = useState(!isConfigured(settings))
  const [confirmRemove, setConfirmRemove] = useState(false)

  // Sync local state when settings change (e.g. after save).
  // If no key is set (cleared elsewhere or never set), force into edit mode
  // so the form is visible. handleSave / handleRemove own toggling out.
  useEffect(() => {
    if (settings) {
      setProvider(settings.ai_provider || "openai")
      setModel(settings.ai_model || "")
      setBaseUrl(settings.ai_base_url || "")
      if (!isConfigured(settings)) setEditing(true)
    }
  }, [settings?.ai_provider, settings?.ai_model, settings?.ai_api_key_set, settings?.ai_base_url])

  // Fetch model registry once
  useEffect(() => {
    http.get("/api/config/model_registry")
      .then(({ data }) => setRegistry(data?.value || {}))
      .catch(() => {})
  }, [])

  const availableModels = registry[provider]?.models || []
  const defaultModel = registry[provider]?.default_model || ""
  const effectiveModel = model || defaultModel
  const compatible = provider === COMPATIBLE
  const keyRequired = BROWSER || !compatible || requiresKey(baseUrl)
  const testConnection = async () => {
    setTesting(true)
    try { await http.post('/api/settings/test-ai'); showSnackbar('A IA respondeu ao teste de conexão.', 'success') }
    catch (error) { showSnackbar(error.response?.data?.detail || 'Não foi possível testar a IA.', 'error') }
    finally { setTesting(false) }
  }

  const handleSave = async () => {
    const hasNewKey = apiKey.trim().length > 0
    if (compatible) {
      if (!baseUrl.trim() || !model.trim()) {
        showSnackbar("Insira a URL base do servidor e um nome de modelo", "warning")
        return
      }
      if (keyRequired && !hasNewKey && !settings?.ai_api_key_set) {
        showSnackbar('Insira a chave da API do provedor antes de salvar.', 'warning')
        return
      }
    } else if (!hasNewKey && !settings?.ai_api_key_set) {
      showSnackbar("Cole a sua chave de API primeiro", "warning")
      return
    }
    setSaving(true)
    try {
      // Always send the model that's actually displayed in the dropdown.
      // If the user switched providers, `model` was reset to "" and `effectiveModel`
      // resolves to the new provider's default — that's what they saw and what we save.
      const updates = {
        ai_provider: provider,
        ai_model: (compatible ? model.trim() : effectiveModel) || "",  // empty string clears stale model
      }
      if (compatible) updates.ai_base_url = baseUrl.trim()
      if (hasNewKey) {
        updates.ai_api_key = apiKey.trim()
      }
      await updateSettings(updates)
      setApiKey("")
      setEditing(false)
      showSnackbar(hasNewKey ? "Chave de API salva" : compatible ? "Servidor salvo" : "Provedor atualizado", "success")
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
      await updateSettings(
        settings?.ai_provider === COMPATIBLE
          ? { ai_api_key: "", ai_base_url: "" }
          : { ai_api_key: "" },
      )
      setApiKey("")
      setEditing(true)
      showSnackbar(BROWSER ? 'Chave removida deste navegador.' : "Provedor removido, voltando para .env (se configurado)", "info")
    } catch (e) {
      // handled in updateSettings
    } finally {
      setSaving(false)
    }
  }

  const keyIsSet = !!settings?.ai_api_key_set

  // ── Connected state: key already configured, not editing ────────────────────
  if (!editing && isConfigured(settings)) {
    return (
      <Stack spacing={2}>
        <Alert
          severity="success"
          variant="outlined"
          icon={<CheckCircleIcon fontSize="small" />}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {BROWSER ? 'Provedor de IA configurado neste navegador' : settings.ai_provider === COMPATIBLE ? "Seu próprio servidor de IA configurado" : "Chave de API pessoal configurada"}
            </Typography>
            <Chip
              size="small"
              label={PROVIDER_LABEL[settings.ai_provider] || settings.ai_provider}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 500 }}
            />
            {settings.ai_model && (
              <Chip
                size="small"
                label={("Modelo: " + String(settings.ai_model) + "")}
                variant="outlined"
              />
            )}
            {settings.ai_provider === COMPATIBLE && settings.ai_base_url && (
              <Chip
                size="small"
                label={settings.ai_base_url}
                variant="outlined"
                sx={{ maxWidth: "100%" }}
              />
            )}
          </Stack>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.75 }}>
            {BROWSER ? 'Chave cifrada neste navegador. Ao usar IA, ela é enviada por HTTPS à API desta plataforma na Vercel, que encaminha a chamada ao provedor escolhido.' : 'Armazenada criptografada na sua máquina. Enviada ao provedor ao conversar ou gerar.'}
          </Typography>
        </Alert>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => { setEditing(true); setApiKey("") }}
            disabled={saving}
          >
            Atualizar
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setConfirmRemove(true)}
            disabled={saving}
          >
            Remover
          </Button>
          {import.meta.env.VITE_BROWSER_RUNTIME === 'true' && <Button variant="outlined" onClick={testConnection} disabled={testing}>
            {testing ? 'Testando…' : 'Testar conexão'}
          </Button>}
        </Stack>

        <Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{settings.ai_provider === COMPATIBLE ? "Remover este servidor?" : "Remover chave de API?"}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              {BROWSER ? 'Isso remove a chave deste navegador. Os recursos de IA precisam de uma chave configurada para funcionar.' : <>Isso exclui a {settings.ai_provider === COMPATIBLE ? "URL do servidor e qualquer" : "criptografada"} chave
              do seu banco de dados local. O Decupa Viral voltará para o provedor configurado no
              seu <code>.env</code> arquivo (se houver). Se nenhum estiver configurado, os recursos de IA pararão
              de funcionar até que você configure um novamente.</>}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmRemove(false)}>Cancelar</Button>
            <Button color="error" variant="contained" onClick={handleRemove}>
              {settings.ai_provider === COMPATIBLE ? "Remover servidor" : "Remover chave"}
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    )
  }

  // ── Editing state: form for provider/model/key ──────────────────────────────
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {BROWSER ? 'Use sua chave do DeepSeek ou outra API compatível. A chave fica cifrada neste navegador e passa pela API desta plataforma na Vercel ao chamar o provedor. A chave salva no aplicativo do PC não é transferida para este site.' : <>Traga sua própria chave de API da Anthropic, OpenAI ou OpenRouter , ou aponte o Decupa Viral para qualquer
        servidor compatível com OpenAI (Ollama, LM Studio, vLLM, DeepSeek, Groq…). As chaves são criptografadas
        (AES-256) antes do armazenamento e nunca saem da sua máquina, exceto ao chamar o provedor
        diretamente. OpenRouter é um gateway unificado , uma chave, acesso a Claude / GPT / Gemini / Llama.</>}
      </Typography>

      <FormControl size="small" fullWidth>
        <InputLabel>Provedor</InputLabel>
        <Select
          value={provider}
          label={"Provedor"}
          onChange={(e) => { setProvider(e.target.value); setModel("") }}
          disabled={saving}
        >
          {!BROWSER && <MenuItem value="anthropic">Anthropic (Claude)</MenuItem>}
          {!BROWSER && <MenuItem value="openai">OpenAI (GPT)</MenuItem>}
          {!BROWSER && <MenuItem value="openrouter">OpenRouter (Claude / GPT / Gemini / Llama)</MenuItem>}
          <MenuItem value={COMPATIBLE}>{PROVIDER_LABEL[COMPATIBLE]}</MenuItem>
        </Select>
      </FormControl>

      {compatible && (
        <TextField
          label={"URL base"}
          size="small"
          fullWidth
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={BROWSER ? 'https://api.deepseek.com' : 'http://localhost:11434/v1'}
          helperText={BROWSER ? 'Provedores aceitos: DeepSeek, OpenAI, OpenRouter, Groq e Together. Use HTTPS.' : "O endpoint compatível com OpenAI do servidor, geralmente terminando em /v1 (Ollama: http://localhost:11434/v1, LM Studio: http://localhost:1234/v1)"}
          disabled={saving}
          autoComplete="off"
        />
      )}

      {compatible ? (
        <TextField
          label={"Modelo"}
          size="small"
          fullWidth
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={BROWSER ? 'deepseek-flash' : "ex.: qwen3:14b, llama3.3, deepseek-chat"}
          helperText={BROWSER ? 'Informe o identificador do modelo aceito pela sua API.' : "Exatamente como o seu servidor o nomeia. Modelos locais menores podem ter dificuldade com as respostas estruturadas (JSON) que alguns recursos exigem."}
          disabled={saving}
          autoComplete="off"
        />
      ) : (
      <FormControl size="small" fullWidth>
        <InputLabel>Modelo</InputLabel>
        <Select
          value={effectiveModel}
          label={"Modelo"}
          onChange={(e) => setModel(e.target.value)}
          disabled={saving || availableModels.length === 0}
        >
          {availableModels.map((m) => (
            <MenuItem key={m} value={m}>
              {m}
              {m === defaultModel && (
                <Typography component="span" variant="caption" sx={{ ml: 1, color: "text.secondary" }}>
                  (padrão)
                </Typography>
              )}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      )}

      <TextField
        label={keyRequired ? "Chave da API" : "Chave da API (opcional)"}
        type={showKey ? "text" : "password"}
        size="small"
        fullWidth
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={keyIsSet ? "(deixe vazio para manter a chave existente)" : BROWSER ? 'Cole sua chave da API' : KEY_PLACEHOLDER[provider]}
        helperText={BROWSER ? 'Insira a chave aqui. Não envie sua chave na conversa.' : KEY_HINT[provider]}
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
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saving || (compatible ? !baseUrl.trim() || !model.trim() : !apiKey.trim() && !keyIsSet)}
        >
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        {isConfigured(settings) && (
          <Button
            variant="outlined"
            onClick={() => { setEditing(false); setApiKey("") }}
            disabled={saving}
          >
            Cancelar
          </Button>
        )}
      </Stack>
    </Stack>
  )
}
