import { pipeline, env } from '@huggingface/transformers'
env.allowLocalModels = false
env.backends.onnx.wasm.numThreads = 1
const models = new Map()
self.onmessage = async ({ data }) => {
  const { id, audio, quality = 'fast' } = data
  const model = ({ fast: 'onnx-community/whisper-tiny_timestamped', balanced: 'onnx-community/whisper-base_timestamped', accurate: 'onnx-community/whisper-small_timestamped' })[quality]
  try {
    if (!model) throw new Error('Escolha qualidade rápida, equilibrada ou precisa para transcrever no navegador. O modelo large-v3 nativo não está disponível nesta versão.')
    if (!models.has(model)) {
      models.set(model, await pipeline('automatic-speech-recognition', model, { dtype: 'q8', device: 'wasm', progress_callback: p => self.postMessage({ id, type: 'progress', message: p.status === 'progress' ? `Baixando modelo de transcrição: ${Math.round(p.progress || 0)}%` : 'Preparando Whisper neste dispositivo…' }) }))
    }
    const result = await models.get(model)(audio, { language: 'portuguese', task: 'transcribe', return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 })
    self.postMessage({ id, type: 'result', result })
  } catch (error) { self.postMessage({ id, type: 'error', message: error.message || 'A transcrição falhou neste dispositivo.' }) }
}
