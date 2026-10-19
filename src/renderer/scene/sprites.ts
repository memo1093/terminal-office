import { ctx2d, drawMap, fillPoly, iso, makeCanvas, withOutline } from './iso'
import { BODY_COLORS, deskShades, shade, type Palette } from './palette'

export interface Sprite {
  img: HTMLCanvasElement
  /** Anchor inside img: the point that lands on the world position. */
  ax: number
  ay: number
}

export type CharFrame = 'stand' | 'walk1' | 'walk2' | 'type1' | 'type2' | 'blink' | 'sleep'

// H = highlight, X = body, S = shade, E = eye. Kept tiny on purpose (Claude Code-ish critter).
const HEAD = ['..HHHHHHHH..', '..XXXXXXXX..']
const EYES_TOP = '..XEXXXXEX..'
const EYES_SHUT = '..XXXXXXXX..'
const ARMS = 'XXXEXXXXEXXX'
const ARMS_SHUT = 'XXXXXXXXXXXX'
const BODY = ['XXXXXXXXXXXX', '..XXXXXXXX..', '..SSSSSSSS..']
const LEGS = ['..X.X..X.X..', '..X.X..X.X..']

const FRAMES: Record<CharFrame, string[]> = {
  stand: [...HEAD, EYES_TOP, ARMS, ...BODY, ...LEGS],
  walk1: [...HEAD, EYES_TOP, ARMS, ...BODY, '..X.X..X.X..', '..X......X..'],
  walk2: [...HEAD, EYES_TOP, ARMS, ...BODY, '..X.X..X.X..', '....X..X....'],
  // Typing: arms bob alternately.
  type1: [...HEAD, 'XXXEXXXXEX..', '..XEXXXXEXXX', ...BODY, ...LEGS],
  type2: [...HEAD, '..XEXXXXEXXX', 'XXXEXXXXEX..', ...BODY, ...LEGS],
  blink: [...HEAD, EYES_SHUT, ARMS_SHUT, ...BODY, ...LEGS],
  sleep: [...HEAD, EYES_SHUT, ARMS_SHUT, ...BODY, ...LEGS]
}

export const CHAR_W = 12
export const CHAR_H = FRAMES.stand.length

const cache = new Map<string, Sprite>()

function cached(key: string, make: () => Sprite): Sprite {
  let s = cache.get(key)
  if (!s) {
    s = make()
    cache.set(key, s)
  }
  return s
}

export function clearSpriteCache(): void {
  cache.clear()
}

export function characterSprite(colorIdx: number, frame: CharFrame, pal: Palette): Sprite {
  const body = BODY_COLORS[colorIdx % BODY_COLORS.length]
  return cached(`char|${colorIdx}|${frame}|${pal.dark}`, () => {
    const c = makeCanvas(CHAR_W, CHAR_H)
    const colors: Record<string, string> = {
      X: body,
      H: shade(body, 0.08),
      S: shade(body, -0.12),
      E: pal.eye
    }
    drawMap(ctx2d(c), FRAMES[frame], colors)
    const img = withOutline(c, pal.outline)
    // Anchor: feet, horizontally centered.
    return { img, ax: Math.floor(img.width / 2), ay: img.height - 1 }
  })
}

export const DESK_H = 7

/**
 * Desk = 2x1 tile box with a monitor on its left half.
 * Anchor = grid corner (deskX, deskY) i.e. the back corner of the footprint.
 */
export function deskSprite(pal: Palette, hovered: boolean, colorIdx = 0): Sprite {
  return cached(`desk|${pal.dark}|${hovered}|${colorIdx}`, () => {
    const wood = deskShades(colorIdx, pal)
    const padX = 9
    const padY = 22
    const c = makeCanvas(26, 36)
    const ctx = ctx2d(c)
    const P = (gx: number, gy: number, up = 0) => {
      const p = iso(gx, gy)
      return { x: p.x + padX, y: p.y + padY - up }
    }
    const h = DESK_H
    // Visible faces: top, front-left (gy = 1), front-right (gx = 2).
    fillPoly(ctx, [P(0, 1, h), P(2, 1, h), P(2, 1), P(0, 1)], wood.left)
    fillPoly(ctx, [P(2, 0, h), P(2, 1, h), P(2, 1), P(2, 0)], wood.right)
    fillPoly(ctx, [P(0, 0, h), P(2, 0, h), P(2, 1, h), P(0, 1, h)], wood.top)
    // Top edge highlight for a bit of depth.
    ctx.fillStyle = shade(wood.top, 0.06)
    const e0 = P(0, 1, h)
    const e1 = P(2, 1, h)
    for (let x = Math.round(e0.x) + 1; x < Math.round(e1.x); x++) {
      const t = (x - e0.x) / (e1.x - e0.x)
      ctx.fillRect(x, Math.round(e0.y + t * (e1.y - e0.y)) - 1, 1, 1)
    }

    // Monitor (seen from behind, screen faces the worker).
    const m = P(0.45, 0.55, h)
    const mx = Math.round(m.x) - 5
    const my = Math.round(m.y) - 10
    ctx.fillStyle = pal.monitor
    ctx.fillRect(mx, my, 10, 7)
    ctx.fillStyle = shade(pal.monitor, 0.1)
    ctx.fillRect(mx, my, 10, 1)
    ctx.fillStyle = pal.monitor
    ctx.fillRect(mx + 4, my + 7, 2, 2)
    ctx.fillRect(mx + 2, my + 9, 6, 1)

    const img = withOutline(c, hovered ? pal.hover : pal.outline)
    return { img, ax: padX + 1, ay: padY + 1 }
  })
}

