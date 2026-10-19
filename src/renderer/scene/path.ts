import type { Pt } from './iso'

/** Walkable floor grid: `blocked` holds "x,y" tile keys. */
export interface FloorGrid {
  W: number
  H: number
  blocked: Set<string>
}

const key = (x: number, y: number) => `${x},${y}`

export function isFree(g: FloorGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.W && y < g.H && !g.blocked.has(key(x, y))
}

const tileOf = (g: FloorGrid, p: Pt) => ({
  x: Math.max(0, Math.min(g.W - 1, Math.floor(p.x))),
  y: Math.max(0, Math.min(g.H - 1, Math.floor(p.y)))
})

/**
 * A* over tile centres (8-way, no corner cutting). Returns world points from `from`
 * to `to`, both included exactly. Falls back to a straight line if unreachable.
 */
export function findPath(g: FloorGrid, from: Pt, to: Pt): Pt[] {
  const s = tileOf(g, from)
  const t = tileOf(g, to)
  const open = new Map<string, { x: number; y: number; g: number; f: number }>()
  const came = new Map<string, string>()
  const cost = new Map<string, number>()
  const h = (x: number, y: number) => Math.hypot(x - t.x, y - t.y)
  open.set(key(s.x, s.y), { x: s.x, y: s.y, g: 0, f: h(s.x, s.y) })
  cost.set(key(s.x, s.y), 0)

  let found = false
  while (open.size) {
    let cur = null as null | { x: number; y: number; g: number; f: number }
    let ck = ''
    for (const [k, n] of open) if (!cur || n.f < cur.f) ((cur = n), (ck = k))
    open.delete(ck)
    if (cur!.x === t.x && cur!.y === t.y) {
      found = true
      break
    }
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = cur!.x + dx
        const ny = cur!.y + dy
        // Start/goal tiles may be "blocked" (e.g. standing at a seat) — still allow them.
        const goal = nx === t.x && ny === t.y
        if (!goal && !isFree(g, nx, ny)) continue
        if (dx && dy && (!isFree(g, cur!.x + dx, cur!.y) || !isFree(g, cur!.x, cur!.y + dy))) continue
        const nk = key(nx, ny)
        const ng = cur!.g + (dx && dy ? Math.SQRT2 : 1)
        if (ng >= (cost.get(nk) ?? Infinity)) continue
        cost.set(nk, ng)
        came.set(nk, ck)
        open.set(nk, { x: nx, y: ny, g: ng, f: ng + h(nx, ny) })
      }
  }
  if (!found) return [from, to]

  const tiles: Pt[] = []
  for (let k: string | undefined = key(t.x, t.y); k; k = came.get(k)) {
    const [x, y] = k.split(',').map(Number)
    tiles.unshift({ x: x + 0.5, y: y + 0.5 })
  }
  // Swap the first/last tile centres for the exact endpoints, then drop collinear points.
  const pts = [from, ...tiles.slice(1, -1), to]
  return pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true
    const a = pts[i - 1]
    const b = pts[i + 1]
    return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-6
  })
}

/** Random walkable tile centre, optionally filtered. */
export function randomFreePoint(g: FloorGrid, accept: (x: number, y: number) => boolean = () => true): Pt | null {
  const cells: Pt[] = []
  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) if (isFree(g, x, y) && accept(x, y)) cells.push({ x, y })
  if (!cells.length) return null
  const c = cells[Math.floor(Math.random() * cells.length)]
  // Jitter inside the tile so wanderers don't line up on a perfect grid.
  return { x: c.x + 0.3 + Math.random() * 0.4, y: c.y + 0.3 + Math.random() * 0.4 }
}
