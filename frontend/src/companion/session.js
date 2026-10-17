const ORIGIN = 'http://127.0.0.1:16889'
let session = null
let listening = false
let pending = null
export const pcSession = () => session
let connected = false
const connectionListeners = new Set()
export const pcConnectionState = () => connected
export function subscribePCConnection(listener) {
  connectionListeners.add(listener)
  return () => connectionListeners.delete(listener)
}
export function reportPCConnection(value) {
  if (connected === value) return
  connected = value
  connectionListeners.forEach(listener => listener())
}

export function pcWorkerReady() {
  const script = navigator.serviceWorker.controller?.scriptURL
  if (!script) return false
  const url = new URL(script)
  return url.origin === location.origin && url.pathname === '/pc-worker.js' && url.searchParams.get('runtime') === 'native-v3'
}

export async function loopbackPermission() {
  try { return (await navigator.permissions.query({ name: 'loopback-network' })).state }
  catch { return 'unknown' } // Never query the legacy alias, which crashes older Chrome versions.
}

export async function prepareCompanion(options = {}) {
  if (pending) return pending
  pending = connect(options).finally(() => { pending = null })
  return pending
}

async function connect({ interactive = false } = {}) {
  const params = new URLSearchParams(location.hash.slice(1))
  const received = params.get('pc')
  if (received && /^[A-Za-z0-9_-]{40,80}$/.test(received)) {
    sessionStorage.setItem('decupa-pc-token', received)
    sessionStorage.removeItem('decupa-pc-connected')
    history.replaceState(null, '', location.pathname + location.search)
  }
  // The first loopback request must start from the user's button click, so
  // Chrome can display its Local Network Access permission prompt.
  if (!interactive && localStorage.getItem('decupa-pc-enabled') !== 'true' && !received) return false
  try {
    const permission = await loopbackPermission()
    if (permission === 'denied') throw new Error('O Chrome bloqueou o acesso aos aplicativos deste computador. Nas permissões deste site, permita esse acesso e conecte novamente.')
    if (permission === 'prompt' && !interactive) { session = null; return false }
    const bootstrap = await fetch(ORIGIN + '/api/companion/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Decupa-Connect': '1' },
      body: '{}', cache: 'no-store', targetAddressSpace: 'loopback', signal: AbortSignal.timeout(15000),
    })
    if (!bootstrap.ok) throw new Error('Atualize o motor instalado para conectar automaticamente.')
    const credentials = await bootstrap.json()
    const token = credentials.token
    if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) throw new Error('Resposta inválida do motor local.')
    session = { origin: ORIGIN, token }
    const response = await fetch(ORIGIN + '/api/companion/status', { targetAddressSpace: 'loopback', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15000) })
    if (!response.ok || (await response.json()).runtime !== 'pc') throw new Error('O processador local não respondeu ao pareamento.')
    if (!listening) {
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'pc-credentials' && event.ports[0]) event.ports[0].postMessage(session)
      })
      listening = true
    }
    await navigator.serviceWorker.register('/pc-worker.js?runtime=native-v3', { scope: '/' })
    await navigator.serviceWorker.ready
    if (!pcWorkerReady()) await new Promise((resolve, reject) => {
      const changed = () => {
        if (!pcWorkerReady()) return
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
    sessionStorage.removeItem('decupa-pc-token')
    localStorage.setItem('decupa-pc-enabled', 'true')
    reportPCConnection(true)
    return true
  } catch (error) {
    session = null
    reportPCConnection(false)
    sessionStorage.removeItem('decupa-pc-connected')
    const message = error.name === 'TimeoutError'
      ? 'O motor não respondeu. Use Iniciar motor e tente conectar novamente.'
      : error.message === 'Failed to fetch'
        ? 'O motor está desligado ou o navegador bloqueou o acesso local. Inicie o motor e permita o acesso quando solicitado.'
        : error.message
    throw new Error(message)
  }
}
