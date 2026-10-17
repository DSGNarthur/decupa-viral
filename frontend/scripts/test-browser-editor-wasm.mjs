// Execute the exact browser editor render plans in V8, without a browser or PC backend.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { browserDefaults, validateDocument, renderPlan } from '../src/editor/browser-document.js'
const out = path.resolve(process.argv[2] || 'wasm-validation/editor')
await fs.mkdir(out, { recursive: true })
const fixture = path.join(out, 'synthetic-source.mp4'), silent = path.join(out, 'synthetic-silent.mp4')
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', fixture])
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', fixture, '-an', '-c:v', 'copy', silent])
const corePath = path.resolve('node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js')
globalThis.self = { location: { href: pathToFileURL(corePath).href } }
const { default: createCore } = await import(pathToFileURL(corePath))
const core = await createCore({ wasmBinary: await fs.readFile(corePath.replace('.js', '.wasm')) })
const logs = [], results = []
core.setLogger(({ message }) => logs.push(message))
try {
  for (const [name, hasAudio, aspect, fit] of [['reordered-captioned-portrait', true, 'vertical', 'cover'], ['silent-square', false, 'square', 'contain']]) {
    const doc = browserDefaults()
    doc.segments = [{ id: 'later', start: 4, end: 5.2 }, { id: 'first', start: 0, end: 1.4 }]
    doc.words = [{ id: 'first-word', start: .1, end: 1, text: 'Primeiro', highlight: false }, { id: 'removed', start: 2, end: 3, text: 'Removido', highlight: false }, { id: 'last', start: 4, end: 5, text: 'Edição em português', highlight: true }]
    doc.framing.aspect = aspect; doc.framing.fit = fit; doc.framing.zoom = 1.1
    doc.volume = .5; doc.effects.brightness = 110; doc.effects.hue = 10
    doc.captions.accent = '#FFD000'
    const plan = renderPlan(validateDocument(doc, 8), { width: 640, height: 360, hasAudio })
    assert.doesNotMatch(plan.ass, /Removido/)
    const files = { 'input.mp4': await fs.readFile(hasAudio ? fixture : silent), 'editor.ass': new TextEncoder().encode(plan.ass), 'NotoSans.ttf': await fs.readFile('public/engine/NotoSans.ttf') }
    for (const [file, bytes] of Object.entries(files)) core.FS.writeFile(file, bytes)
    const args = plan.args.map(v => v === '$INPUT' ? 'input.mp4' : v === '$OUTPUT' ? 'output.mp4' : String(v))
    await fs.writeFile(path.join(out, 'last-plan.json'), JSON.stringify({ doc, plan }, null, 2))
    for (const [file, bytes] of Object.entries(files)) await fs.writeFile(path.join(out, file), bytes)
    const reference = name + '-native-reference.mp4'
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args.map(v => v === 'output.mp4' ? reference : v)], { cwd: out })
    core.reset()
    assert.equal(core.exec('-hide_banner', '-y', ...args), 0, logs.slice(-18).join('\n'))
    const destination = path.join(out, name + '.mp4')
    await fs.writeFile(destination, core.FS.readFile('output.mp4'))
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', destination], { encoding: 'utf8' }))
    const video = probe.streams.find(s => s.codec_type === 'video')
    await fs.writeFile(path.join(out, name + '-probe.json'), JSON.stringify(probe, null, 2))
    assert.equal(video.width, plan.width); assert.equal(video.height, plan.height)
    assert.ok(Math.abs(Number(probe.format.duration) - 2.6) < .12)
    assert.ok(probe.streams.some(s => s.codec_type === 'audio'))
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', destination, '-f', 'null', '-'])
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.4', '-i', destination, '-frames:v', '1', path.join(out, name + '.png')])
    const similarity = spawnSync('ffmpeg', ['-hide_banner', '-i', destination, '-i', path.join(out, reference), '-filter_complex', '[0:v][1:v]ssim', '-f', 'null', '-'], { encoding: 'utf8' })
    assert.equal(similarity.status, 0, similarity.stderr)
    const ssim = Number(/All:([\d.]+)/.exec(similarity.stderr)?.[1])
    assert.ok(ssim > .9, `A ordem ou os tempos divergem da referência nativa: SSIM ${ssim}`)
    results.push({ name, width: video.width, height: video.height, duration: Number(probe.format.duration), full_decode: true, input_audio: hasAudio, output_audio: true, ssim_to_native_reference: ssim })
    for (const file of [...Object.keys(files), 'output.mp4']) core.FS.unlink(file)
  }
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ runtime: 'FFmpeg.wasm in V8, no browser UI', results }, null, 2))
  process.stdout.write(JSON.stringify(results, null, 2) + '\n')
} finally { await fs.writeFile(path.join(out, 'wasm.log'), logs.join('\n')) }
