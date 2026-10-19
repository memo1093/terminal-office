/** Iso tile size in world pixels (2:1 dimetric). */
export const TW = 16
export const TH = 8

export interface Pt {
  x: number
  y: number
}

/** Grid coords → world pixel coords (relative to the room origin, tile (0,0) top corner). */
export const iso = (gx: number, gy: number): Pt => ({ x: (gx - gy) * (TW / 2), y: (gx + gy) * (TH / 2) })

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: false })!
  ctx.imageSmoothingEnabled = false
  return ctx
}

/**
 * Scanline polygon fill with integer spans — canvas paths are anti-aliased,
 * which would smear pixel art edges.
 */
export function fillPoly(ctx: CanvasRenderingContext2D, pts: Pt[], color: string): void {
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  ctx.fillStyle = color
  for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
    const sy = y + 0.5
    let x0 = Infinity
    let x1 = -Infinity
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      if ((a.y <= sy && b.y > sy) || (b.y <= sy && a.y > sy)) {
        const x = a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x)
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
      }
    }
    if (x0 < x1) {
      const l = Math.round(x0)
      const r = Math.round(x1)
      if (r > l) ctx.fillRect(l, y, r - l, 1)
    }
  }
}

/** Returns a copy of `src` padded by 1px with a 4-neighbour outline around opaque pixels. */
export function withOutline(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const w = src.width + 2
  const h = src.height + 2
  const out = makeCanvas(w, h)
  const ctx = ctx2d(out)
  ctx.drawImage(src, 1, 1)
  const img = ctx.getImageData(0, 0, w, h)
  const a = img.data
  const n = parseInt(color.slice(1), 16)
  const r = n >> 16
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 127
  const mark: number[] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) mark.push((y * w + x) * 4)
    }
  for (const i of mark) {
    a[i] = r
    a[i + 1] = g
    a[i + 2] = b
    a[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return out
}

/** Draws an ASCII pixel map; `colors` maps chars to fill colors ('.' = transparent). */
export function drawMap(ctx: CanvasRenderingContext2D, map: string[], colors: Record<string, string>, ox = 0, oy = 0): void {
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x]]
      if (!c) continue
      ctx.fillStyle = c
      ctx.fillRect(ox + x, oy + y, 1, 1)
    }
  })
}
