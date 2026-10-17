import { pcSession } from './session'

export async function downloadFromPC(url, preferredName = '') {
  if (!pcSession()) throw new Error('Reconecte o motor antes de baixar.')
  // The worker streams directly to the browser download manager, without
  // retaining multi-GB exports in a Blob in this tab.
  if (!navigator.serviceWorker.controller?.scriptURL.endsWith('/pc-worker.js')) throw new Error('Atualize a página para ativar os downloads.')
  const link = document.createElement('a')
  link.href = url.pathname + url.search
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
