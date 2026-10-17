// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState, useEffect, useCallback } from "react"
import {
  Box, Typography, Button, Stack, Card, CardContent, Chip, TextField,
  CircularProgress, Alert, Link, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, IconButton, Tooltip, Tabs, Tab,
  InputAdornment,
} from "@mui/material"
import HubIcon from "@mui/icons-material/HubOutlined"
import ContentCopyIcon from "@mui/icons-material/ContentCopyOutlined"
import CheckIcon from "@mui/icons-material/Check"
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined"
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined"
import RefreshIcon from "@mui/icons-material/RefreshOutlined"
import SearchIcon from "@mui/icons-material/SearchOutlined"
import { Link as RouterLink } from "react-router-dom"
import http from "../api/http"
import useAppStore from "../store/appStore"
import useDocumentTitle from "../hooks/useDocumentTitle"
import PageHero from "../components/PageHero"

// The /mcp page: everything needed to connect an MCP client (Claude Code,
// Claude Desktop, Codex, Cursor, …) to this install — the endpoint, the
// Bearer token, a per-client config snippet, a live connection test, and the
// list of tools the server serves. Backed by backend/api/mcp_settings.py.

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      useAppStore.getState().showSnackbar("Couldn't copy — select the text and copy it by hand", "warning")
    }
  }
  return (
    <Tooltip title={copied ? "Copied" : label}>
      <IconButton size="small" onClick={copy} aria-label={label}>
        {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  )
}

function CodeBlock({ text }) {
  return (
    <Box sx={{ position: "relative" }}>
      <Box
        component="pre"
        sx={{
          m: 0, p: 2, pr: 6, borderRadius: 1, overflowX: "auto",
          bgcolor: "action.hover", border: 1, borderColor: "divider",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre",
        }}
      >
        {text}
      </Box>
      <Box sx={{ position: "absolute", top: 6, right: 6 }}>
        <CopyButton text={text} label="Copy snippet" />
      </Box>
    </Box>
  )
}

