import { app } from 'electron'
import { cpus, freemem, totalmem } from 'node:os'
import type { SysSample } from '../shared/types'

const INTERVAL_MS = 2000
const GB = 1024 ** 3

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

const round1 = (n: number) => Math.round(n * 10) / 10

/** Emits machine-wide CPU and memory usage every 2 s while `active()` is true. */
export function startSysSampler(emit: (s: SysSample) => void, active: () => boolean): void {
  let prev = times()
  setInterval(() => {
    const cur = times()
    const dt = cur.total - prev.total
    const di = cur.idle - prev.idle
    prev = cur
    if (!active() || dt <= 0) return

    const metrics = app.getAppMetrics()
    const cores = Math.max(1, cpus().length)
    // percentCPUUsage is per-core; normalise to the whole machine like `cpu`.
    const appCpu = metrics.reduce((sum, m) => sum + (m.cpu?.percentCPUUsage ?? 0), 0) / cores
    // workingSetSize is in KB.
    const appMemMB = metrics.reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0), 0) / 1024
    const total = totalmem()
    const used = total - freemem()

    emit({
      cpu: Math.round(Math.max(0, Math.min(100, 100 * (1 - di / dt)))),
      appCpu: round1(appCpu),
      mem: Math.round((100 * used) / total),
      memUsedGB: round1(used / GB),
      memTotalGB: round1(total / GB),
      appMemMB: Math.round(appMemMB)
    })
  }, INTERVAL_MS)
}
