const ORIGIN = 'http://127.0.0.1:16889'
let session = null
export const pcSession = () => session

export async function loopbackPermission() {
  try { return (await navigator.permissions.query({ name: 'loopback-network' })).state }
  catch { return 'unknown' } // Never query the legacy alias, which crashes older Chrome versions.
}

export async function prepareCompanion({ interactive = false } = {}) {
  const params = new URLSearchParams(location.hash.slice(1))
  const received = params.get('pc')
  if (received && /^[A-Za-z0-9_-]{40,80}$/.test(received)) {
    sessionStorage.setItem('decupa-pc-token', received)
    sessionStorage.removeItem('decupa-pc-connected')
    history.replaceState(null, '', location.pathname + location.search)
  }
  const token = sessionStorage.getItem('decupa-pc-token')
  if (!token) return false
  // The first loopback request must start from the user's button click, so
  // Chrome can display its Local Network Access permission prompt.
  if (!interactive && sessionStorage.getItem('decupa-pc-connected') !== 'true') return false
  session = { origin: ORIGIN, token }
  try {
    const permission = await loopbackPermission()
    if (permission === 'denied') throw new Error('O Chrome bloqueou o acesso aos aplicativos deste computador. Nas permissões deste site, permita esse acesso e conecte novamente.')
    if (permission === 'prompt' && !interactive) { session = null; return false }
    const response = await fetch(ORIGIN + '/api/companion/status', { targetAddressSpace: 'loopback', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(45000) })
    if (!response.ok || (await response.json()).runtime !== 'pc') throw new Error('O processador local não respondeu ao pareamento.')
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'pc-credentials' && event.ports[0]) event.ports[0].postMessage(session)
    })
    await navigator.serviceWorker.register('/pc-worker.js', { scope: '/' })
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller?.scriptURL.endsWith('/pc-worker.js')) await new Promise((resolve, reject) => {
      const changed = () => {
        if (!navigator.serviceWorker.controller?.scriptURL.endsWith('/pc-worker.js')) return
        clearTimeout(timer)
        navigator.serviceWorker.removeEventListener('controllerchange', changed)
        resolve()
      }
      const timer = setTimeout(() => {
        navigator.serviceWorker.removeEventListener('controllerchange', changed)
        reject(new Error('Atualize a página para ativar a conexão de mídia com o PC.'))
      }, 12000)
      navigator.serviceWorker.addEventListener('controllerchange', changed)
      changed()
    })
    sessionStorage.setItem('decupa-pc-connected', 'true')
    return true
  } catch (error) {
    session = null
    sessionStorage.removeItem('decupa-pc-connected')
    const message = error.name === 'TimeoutError'
      ? 'A conexão com o PC expirou. Abra o aplicativo local e permita o acesso à rede local nas permissões deste site no Chrome.'
      : error.message === 'Failed to fetch'
        ? 'Não foi possível acessar o PC. Abra o Decupa Viral neste computador e permita o acesso à rede local quando o navegador solicitar.'
        : error.message
    throw new Error(message)
  }
}