export default function Mcp() {
  useDocumentTitle("MCP")
  const showSnackbar = useAppStore((s) => s.showSnackbar)

  const [config, setConfig] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [showToken, setShowToken] = useState(false)
  const [clientTab, setClientTab] = useState(0)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [tools, setTools] = useState(null)
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    try {
      const { data } = await http.get("/api/settings/mcp")
      setConfig(data)
      setLoadError(null)
    } catch (e) {
      setLoadError(e.response?.data?.detail || e.message || "Couldn't load the MCP settings")
    }
  }, [])

  useEffect(() => {
    load()
    http.get("/api/settings/mcp/tools")
      .then(({ data }) => setTools(data.available ? data.tools : []))
      .catch(() => setTools([]))
  }, [load])

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // initialize + list_tools over the real transport can take a few
      // seconds on a cold start — longer than the default 30s is never needed.
      const { data } = await http.post("/api/settings/mcp/test", {}, { timeout: 30000 })
      setTestResult(data)
    } catch (e) {
      setTestResult({ ok: false, error: "Request failed", detail: e.message })
    } finally {
      setTesting(false)
    }
  }

  const rotate = async () => {
    setRotating(true)
    try {
      const { data } = await http.post("/api/settings/mcp/rotate")
      setConfig(data)
      setTestResult(null)
      showSnackbar("New token created — update your MCP client config with the new snippet", "success")
    } catch (e) {
      showSnackbar(`Couldn't rotate the token: ${e.message}`, "error")
    } finally {
      setRotating(false)
      setConfirmRotate(false)
    }
  }

  const clients = config?.clients || []
  const active = clients[clientTab]
  const q = query.trim().toLowerCase()
  const shownTools = (tools || []).filter(
    (t) => !q || t.name.toLowerCase().includes(q) || (t.summary || "").toLowerCase().includes(q),
  )

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHero
        icon={<HubIcon sx={{ fontSize: 22 }} />}
        title="MCP"
        subtitle="Drive ViralMint from Claude Code, Codex, Cursor and other AI agents"
      />

      <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, md: 3 } }}>
        <Stack spacing={3} sx={{ maxWidth: 960, mx: "auto" }}>
          {loadError && <Alert severity="error">{loadError}</Alert>}

          {!config && !loadError && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          )}

          {config && (
            <>
              {/* Connection */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    Connection
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    ViralMint serves the Model Context Protocol at the address below. Every request
                    must carry the token. Tools that use AI run on the provider keys you set
                    in <Link component={RouterLink} to="/settings">Settings</Link>.
                  </Typography>

                  <Stack spacing={2}>
                    <TextField
                      label="Endpoint"
                      size="small"
                      value={config.endpoint_url}
                      InputProps={{
                        readOnly: true,
                        sx: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 },
                        endAdornment: (
                          <InputAdornment position="end">
                            <CopyButton text={config.endpoint_url} label="Copy endpoint" />
                          </InputAdornment>
                        ),
                      }}
                    />
                    <TextField
                      label="Token"
                      size="small"
                      type={showToken ? "text" : "password"}
                      value={config.token}
                      InputProps={{
                        readOnly: true,
                        sx: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 },
                        endAdornment: (
                          <InputAdornment position="end">
                            <Tooltip title={showToken ? "Hide token" : "Show token"}>
                              <IconButton
                                size="small"
                                onClick={() => setShowToken((v) => !v)}
                                aria-label={showToken ? "Hide token" : "Show token"}
                              >
                                {showToken ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                            <CopyButton text={config.token} label="Copy token" />
                          </InputAdornment>
                        ),
                      }}
                    />

                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Button
                        variant="contained"
                        onClick={runTest}
                        disabled={testing}
                        startIcon={testing ? <CircularProgress size={16} color="inherit" /> : null}
                      >
                        {testing ? "Testing…" : "Test connection"}
                      </Button>
                      <Button
                        variant="outlined"
                        color="inherit"
                        startIcon={<RefreshIcon />}
                        onClick={() => setConfirmRotate(true)}
                      >
                        Rotate token
                      </Button>
                    </Stack>

                    {testResult && (
                      testResult.ok ? (
                        <Alert severity="success">
                          Connected — {testResult.tools_count} tools available.
                        </Alert>
                      ) : (
                        <Alert severity="error">
                          <strong>{testResult.error}</strong>
                          {testResult.detail ? ` — ${testResult.detail}` : ""}
                        </Alert>
                      )
                    )}
                  </Stack>
                </CardContent>
              </Card>

              {/* Client setup */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    Connect your client
                  </Typography>
                  <Tabs
                    value={clientTab}
                    onChange={(_, v) => setClientTab(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
                  >
                    {clients.map((c) => <Tab key={c.id} label={c.label} />)}
                  </Tabs>
                  {active && (
                    <Stack spacing={1.5}>
                      <Typography variant="body2" color="text.secondary">
                        {active.instructions}
                      </Typography>
                      <CodeBlock text={active.snippet} />
                      {active.docs_url && (
                        <Link href={active.docs_url} target="_blank" rel="noopener noreferrer" variant="body2">
                          {active.label} MCP documentation
                        </Link>
                      )}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Tools */}
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <Typography variant="subtitle1" fontWeight={600}>Tools</Typography>
                {tools && <Chip size="small" label={tools.length} />}
              </Stack>
              {tools === null ? (
                <CircularProgress size={22} />
              ) : tools.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  The MCP server isn't available in this install.
                </Typography>
              ) : (
                <>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search tools"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    sx={{ mb: 1.5 }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                      ),
                    }}
                  />
                  <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
                    {shownTools.map((t) => (
                      <Box key={t.name} sx={{ py: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 600 }}
                        >
                          {t.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">{t.summary}</Typography>
                      </Box>
                    ))}
                    {shownTools.length === 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        No tool matches “{query}”.
                      </Typography>
                    )}
                  </Stack>
                </>
              )}
            </CardContent>
          </Card>
        </Stack>
      </Box>

      <Dialog open={confirmRotate} onClose={() => !rotating && setConfirmRotate(false)}>
        <DialogTitle>Rotate the MCP token?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Every MCP client configured with the current token stops working until you paste
            the new snippet into it.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRotate(false)} disabled={rotating}>Cancel</Button>
          <Button onClick={rotate} color="warning" variant="contained" disabled={rotating}>
            {rotating ? "Rotating…" : "Rotate"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
