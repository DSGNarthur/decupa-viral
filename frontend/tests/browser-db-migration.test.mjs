import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { openDB } from 'idb'
test('migra uma biblioteca versão 1 para versão 2 preservando os arquivos', async () => {
  const old = await openDB('decupa-viral-browser', 1, { upgrade(db) {
    for (const name of ['sources', 'videos', 'jobs', 'settings', 'media', 'sessions', 'messages', 'config']) db.createObjectStore(name, { keyPath: 'id' })
  } })
  await old.put('media', { id: 'preserved', blob: new Blob(['original']) }); old.close()
  const { dbPromise, get } = await import('../src/browser/db.js')
  assert.equal((await dbPromise).version, 2)
  assert.ok((await dbPromise).objectStoreNames.contains('drafts'))
  assert.equal(await (await get('media', 'preserved')).blob.text(), 'original')
})
