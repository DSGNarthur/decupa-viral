import { recoverInterruptedJobs } from './jobs'
import { sourceBlob, thumbnail, filmstrip } from './media'

export async function prepareBrowserRuntime() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('Abra a plataforma por HTTPS em um navegador atualizado para acessar o processamento local.')
  await recoverInterruptedJobs()
  navigator.serviceWorker.addEventListener('message', async event => {
    if (event.data?.type !== 'media-frame') return
    const port = event.ports[0]
    try {
      const url = new URL(event.data.url)
      const id = url.pathname.split('/')[3]
      const blob = await sourceBlob(id)
      const width = Math.max(32, Math.min(1024, Number(url.searchParams.get('w')) || 288))
      const result = url.pathname.endsWith('/filmstrip')
        ? await filmstrip(blob, { count: Number(url.searchParams.get('n')) || 16, height: Number(url.searchParams.get('h')) || 48 })
        : await thumbnail(blob, Number(url.searchParams.get('t')) || 0, width)
      port.postMessage({ blob: result })
    } catch (error) { port.postMessage({ error: error.message }) }
  })
  await navigator.serviceWorker.register('/media-worker.js', { scope: '/' })
  await navigator.serviceWorker.ready
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('O navegador não ativou o armazenamento de mídia. Atualize a página.')), 15000)
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve() }, { once: true })
    })
  }
}
