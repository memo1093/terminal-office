import { ctx2d, makeCanvas } from './iso'

/**
 * Overlay text (name tags, bubbles) is rendered at the screen's real resolution with a
 * local monospace font — crisp and readable at any zoom, no font file shipped (works
 * offline, supports Turkish characters). The boxes around it keep the pixel-art look.
 */
const FAMILY = 'Consolas, "Cascadia Mono", Menlo, "SF Mono", "DejaVu Sans Mono", "Liberation Mono", "Ubuntu Mono", monospace'

const font = (px: number, bold: boolean) => `${bold ? 'bold ' : ''}${px}px ${FAMILY}`

/** Line height for a font size, in the same (device) pixels. */
export const lineHeight = (px: number) => Math.round(px * 1.35)

const cache = new Map<string, HTMLCanvasElement>()
const MAX_CACHE = 500
const widths = new Map<number, number>()
let measureCtx: CanvasRenderingContext2D | null = null

/** Advance width of one monospace character at `px`. */
export function charWidth(px: number): number {
  let w = widths.get(px)
  if (w === undefined) {
    measureCtx ??= ctx2d(makeCanvas(1, 1))
    measureCtx.font = font(px, false)
    w = measureCtx.measureText('M').width
    widths.set(px, w)
  }
  return w
}

export function textSprite(text: string, color: string, px: number, bold = false): HTMLCanvasElement {
  const key = `${px}|${bold ? 'b' : ''}|${color}|${text}`
  const hit = cache.get(key)
  if (hit) {
    // Refresh LRU position.
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const c = makeCanvas(Math.ceil(charWidth(px) * text.length) + 2, lineHeight(px))
  const ctx = c.getContext('2d')!
  ctx.font = font(px, bold)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, 0, c.height / 2 + 1)

  cache.set(key, c)
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!)
  return c
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}
