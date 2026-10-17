import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { readFileSync } from "node:fs"

const companionPublic = () => ({
  name: 'decupa-companion-public',
  generateBundle() {
    for (const name of ['pc-worker.js', 'source-code.zip', 'LICENSE.txt',
      'manifest.json', 'decupa-icon.svg', 'favicon.ico', 'favicon-16x16.png',
      'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
      this.emitFile({ type: 'asset', fileName: name,
        source: readFileSync(new URL(`./public/${name}`, import.meta.url)) })
    }
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'companion' ? [companionPublic()] : [])],
  // The hosted UI uses the PC's native engines. Keep obsolete browser engines
  // and local audit samples out of its published static files.
  publicDir: mode === 'companion' ? false : 'public',
  define: {
    'import.meta.env.VITE_BROWSER_RUNTIME': JSON.stringify(mode === 'browser' ? 'true' : 'false'),
    'import.meta.env.VITE_COMPANION_RUNTIME': JSON.stringify(mode === 'companion' ? 'true' : 'false'),
  },
  server: {
    port: 5173,
    proxy: {
      "/api":  "http://localhost:16889",
      "/ws":   { target: "ws://localhost:16889", ws: true },
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  }
}))
