import { openDB } from 'idb'

export const dbPromise = openDB('decupa-viral-browser', 2, {
  upgrade(db) {
    for (const name of ['sources', 'videos', 'jobs', 'settings', 'media', 'sessions', 'messages', 'config', 'drafts']) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
    }
  },
})
export const get = async (store, id) => (await dbPromise).get(store, id)
export const put = async (store, value) => (await dbPromise).put(store, value)
export const all = async store => (await dbPromise).getAll(store)
export const remove = async (store, id) => (await dbPromise).delete(store, id)
export const now = () => new Date().toISOString()
export const uuid = () => crypto.randomUUID()

export async function encryptKey(text) {
  if (!text) return null
  let saved = await get('config', 'credential-key')
  if (!saved) {
    saved = { id: 'credential-key', key: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) }
    await put('config', saved)
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, saved.key, new TextEncoder().encode(text))
  return { iv, bytes }
}
export async function decryptKey(data) {
  if (!data) return ''
  const saved = await get('config', 'credential-key')
  if (!saved) throw new Error('A chave local não está disponível. Configure o DeepSeek novamente.')
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.iv }, saved.key, data.bytes))
}