/** Monitor rectangle relative to the desk anchor (for glow / LED overlay). */
export function monitorRect(): { x: number; y: number; w: number; h: number } {
  const m = iso(0.45, 0.55)
  return { x: Math.round(m.x) - 5, y: Math.round(m.y) - DESK_H - 10, w: 10, h: 7 }
}

/** Coffee machine footprint in tiles (counter against the back-right wall). */
export const MACHINE_W = 1
export const MACHINE_D = 0.8
const COUNTER_H = 9

/**
 * Small counter with an espresso machine on top.
 * Anchor = back corner of the footprint, like the desk.
 */
export function coffeeMachineSprite(pal: Palette): Sprite {
  return cached(`coffee|${pal.dark}`, () => {
    const padX = 8
    const padY = 26
    const c = makeCanvas(20, 36)
    const ctx = ctx2d(c)
    const P = (gx: number, gy: number, up = 0) => {
      const p = iso(gx, gy)
      return { x: p.x + padX, y: p.y + padY - up }
    }
    const w = MACHINE_W
    const d = MACHINE_D
    const h = COUNTER_H
    fillPoly(ctx, [P(0, d, h), P(w, d, h), P(w, d), P(0, d)], shade(pal.chair, -0.04))
    fillPoly(ctx, [P(w, 0, h), P(w, d, h), P(w, d), P(w, 0)], shade(pal.chair, 0.04))
    fillPoly(ctx, [P(0, 0, h), P(w, 0, h), P(w, d, h), P(0, d, h)], shade(pal.chair, 0.16))

    // Machine body standing on the counter.
    const top = P(w / 2, d / 2, h)
    const mx = Math.round(top.x) - 4
    const my = Math.round(top.y) - 12
    const body = '#3a3a41'
    ctx.fillStyle = body
    ctx.fillRect(mx, my, 8, 12)
    ctx.fillStyle = shade(body, 0.12)
    ctx.fillRect(mx, my, 8, 2) // top / bean hopper lid
    ctx.fillStyle = '#c9c4ba'
    ctx.fillRect(mx + 1, my + 3, 6, 2) // front panel
    ctx.fillStyle = '#1f1f24'
    ctx.fillRect(mx + 2, my + 6, 4, 4) // drip recess
    ctx.fillStyle = '#9a958c'
    ctx.fillRect(mx + 2, my + 10, 4, 1) // drip tray
    ctx.fillStyle = '#f4efe6'
    ctx.fillRect(mx + 3, my + 8, 2, 2) // cup under the spout

    const img = withOutline(c, pal.outline)
    return { img, ax: padX + 1, ay: padY + 1 }
  })
}

/** Machine status LED and spout, relative to the machine anchor (for brewing animation). */
export function machineParts(): { led: { x: number; y: number }; spout: { x: number; y: number }; top: { x: number; y: number } } {
  const t = iso(MACHINE_W / 2, MACHINE_D / 2)
  const mx = Math.round(t.x) - 4
  const my = Math.round(t.y) - COUNTER_H - 12
  return { led: { x: mx + 6, y: my + 3 }, spout: { x: mx + 3, y: my + 6 }, top: { x: mx + 4, y: my - 1 } }
}

/** Chair back, drawn behind the seated worker. Anchor = seat point. */
export function chairSprite(pal: Palette): Sprite {
  return cached(`chair|${pal.dark}`, () => {
    const c = makeCanvas(12, 14)
    const ctx = ctx2d(c)
    ctx.fillStyle = pal.chair
    ctx.fillRect(2, 0, 8, 9)
    ctx.fillStyle = shade(pal.chair, 0.08)
    ctx.fillRect(2, 0, 8, 1)
    ctx.fillStyle = pal.chairDark
    ctx.fillRect(1, 9, 10, 2)
    ctx.fillRect(5, 11, 2, 2)
    ctx.fillRect(3, 13, 6, 1)
    const img = withOutline(c, pal.outline)
    return { img, ax: 7, ay: 10 }
  })
}
