import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
await mkdir(root + 'public/engine', { recursive: true })
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await copyFile(root + 'node_modules/@ffmpeg/core/dist/esm/' + name, root + 'public/engine/' + name)
}
// Python Functions do not receive the build's Node binary. Include only the
// executable, compressed, rather than an entire Node/npm development tree.
if (process.env.VERCEL && process.platform === 'linux') {
  const binary = await readFile(process.execPath)
  await mkdir(root + 'server-runtime', { recursive: true })
  await writeFile(root + 'server-runtime/node.gz', gzipSync(binary, { level: 9 }))
  await writeFile(root + 'server-runtime/node.json', JSON.stringify({ version: process.version, sha256: createHash('sha256').update(binary).digest('hex') }))
}
