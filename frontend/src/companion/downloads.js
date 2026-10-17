import { pcSession } from './session'

export async function downloadFromPC(url, preferredName = '') {
  const pc = pcSession()
  if (!pc) throw new Error('Reconecte o aplicativo local antes de baixar.')
  const response = await fetch(pc.origin + url.pathname + url.search, {
    headers: { Authorization: 'Bearer ' + pc.token },
    targetAddressSpace: 'loopback',
  })
  if (!response.ok) throw new Error('Não foi possível baixar o arquivo do PC. Reconecte e tente novamente.')
  const disposition = response.headers.get('Content-Disposition') || ''
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  let name = preferredName || /filename="?([^";]+)"?/i.exec(disposition)?.[1] || 'decupa-viral.mp4'
  if (!preferredName && encodedName) {
    try { name = decodeURIComponent(encodedName) } catch { /* Use the plain filename. */ }
  }
  name = name.replace(/^viralmint_/i, 'decupa_').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
}

export function interceptPCDownloads(onError) {
  const pending = new Set()
  const clicked = event => {
    const link = event.target.closest?.('a[href]')
    if (!link || event.defaultPrevented || event.button !== 0) return
    const url = new URL(link.href, location.href)
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return
    if (!link.hasAttribute('download') && !/\/download(?:\/|$)/.test(url.pathname)) return
    event.preventDefault()
    if (pending.has(url.href)) return
    pending.add(url.href)
    downloadFromPC(url, link.getAttribute('download') || '')
      .catch(error => onError(error.message))
      .finally(() => pending.delete(url.href))
  }
  document.addEventListener('click', clicked, true)
  return () => document.removeEventListener('click', clicked, true)
}
