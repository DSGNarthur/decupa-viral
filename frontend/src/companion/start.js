export const LOCAL_ENGINE_START_URL = 'decupaviral://start'

export function requestLocalEngineStart(documentRef = document) {
  const link = documentRef.createElement('a')
  link.href = LOCAL_ENGINE_START_URL
  link.style.display = 'none'
  documentRef.body.appendChild(link)
  link.click()
  link.remove()
}

const startupError = /motor (?:está desligado|não respondeu)|processador local não respondeu/i

export async function connectWhileEngineStarts(connect, {
  timeoutMs = 45_000,
  intervalMs = 900,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const deadline = now() + timeoutMs
  let lastError

  while (true) {
    try {
      if (await connect()) return true
    } catch (error) {
      lastError = error
      if (error?.name !== 'TimeoutError' && !startupError.test(error?.message || '')) throw error
    }

    if (now() >= deadline) {
      throw new Error('O Decupa não iniciou. Confirme no navegador a abertura do motor local e tente novamente.')
    }
    await sleep(intervalMs)
  }
}
