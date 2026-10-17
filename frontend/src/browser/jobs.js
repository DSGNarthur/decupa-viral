import { all, get, put, now, uuid } from './db.js'
import { emit } from './events.js'

let tail = Promise.resolve()
let wakeLock
const active = new Set()
const owner = uuid()
const ownerLockName = id => `decupa-viral-runner:${id}`
let ownerReady
function holdOwnerLock() {
  if (!globalThis.navigator?.locks) return Promise.resolve()
  if (!ownerReady) ownerReady = new Promise((resolve, reject) => {
    navigator.locks.request(ownerLockName(owner), () => {
      resolve()
      // The browser releases this lock when this page closes.
      return new Promise(() => {})
    }).catch(reject)
  })
  return ownerReady
}
async function holdScreen() {
  try { if (!wakeLock && navigator.wakeLock && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen') } catch { /* Unsupported or denied. */ }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && active.size) { wakeLock = null; holdScreen() }
})
export async function progress(id, pct, message) {
  const job = await get('jobs', id)
  if (!job || job.status === 'cancelled') throw new Error('Tarefa cancelada.')
  Object.assign(job, { status: 'running', progress_pct: pct, current_step: message })
  await put('jobs', job)
  emit('job_progress', { job_id: id, percent: pct, progress_pct: pct, step: message, message })
}
export async function startJob(type, input, run) {
  await holdOwnerLock()
  const id = uuid()
  await put('jobs', { id, owner, job_type: type, status: 'pending', progress_pct: 0, current_step: 'Na fila deste dispositivo', input_json: JSON.stringify(input), created_at: now(), runner_active: true })
  emit('job_started', { job_id: id, job_type: type, message: 'Na fila deste dispositivo' })
  tail = tail.catch(() => {}).then(async () => {
    const queued = await get('jobs', id)
    if (queued?.status === 'cancelled') { await put('jobs', { ...queued, runner_active: false }); return }
    active.add(id)
    await holdScreen()
    try {
      await progress(id, 1, 'Preparando processamento no dispositivo…')
      const output = await run((pct, msg) => progress(id, pct, msg), id)
      const row = await get('jobs', id)
      if (row.status === 'cancelled') return
      Object.assign(row, { status: 'success', progress_pct: 100, current_step: 'Concluído neste dispositivo', output_json: JSON.stringify(output || {}), completed_at: now(), runner_active: false })
      await put('jobs', row)
      emit('job_complete', { job_id: id, result: output })
    } catch (error) {
      const row = await get('jobs', id)
      Object.assign(row, { status: row.status === 'cancelled' ? 'cancelled' : 'failed', error_message: error.message || 'O processamento falhou.', current_step: error.message || 'Falha', completed_at: now(), runner_active: false })
      await put('jobs', row)
      if (row.status !== 'cancelled') emit('job_failed', { job_id: id, error: row.error_message })
    } finally {
      const row = await get('jobs', id)
      if (row?.runner_active) await put('jobs', { ...row, runner_active: false })
      active.delete(id)
      if (!active.size && wakeLock) { try { await wakeLock.release() } catch {} wakeLock = null }
    }
  })
  return { job_id: id }
}
export async function recoverInterruptedJobs() {
  const pending = (await all('jobs')).filter(job => ['pending', 'running'].includes(job.status))
  const recover = async jobs => {
    for (const job of jobs) {
      const current = await get('jobs', job.id)
      if (['pending', 'running'].includes(current?.status)) await put('jobs', { ...current, status: 'failed', runner_active: false, error_message: 'A página foi fechada ou recarregada durante o processamento. Inicie novamente usando o arquivo preservado.', completed_at: now() })
    }
  }
  for (const id of new Set(pending.map(job => job.owner))) {
    const jobs = pending.filter(job => job.owner === id)
    if (id && globalThis.navigator?.locks) {
      await navigator.locks.request(ownerLockName(id), { ifAvailable: true }, lock => lock ? recover(jobs) : undefined)
    } else if (!id) await recover(jobs)
    // Without Web Locks, do not classify another tab's tasks as interrupted.
  }
}
