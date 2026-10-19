/**
 * The app icon as pixel art — the single source for the packaged .ico/.png files
 * (scripts/make-icons.ts), the window/tray icons (main) and the title bar logo.
 * Pure data + math, no Node or DOM APIs, so every process can use it.
 */

export interface Pixels {
  size: number
  /** RGBA, row-major. */
  data: Uint8ClampedArray
}

const C = {
  tile: '#2a2933',
  tileHi: '#34333f',
  floor: '#3a3845',
  outline: '#141318',
  frame: '#e2dccf',
  frameShade: '#b5ae9f',
  screen: '#15241d',
  glow: '#7ee08a',
  dim: '#3f7d4c',
  body: '#d97757',
  bodyHi: '#ef9676',
  bodyShade: '#b55c40',
  eye: '#231d1a',
  shadow: '#1d1c23'
}

type Rgba = [number, number, number, number]
const rgba = (hex: string): Rgba => {
  const n = parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 0xff, n & 0xff, 255]
}

class Grid {
  readonly size: number
  data: Uint8ClampedArray
  // Plain field (no parameter property) so Node can run this file by stripping types.
  constructor(size: number) {
    this.size = size
    this.data = new Uint8ClampedArray(size * size * 4)
  }
  set(x: number, y: number, hex: string): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return
    this.data.set(rgba(hex), (y * this.size + x) * 4)
  }
  rect(x: number, y: number, w: number, h: number, hex: string): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, hex)
  }
  /** Draws an ASCII map; `keys` maps characters to colors ('.' = skip). */
  map(ox: number, oy: number, rows: string[], keys: Record<string, string>): void {
    rows.forEach((row, y) => [...row].forEach((ch, x) => keys[ch] && this.set(ox + x, oy + y, keys[ch])))
  }
  solid(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size && this.data[(y * this.size + x) * 4 + 3] > 0
  }
  /** 1px 4-neighbour outline around everything drawn on this layer. */
  outline(hex: string): void {
    const marks: [number, number][] = []
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++)
        if (!this.solid(x, y) && (this.solid(x - 1, y) || this.solid(x + 1, y) || this.solid(x, y - 1) || this.solid(x, y + 1)))
          marks.push([x, y])
    for (const [x, y] of marks) this.set(x, y, hex)
  }
  /** Paints this layer's opaque pixels over `dst`. */
  over(dst: Grid): void {
    for (let i = 0; i < this.data.length; i += 4) if (this.data[i + 3]) dst.data.set(this.data.subarray(i, i + 4), i)
  }
}

/** Rounded square tile (stepped corners) with a soft top highlight. */
function tile(g: Grid): void {
  const s = g.size
  const r = s >= 32 ? 4 : 2
  for (let y = 0; y < s; y++) {
    const d = Math.min(y, s - 1 - y)
    // Pixel-art quarter circle: inset per row for the top/bottom `r` rows.
    const inset = d < r ? [r, Math.max(1, r - 2), 1, 0, 0][d] ?? 0 : 0
    for (let x = inset; x < s - inset; x++) g.set(x, y, y < s * 0.12 ? C.tileHi : y > s * 0.78 ? C.floor : C.tile)
  }
}

// Worker, same silhouette as the in-app characters. H highlight, X body, S shade, E eye.
const WORKER = [
  '....HHHHHHHHHH....',
  '...XXXXXXXXXXXX...',
  '...XXXXXXXXXXXX...',
  '...XXEEXXXXEEXX...',
  'XXXXXEEXXXXEEXXXXX',
  'XXXXXXXXXXXXXXXXXX',
  '...XXXXXXXXXXXX...',
  '...SSSSSSSSSSSS...',
  '...XX.XX..XX.XX...',
  '...XX.XX..XX.XX...'
]
const WORKER_SMALL = [
  '.HHHHHHHH.',
  '.XXXXXXXX.',
  '.XEXXXXEX.',
  'XXEXXXXEXX',
  '.XXXXXXXX.',
  '.SSSSSSSS.',
  '.X.X..X.X.'
]
const BODY_KEYS = { H: C.bodyHi, X: C.body, S: C.bodyShade, E: C.eye }

/** 32×32: the worker in front of a monitor showing a terminal prompt. */
function full(): Grid {
  const g = new Grid(32)
  tile(g)

  // Monitor with a green prompt on a dark screen; the worker stands in front of its chin.
  const mon = new Grid(32)
  mon.rect(6, 3, 20, 13, C.frame)
  mon.rect(6, 14, 20, 2, C.frameShade)
  mon.rect(8, 5, 16, 8, C.screen)
  mon.rect(10, 6, 10, 1, C.dim) // previous output line
  mon.map(10, 8, ['G..', '.G.', 'G..'], { G: C.glow }) // ">"
  mon.rect(14, 10, 4, 1, C.glow) // "_" cursor
  mon.set(23, 14, C.glow) // power LED
  mon.outline(C.outline)
  mon.over(g)

  // Soft floor shadow under the worker.
  g.rect(9, 26, 14, 1, C.shadow)
  g.rect(11, 27, 10, 1, C.shadow)

  const w = new Grid(32)
  w.map(7, 15, WORKER, BODY_KEYS)
  w.outline(C.outline)
  w.over(g)
  return g
}

/** 16×16: just the worker — legible in the tray and title bar. `withTile` adds the background. */
function small(withTile: boolean): Grid {
  const g = new Grid(16)
  if (withTile) tile(g)
  const w = new Grid(16)
  w.map(3, 5, WORKER_SMALL, BODY_KEYS)
  w.outline(C.outline)
  w.over(g)
  return g
}

export type IconVariant = 'full' | 'small' | 'small-tile'

export function iconPixels(variant: IconVariant): Pixels {
  const g = variant === 'full' ? full() : small(variant === 'small-tile')
  return { size: g.size, data: g.data }
}

/** Nearest-neighbour integer upscale — keeps pixels crisp at any icon size. */
export function scalePixels(p: Pixels, factor: number): Pixels {
  const size = p.size * factor
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const s = (Math.floor(y / factor) * p.size + Math.floor(x / factor)) * 4
      data.set(p.data.subarray(s, s + 4), (y * size + x) * 4)
    }
  return { size, data }
}
