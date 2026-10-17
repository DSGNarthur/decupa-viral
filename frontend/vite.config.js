import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { readFileSync, readdirSync } from "node:fs"

const runtimePublic = mode => ({
  name: 'decupa-companion-public',
  generateBundle() {
    const files = ['pc-worker.js', 'source-code.zip', 'LICENSE.txt',
      'manifest.json', 'decupa-icon.svg', 'decupa-logo.png', 'favicon.ico', 'favicon-16x16.png',
      'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']
    if (mode === 'browser') files.push('media-worker.js', ...readdirSync(new URL('./public/engine/', import.meta.url)).filter(name => /\.(wasm|js|ttf|txt)$/.test(name)).map(name => 'engine/' + name))
    for (const name of files) {
      const sourceName = mode === 'browser' && name === 'pc-worker.js' ? 'media-worker.js' : name
      this.emitFile({ type: 'asset', fileName: name,
        source: readFileSync(new URL(`./public/${sourceName}`, import.meta.url)) })
    }
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(['companion', 'browser'].includes(mode) ? [runtimePublic(mode)] : [])],
  // The hosted UI uses the PC's native engines. Keep obsolete browser engines
  // and local audit samples out of its published static files.
  publicDir: ['companion', 'browser'].includes(mode) ? false : 'public',
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
