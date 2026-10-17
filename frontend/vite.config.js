import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const runtimePublic = mode => ({
  name: 'decupa-companion-public',
  buildStart() {
    // A fresh source checkout has no generated source-code.zip. CI and local
    // native builds can generate it; hosted builds receive the prepared ZIP.
    if (mode === 'production' && !existsSync(new URL('./public/source-code.zip', import.meta.url))) {
      const python = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')
      execFileSync(python, [fileURLToPath(new URL('../scripts/package_source.py', import.meta.url))], { stdio: 'inherit' })
    }
  },
  generateBundle() {
    const files = ['pc-worker.js', 'source-code.zip', 'LICENSE.txt',
      'manifest.json', 'decupa-icon.svg', 'decupa-logo.png', 'decupa-logo.svg', 'icon.svg', 'favicon.ico', 'favicon-16x16.png',
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
  plugins: [react(), runtimePublic(mode)],
  // The hosted UI uses the PC's native engines. Keep obsolete browser engines
  // and local audit samples out of its published static files.
  publicDir: false,
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
