import { pcSession, pcWorkerReady } from './session'

export async function downloadFromPC(url, preferredName = '') {
  if (!pcSession()) throw new Error('Reconecte o motor antes de baixar.')
  // The worker streams directly to the browser download manager, without
  // retaining multi-GB exports in a Blob in this tab.
  if (!pcWorkerReady()) throw new Error('Atualize a página para ativar os downloads.')
  const id = crypto.randomUUID()
  // Browser downloads may have no FetchEvent.clientId. Register a one-use,
  // short-lived transfer before handing the URL to the download manager.
  await new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => {
      channel.port1.close()
      reject(new Error('Atualize a página para ativar o download do PC.'))
    }, 5000)
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer)
      channel.port1.close()
      if (data?.ok) resolve()
      else reject(new Error('Não foi possível preparar o download. Reconecte o motor.'))
    }
    navigator.serviceWorker.controller.postMessage({ type: 'pc-download', id,
      path: url.pathname + url.search, credentials: pcSession() }, [channel.port2])
  })
  const link = document.createElement('a')
  link.href = '/_pc-download/' + id
  link.download = preferredName || 'decupa-viral.mp4'
  link.dataset.pcStreaming = 'true'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function interceptPCDownloads(onError) {
  const clicked = event => {
    const link = event.target.closest?.('a[href]')
    if (!link || event.defaultPrevented || event.button !== 0 || link.dataset.pcStreaming === 'true') return
    const url = new URL(link.href, location.href)
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return
    if (!link.hasAttribute('download') && !/\/download(?:\/|$)/.test(url.pathname)) return
    event.preventDefault()
    downloadFromPC(url, link.getAttribute('download') || '').catch(error => onError(error.message))
  }
  document.addEventListener('click', clicked, true)
  return () => document.removeEventListener('click', clicked, true)
}
