// Execute the published FFmpeg core in V8. This is not a browser/UI test.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { captionExtras } from '../src/browser/captions.js'

const root = process.cwd()
const out = path.resolve(process.argv[2] || 'wasm-validation')
await fs.mkdir(out, { recursive: true })
const corePath = path.resolve(root, 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js')
globalThis.self = { location: { href: pathToFileURL(corePath).href } }
const originalFetch = globalThis.fetch
globalThis.fetch = async url => {
  const name = String(url).split('/').at(-1)
  const bytes = await fs.readFile(path.join(root, 'public/engine', name))
  return new Response(bytes)
}
const { default: createCore } = await import(pathToFileURL(corePath))
const core = await createCore({ wasmBinary: await fs.readFile(corePath.replace('.js', '.wasm')) })
const logs = []
core.setLogger(({ message }) => logs.push(message))
try {
  core.FS.writeFile('input.mp4', await fs.readFile(path.join(root, 'public/validation-speech.mp4')))
  const words = ['Teste', 'de', 'legenda', 'em', 'português']
  const extras = await captionExtras(words.map((text, i) => ({ text, start: i * 0.5, end: (i + 1) * 0.5 })), { style: 'viral', width: 720, height: 1280 })
  for (const [name, data] of Object.entries(extras)) core.FS.writeFile(name, typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer()))
  const ret = core.exec('-ss', '0', '-i', 'input.mp4', '-t', '3', '-vf', "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=720:1280,ass=captions.ass:fontsdir=.", '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', 'output.mp4')
  assert.equal(ret, 0, logs.slice(-10).join('\n'))
  await fs.writeFile(path.join(out, 'wasm-caption-cut.mp4'), core.FS.readFile('output.mp4'))
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(out, 'wasm-caption-cut.mp4')], { encoding: 'utf8' }))
  const video = probe.streams.find(stream => stream.codec_type === 'video')
  assert.equal(video.width, 720); assert.equal(video.height, 1280)
  assert.ok(Math.abs(Number(probe.format.duration) - 3) < 0.2)
  assert.ok(probe.streams.some(stream => stream.codec_type === 'audio'))
  core.reset()
  assert.equal(core.exec('-i', 'output.mp4', '-t', '0', '-f', 'null', '-'), 0)
  assert.ok(logs.some(message => /Stream #.*Audio:/.test(message)))
  core.reset()
  assert.equal(core.exec('-ss', '1', '-i', 'output.mp4', '-frames:v', '1', 'frame.png'), 0)
  await fs.writeFile(path.join(out, 'wasm-caption-frame.png'), core.FS.readFile('frame.png'))
  await fs.writeFile(path.join(out, 'wasm-probe.json'), JSON.stringify({ runtime: 'V8 Node.js, no browser', ok: true, probe }, null, 2))
  process.stdout.write('FFmpeg.wasm em V8: corte de 3 segundos, 720x1280, áudio e legendas ASS. Conferido com FFprobe nativo. Navegador ainda não testado.\n')
} finally {
  globalThis.fetch = originalFetch
  await fs.writeFile(path.join(out, 'wasm.log'), logs.join('\n'))
}
