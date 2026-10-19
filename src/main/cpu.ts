import { app } from 'electron'
import { cpus } from 'node:os'
import type { CpuSample } from '../shared/types'

const INTERVAL_MS = 2000

function times(): { idle: number; total: number } {
  let idle = 0
  let total = 0
  for (const c of cpus()) {
    const t = c.times
    idle += t.idle
    total += t.user + t.nice + t.sys + t.idle + t.irq
  }
  return { idle, total }
}

/** Emits machine-wide CPU usage every 2 s while `active()` is true. */
export function startCpuSampler(emit: (s: CpuSample) => void, active: () => boolean): void {
  let prev = times()
  setInterval(() => {
    const cur = times()
    const dt = cur.total - prev.total
    const di = cur.idle - prev.idle
    prev = cur
    if (!active() || dt <= 0) return
    const total = Math.max(0, Math.min(100, 100 * (1 - di / dt)))
    // percentCPUUsage is per-core; normalise to the whole machine like `total`.
    const cores = Math.max(1, cpus().length)
    const own = app.getAppMetrics().reduce((sum, m) => sum + (m.cpu?.percentCPUUsage ?? 0), 0) / cores
    emit({ total: Math.round(total), app: Math.round(own * 10) / 10 })
  }, INTERVAL_MS)
}
