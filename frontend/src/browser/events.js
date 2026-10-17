const listeners = new Map()
export function emit(type, data = {}) {
  for (const fn of listeners.get(type) || []) fn({ type, ...data })
}
export const browserSocket = {
  connected: true,
  connect() { queueMicrotask(() => emit('_connection_state', { connected: true })) },
  disconnect() {},
  on(type, callback) {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type).add(callback)
    return () => listeners.get(type).delete(callback)
  },
  async send(message) {
    const { handleChat } = await import('./runtime')
    await handleChat(message)
  },
}
