import React from "react"
import ReactDOM from "react-dom/client"
import { CssBaseline } from "@mui/material"
import App from "./App"
import ThemeWrapper from "./ThemeWrapper"
import CompanionConnect from './pages/CompanionConnect'
import { prepareCompanion } from './companion/session'
import { installTranslationGuard } from "./utils/translationGuard"
import './browser/fonts.css'

// Self-hosted Inter — replaces the previous fonts.googleapis.com link.
// Same files Google would have served, vendored through @fontsource so
// no third party sees a request for every page load. Weights match
// what theme.js asks for (300/400/500/600/700).
import "@fontsource/inter/300.css"
import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
import "@fontsource/inter/700.css"

// Before the first render: browser page-translation re-parents the text nodes
// React tracks, which otherwise crashes the app into the ErrorBoundary.
installTranslationGuard()

const root = ReactDOM.createRoot(document.getElementById('root'))

async function start({ interactive = false } = {}) {
  let connected = true, companionError = ''
  if (import.meta.env.VITE_COMPANION_RUNTIME === 'true') {
    root.render(<ThemeWrapper><CssBaseline /><p role="status" style={{ padding: 32 }}>Conectando ao processador deste PC. Permita o acesso à rede local se o navegador solicitar.</p></ThemeWrapper>)
    try { connected = await prepareCompanion({ interactive }) }
    catch (error) { connected = false; companionError = error.message }
  }
  if (import.meta.env.VITE_BROWSER_RUNTIME === 'true') {
    try {
      const { prepareBrowserRuntime } = await import('./browser/bootstrap')
      await prepareBrowserRuntime()
    } catch (error) {
      root.render(<p role="alert">{error.message}</p>)
      return
    }
  }
  root.render(
  <React.StrictMode>
    <ThemeWrapper>
      <CssBaseline />
      {connected ? <App /> : <CompanionConnect error={companionError} onConnect={() => start({ interactive: true })} />}
    </ThemeWrapper>
  </React.StrictMode>
)
}
start()
