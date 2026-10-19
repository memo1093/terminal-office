import type { Line } from '../../shared/types'
import { colorize, prettyUrl, truncateColored, wrapColored, type Colored } from './ansi'
import { Character, type CharState } from './character'
import { t } from '../i18n'
import { charWidth, lineHeight, textSprite, truncate } from './font'
import { ctx2d, fillPoly, iso, makeCanvas, withOutline, type Pt } from './iso'
import { BODY_COLORS, getPalette, shade, type Palette } from './palette'
import { findPath, randomFreePoint, type FloorGrid } from './path'
import {
  CHAR_H,
  chairSprite,
  characterSprite,
  clearSpriteCache,
  coffeeMachineSprite,
  deskSprite,
  machineParts,
  monitorRect,
  type Sprite
} from './sprites'

const COLS = 3
// Each desk slot: 2-tile desk + 3 tiles of gap sideways; chair row, desk row + 2 aisle rows.
const SLOT_W = 5
const SLOT_H = 4
/** Walkway between the door wall and the first desk column. */
const AISLE_X = 3
/** Free floor in front of the last desk row. */
const FRONT = 2
const WALL_H = 26
// Bubbles may float over the back walls, so only a little extra room above them.
const HEADROOM = 16
const MARGIN = 6
const BUBBLE_MS = 5000
const WORKING_MS = 1500
// A worker whose terminal stays quiet this long gets up for coffee or a stroll.
const IDLE_MIN_MS = 25_000
const IDLE_MAX_MS = 50_000
const BREW_MS = 3500
const DRINK_MS = 6000
const ALERT_MS = 2500

const rand = (a: number, b: number) => a + Math.random() * (b - a)

interface Trip {
  kind: 'coffee' | 'wander'
  phase: 'go' | 'brew' | 'drink' | 'pause'
  until: number
  points: Pt[]
  startedAt: number
}

export interface DeskView {
  id: string
  name: string
  slot: number
  colorIdx: number
  lines: Line[]
  /** Latest URLs printed by the terminal (newest last). */
  links: string[]
  linesAt: number
  deskColor: number
  lastActivity: number
  exited: boolean
  char: Character
  trip: Trip | null
  idleAfter: number
  seatedAt: number
  /** "!" over the head while hurrying back because the terminal printed something. */
  alertUntil: number
  prevState: CharState
}

/** `inBubble`: a link inside a speech bubble (keeps that bubble enlarged while hovered). */
type Hit = { kind: 'desk' | 'char' | 'link' | 'bubble'; id: string; url?: string; inBubble?: boolean } | null
type Rect = { x: number; y: number; w: number; h: number }
type Bubble = { r: Rect; lines: Colored[][]; tx: number; id: string; expanded: boolean }
type LinkPill = { r: Rect; url: string; text: string; id: string }

interface Layout {
  W: number
  H: number
  scale: number
  /** Pixel-art unit for overlay borders/tails, in device px. */
  ts: number
  /** Overlay font size, line height and inner padding, in device px. */
  fs: number
  lh: number
  pad: number
  bw: number
  bh: number
  /** Buffer px of grid (0,0). */
  ox: number
  oy: number
}

export class Office {
  readonly desks = new Map<string, DeskView>()
  private leavers: Character[] = []
  private ctx: CanvasRenderingContext2D
  private buf = makeCanvas(1, 1)
  private bctx = ctx2d(this.buf)
  private room: { img: HTMLCanvasElement; ax: number; ay: number } | null = null
  private pal: Palette
  private L!: Layout
  private hover: Hit = null
  private last = performance.now()
  private lastDraw = 0
  private dirty = true
  /** Desk id currently using the coffee machine (one at a time). */
  private machineUser: string | null = null
  private brewingUntil = 0
  mini = false

  onDeskClick: (id: string) => void = () => {}
  onCharClick: (id: string) => void = () => {}
  onLinkClick: (url: string) => void = () => {}
  /** Link pills from the last overlay pass, in device pixels (for hit testing). */
  private linkHits: LinkPill[] = []
  /** Speech bubbles from the last overlay pass, topmost first. */
  private bubbleHits: { r: Rect; id: string; links: { r: Rect; url: string }[] }[] = []

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = ctx2d(canvas)
    const mq = matchMedia('(prefers-color-scheme: dark)')
    this.pal = getPalette(mq.matches)
    mq.addEventListener('change', () => this.setDark(mq.matches))

    new ResizeObserver(() => this.relayout()).observe(canvas)
    canvas.addEventListener('mousemove', (e) => this.onMove(e))
    canvas.addEventListener('mouseleave', () => this.setHover(null))
    canvas.addEventListener('click', (e) => {
      const hit = this.hitTest(e)
      if (hit?.kind === 'link' && hit.url) this.onLinkClick(hit.url)
      // Clicking a speech bubble opens the full console, like clicking the desk.
      else if (hit?.kind === 'bubble') this.onDeskClick(hit.id)
      else if (hit?.kind === 'char') this.onCharClick(hit.id)
      else if (hit?.kind === 'desk') this.onDeskClick(hit.id)
    })
    this.relayout()
    requestAnimationFrame(this.tick)
  }

  get palette(): Palette {
    return this.pal
  }

  private setDark(dark: boolean): void {
    this.pal = getPalette(dark)
    clearSpriteCache()
    this.room = null
    this.dirty = true
  }

  /** Force a redraw (e.g. after a language change). */
  refresh(): void {
    this.dirty = true
  }

  setMini(mini: boolean): void {
    this.mini = mini
    this.dirty = true
  }

  // ---- layout ---------------------------------------------------------------

  private rows(): number {
    let maxSlot = -1
    for (const d of this.desks.values()) maxSlot = Math.max(maxSlot, d.slot)
    return Math.max(2, Math.ceil((maxSlot + 1) / COLS))
  }

  private relayout(): void {
    const dpr = window.devicePixelRatio || 1
    const cw = Math.max(1, Math.round(this.canvas.clientWidth * dpr))
    const ch = Math.max(1, Math.round(this.canvas.clientHeight * dpr))
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw
      this.canvas.height = ch
      this.ctx.imageSmoothingEnabled = false
    }
    const W = AISLE_X + COLS * SLOT_W
    const H = 1 + this.rows() * SLOT_H + FRONT
    if (!this.L || this.L.W !== W || this.L.H !== H) this.room = null

    const worldW = (W + H) * 8
    const worldH = (W + H) * 4 + WALL_H + HEADROOM
    const s = Math.min(cw / (worldW + MARGIN * 2), ch / (worldH + MARGIN * 2))
    // Integer scaling keeps pixels square; below 2x allow fractional so the mini window still fits.
    const scale = s >= 2 ? Math.floor(s) : Math.max(0.5, s)
    const bw = Math.ceil(cw / scale)
    const bh = Math.ceil(ch / scale)
    const ox = Math.floor((bw - worldW) / 2) + H * 8
    const oy = Math.floor((bh - worldH) / 2) + HEADROOM + WALL_H
    const ts = Math.max(1, Math.floor(scale / 2))
    // Font follows the zoom but stays in a comfortable 12–15 CSS px range.
    const cssScale = scale / dpr
    const fs = Math.round(Math.min(15, Math.max(12, 10 + cssScale)) * dpr)
    const lh = lineHeight(fs)
    const pad = Math.max(3 * ts, Math.round(fs * 0.45))
    this.L = { W, H, scale, ts, fs, lh, pad, bw, bh, ox, oy }
    if (this.buf.width !== bw || this.buf.height !== bh) {
      this.buf.width = bw
      this.buf.height = bh
      this.bctx.imageSmoothingEnabled = false
    }
    this.dirty = true
  }

  slotOrigin(slot: number): { ox: number; oy: number } {
    return { ox: AISLE_X + (slot % COLS) * SLOT_W, oy: 1 + Math.floor(slot / COLS) * SLOT_H }
  }

  private seat(slot: number): Pt {
    const { ox, oy } = this.slotOrigin(slot)
    return { x: ox + 1, y: oy + 0.5 }
  }

  private door(): Pt {
    return { x: 0.3, y: this.L.H - 1.1 }
  }

  private pathToSeat(slot: number): Pt[] {
    return this.pathTo(this.door(), this.seat(slot))
  }

  /** Back corner of the coffee counter, against the back-right wall. */
  private machineOrigin(): Pt {
    return { x: this.L.W - 1.6, y: 0 }
  }

  /** Where a worker stands to use the machine. */
  private machineSpot(): Pt {
    const m = this.machineOrigin()
    return { x: m.x + 0.5, y: 1.35 }
  }

  /** Floor tiles nobody may walk through: desks, chairs, plant, coffee counter. */
  private grid(): FloorGrid {
    const blocked = new Set<string>(['0,0'])
    for (const d of this.desks.values()) {
      const { ox, oy } = this.slotOrigin(d.slot)
      for (const x of [ox, ox + 1]) for (const y of [oy, oy + 1]) blocked.add(`${x},${y}`)
    }
    const m = this.machineOrigin()
    for (let x = Math.floor(m.x); x < Math.ceil(m.x + 1); x++) blocked.add(`${x},0`)
    return { W: this.L.W, H: this.L.H, blocked }
  }

  private pathTo(from: Pt, to: Pt): Pt[] {
    return findPath(this.grid(), from, to)
  }

  // ---- desks ----------------------------------------------------------------

  freeSlot(): number {
    const used = new Set([...this.desks.values()].map((d) => d.slot))
    let i = 0
    while (used.has(i)) i++
    return i
  }

  addDesk(d: { id: string; name: string; slot: number; color: number; deskColor: number }, delayMs = 0): DeskView {
    const view = {
      id: d.id,
      name: d.name,
      slot: d.slot,
      colorIdx: d.color,
      lines: [],
      links: [],
      linesAt: 0,
      deskColor: d.deskColor,
      lastActivity: performance.now(),
      exited: false,
      trip: null,
      idleAfter: rand(IDLE_MIN_MS, IDLE_MAX_MS),
      seatedAt: 0,
      alertUntil: 0,
      prevState: 'entering'
    } as Omit<DeskView, 'char'> as DeskView
    this.desks.set(d.id, view)
    // Relayout first: the room may grow a row, which moves the door.
    this.relayout()
    view.char = new Character(d.color, this.pathToSeat(d.slot), delayMs)
    return view
  }

  removeDesk(id: string): void {
    const d = this.desks.get(id)
    if (!d) return
    this.desks.delete(id)
    if (this.machineUser === id) this.releaseMachine()
    const c = d.char
    const dr = this.door()
    if (c.visible) {
      c.leave([...this.pathTo({ x: c.gx, y: c.gy }, dr), { x: -0.6, y: dr.y }])
      this.leavers.push(c)
    }
    this.relayout()
  }

  setLines(id: string, lines: Line[], links: string[]): void {
    const d = this.desks.get(id)
    if (!d) return
    // Only new output re-opens the speech bubble; a link-only change just updates the pill.
    if (JSON.stringify(lines) !== JSON.stringify(d.lines)) d.linesAt = performance.now()
    d.lines = lines
    d.links = links
    this.dirty = true
  }

  /** Display name (e.g. "api #2") and project desk color can change as desks come and go. */
  setMeta(id: string, name: string, deskColor: number): void {
    const d = this.desks.get(id)
    if (!d) return
    d.name = name
    d.deskColor = deskColor
    this.dirty = true
  }

  activity(id: string): void {
    const d = this.desks.get(id)
    if (d) d.lastActivity = performance.now()
  }

  setExited(id: string, exited: boolean): void {
    const d = this.desks.get(id)
    if (d) d.exited = exited
    this.dirty = true
  }

  // ---- idle trips -----------------------------------------------------------

  private releaseMachine(): void {
    this.machineUser = null
    this.brewingUntil = 0
  }

  private startTrip(d: DeskView, now: number): void {
    const c = d.char
    const pos = { x: c.gx, y: c.gy }
    d.idleAfter = rand(IDLE_MIN_MS, IDLE_MAX_MS)
    if (!this.machineUser && Math.random() < 0.5) {
      this.machineUser = d.id
      d.trip = { kind: 'coffee', phase: 'go', until: 0, points: [], startedAt: now }
      c.walk(this.pathTo(pos, this.machineSpot()), 'away')
      return
    }
    const g = this.grid()
    const points: Pt[] = []
    const n = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < n; i++) {
      const p = randomFreePoint(g)
      if (p) points.push(p)
    }
    const first = points.shift()
    if (!first) return
    d.trip = { kind: 'wander', phase: 'go', until: 0, points, startedAt: now }
    c.walk(this.pathTo(pos, first), 'away')
  }

  private goBack(d: DeskView): void {
    if (this.machineUser === d.id) this.releaseMachine()
    d.trip = null
    const c = d.char
    c.walk(this.pathTo({ x: c.gx, y: c.gy }, this.seat(d.slot)), 'returning')
  }

  private updateTrips(now: number): void {
    for (const d of this.desks.values()) {
      const c = d.char
      if (c.state === 'seated' && d.prevState !== 'seated') d.seatedAt = now
      d.prevState = c.state

      if (c.state === 'seated') {
        if (!d.exited && now - Math.max(d.lastActivity, d.seatedAt) > d.idleAfter) this.startTrip(d, now)
        continue
      }
      const t = d.trip
      if (c.state !== 'away' || !t) continue
      // The terminal printed something while we were away: back to work.
      if (d.lastActivity > t.startedAt) {
        d.alertUntil = now + ALERT_MS
        this.goBack(d)
        continue
      }
      if (c.walking) continue
      const pos = { x: c.gx, y: c.gy }
      if (t.kind === 'coffee') {
        if (t.phase === 'go') {
          t.phase = 'brew'
          t.until = this.brewingUntil = now + BREW_MS
        } else if (t.phase === 'brew' && now >= t.until) {
          c.holding = 'coffee'
          this.releaseMachine()
          t.phase = 'drink'
          t.until = now + DRINK_MS
          // Step away from the machine to sip.
          const spot = this.machineSpot()
          c.walk(this.pathTo(pos, { x: spot.x + rand(-1.2, 0.5), y: spot.y + rand(0.8, 1.4) }), 'away')
        } else if (t.phase === 'drink' && now >= t.until) {
          this.goBack(d)
        }
      } else if (t.phase === 'go') {
        t.phase = 'pause'
        t.until = now + rand(1500, 4000)
      } else if (t.phase === 'pause' && now >= t.until) {
        const next = t.points.shift()
        if (next) {
          t.phase = 'go'
          c.walk(this.pathTo(pos, next), 'away')
        } else this.goBack(d)
      }
    }
  }

  // ---- input ----------------------------------------------------------------

  private toWorld(e: MouseEvent): Pt {
    const r = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    return {
      x: ((e.clientX - r.left) * dpr) / this.L.scale - this.L.ox,
      y: ((e.clientY - r.top) * dpr) / this.L.scale - this.L.oy
    }
  }

  private inSprite(p: Pt, s: Sprite, at: Pt): boolean {
    const x = p.x - (Math.round(at.x) - s.ax)
    const y = p.y - (Math.round(at.y) - s.ay)
    return x >= 0 && y >= 0 && x < s.img.width && y < s.img.height
  }

  private hitTest(e: MouseEvent): Hit {
    const r = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const dx = (e.clientX - r.left) * dpr
    const dy = (e.clientY - r.top) * dpr
    const inside = (q: Rect) => dx >= q.x && dx < q.x + q.w && dy >= q.y && dy < q.y + q.h
    // Overlay boxes sit on top of the scene: speech bubbles first (painted last), then link pills.
    for (const b of this.bubbleHits) {
      if (!inside(b.r)) continue
      const l = b.links.find((k) => inside(k.r))
      return l ? { kind: 'link', id: b.id, url: l.url, inBubble: true } : { kind: 'bubble', id: b.id }
    }
    for (let i = this.linkHits.length - 1; i >= 0; i--) {
      const l = this.linkHits[i]
      if (dx >= l.r.x && dx < l.r.x + l.r.w && dy >= l.r.y && dy < l.r.y + l.r.h) return { kind: 'link', id: l.id, url: l.url }
    }
    const p = this.toWorld(e)
    const list = [...this.desks.values()].sort((a, b) => this.depthOf(b) - this.depthOf(a))
    for (const d of list) {
      if (!d.char.visible) continue
      const at = this.charPos(d)
      if (this.inSprite(p, characterSprite(d.colorIdx, 'stand', this.pal), at)) return { kind: 'char', id: d.id }
    }
    for (const d of list) {
      const { ox, oy } = this.slotOrigin(d.slot)
      if (this.inSprite(p, deskSprite(this.pal, false), iso(ox, oy + 1))) return { kind: 'desk', id: d.id }
    }
    return null
  }

  private onMove(e: MouseEvent): void {
    this.setHover(this.hitTest(e))
  }

  private setHover(h: Hit): void {
    if (h?.kind === this.hover?.kind && h?.id === this.hover?.id && h?.url === this.hover?.url) return
    this.hover = h
    this.canvas.style.cursor = h ? 'pointer' : 'default'
    this.dirty = true
  }

  // ---- render ---------------------------------------------------------------

  private depthOf(d: DeskView): number {
    const { ox, oy } = this.slotOrigin(d.slot)
    return ox + oy
  }

  private charPos(d: DeskView): Pt {
    const c = d.char
    const p = iso(c.gx, c.gy)
    return { x: p.x, y: p.y }
  }

  private working(d: DeskView, now: number): boolean {
    return d.char.state === 'seated' && !d.exited && now - d.lastActivity < WORKING_MS
  }

  private bubbleVisible(d: DeskView, now: number): number {
    if (!d.lines.length || !d.char.visible) return 0
    if (this.hover?.id === d.id) return 1
    const age = now - d.linesAt
    if (age > BUBBLE_MS) return 0
    return Math.min(1, (BUBBLE_MS - age) / 1000)
  }

  private tick = (now: number): void => {
    requestAnimationFrame(this.tick)
    const dt = Math.min(0.5, (now - this.last) / 1000)
    this.last = now

    this.updateTrips(now)
    let animating = now < this.brewingUntil
    for (const d of this.desks.values()) {
      d.char.update(dt)
      if (d.char.walking || this.working(d, now) || this.bubbleVisible(d, now) > 0) animating = true
    }
    for (const c of this.leavers) {
      c.update(dt)
      animating = true
    }
    this.leavers = this.leavers.filter((c) => c.state !== 'gone')

    // ~20 fps while something moves, a few fps when the office is calm.
    const interval = animating ? 50 : 250
    if (!this.dirty && now - this.lastDraw < interval) return
    this.lastDraw = now
    this.dirty = false
    this.draw(now)
  }

  private buildRoom(): void {
    const { W, H } = this.L
    const p = this.pal
    const ax = H * 8 + 3
    const ay = WALL_H + 3
    const c = makeCanvas((W + H) * 8 + 6, (W + H) * 4 + WALL_H + 6)
    const ctx = ctx2d(c)
    const P = (gx: number, gy: number, up = 0) => {
      const q = iso(gx, gy)
      return { x: q.x + ax, y: q.y + ay - up }
    }
    // Floor.
    for (let gy = 0; gy < H; gy++)
      for (let gx = 0; gx < W; gx++)
        fillPoly(ctx, [P(gx, gy), P(gx + 1, gy), P(gx + 1, gy + 1), P(gx, gy + 1)], (gx + gy) % 2 ? p.floorB : p.floorA)
    // Back walls with a thin top cap for thickness.
    const t = 0.3
    fillPoly(ctx, [P(0, 0, WALL_H), P(0, H, WALL_H), P(0, H), P(0, 0)], p.wallLeft)
    fillPoly(ctx, [P(0, 0, WALL_H), P(W, 0, WALL_H), P(W, 0), P(0, 0)], p.wallRight)
    fillPoly(ctx, [P(-t, -t, WALL_H), P(-t, H, WALL_H), P(0, H, WALL_H), P(0, 0, WALL_H)], p.wallTop)
    fillPoly(ctx, [P(-t, -t, WALL_H), P(W, -t, WALL_H), P(W, 0, WALL_H), P(0, 0, WALL_H)], p.wallTop)
    // Skirting line.
    fillPoly(ctx, [P(0, 0, 2), P(0, H, 2), P(0, H), P(0, 0)], shade(p.wallLeft, -0.05))
    fillPoly(ctx, [P(0, 0, 2), P(W, 0, 2), P(W, 0), P(0, 0)], shade(p.wallRight, -0.05))
    // Door on the left wall, plus a doormat.
    const d0 = H - 1.8
    const d1 = H - 0.4
    fillPoly(ctx, [P(0, d0, 19), P(0, d1, 19), P(0, d1), P(0, d0)], p.doorFrame)
    fillPoly(ctx, [P(0, d0 + 0.15, 17), P(0, d1 - 0.15, 17), P(0, d1 - 0.15), P(0, d0 + 0.15)], p.door)
    const knob = P(0, d1 - 0.35, 8)
    ctx.fillStyle = p.doorFrame
    ctx.fillRect(Math.round(knob.x), Math.round(knob.y), 1, 1)
    fillPoly(ctx, [P(0.1, d0 + 0.1), P(1.1, d0 + 0.1), P(1.1, d1 - 0.1), P(0.1, d1 - 0.1)], shade(p.floorA, -0.08))
    // Plant in the far corner.
    const pot = P(0.6, 0.6)
    ctx.fillStyle = shade(p.door, -0.1)
    ctx.fillRect(Math.round(pot.x) - 3, Math.round(pot.y) - 5, 6, 5)
    ctx.fillStyle = '#6fa86a'
    ctx.fillRect(Math.round(pot.x) - 4, Math.round(pot.y) - 11, 8, 6)
    ctx.fillRect(Math.round(pot.x) - 2, Math.round(pot.y) - 14, 4, 3)
    ctx.fillStyle = '#5c9458'
    ctx.fillRect(Math.round(pot.x), Math.round(pot.y) - 10, 3, 4)

    // Coffee corner.
    const m = this.machineOrigin()
    const cm = coffeeMachineSprite(p)
    const mp = P(m.x, m.y)
    ctx.drawImage(cm.img, Math.round(mp.x) - cm.ax, Math.round(mp.y) - cm.ay)

    this.room = { img: withOutline(c, p.outline), ax: ax + 1, ay: ay + 1 }
  }

  private blit(s: Sprite, at: Pt): void {
    this.bctx.drawImage(s.img, Math.round(this.L.ox + at.x) - s.ax, Math.round(this.L.oy + at.y) - s.ay)
  }

  private draw(now: number): void {
    const { L, bctx, pal } = this
    if (!this.room) this.buildRoom()
    bctx.fillStyle = pal.bg
    bctx.fillRect(0, 0, L.bw, L.bh)
    bctx.drawImage(this.room!.img, L.ox - this.room!.ax, L.oy - this.room!.ay)
    this.drawMachineState(now)

    type Item = { z: number; draw: () => void }
    const items: Item[] = []
    for (const d of this.desks.values()) {
      const { ox, oy } = this.slotOrigin(d.slot)
      const seat = iso(ox + 1, oy + 0.5)
      const working = this.working(d, now)
      items.push({ z: ox + oy + 1.4, draw: () => this.blit(chairSprite(pal), seat) })
      items.push({
        z: ox + oy + 2.5,
        draw: () => {
          const at = iso(ox, oy + 1)
          this.blit(deskSprite(pal, this.hover?.kind === 'desk' && this.hover.id === d.id, d.deskColor), at)
          this.drawMonitorGlow(d, at, working, now)
        }
      })
      const c = d.char
      if (c.visible) {
        const pos = this.charPos(d)
        const frame = c.frame(now, working, d.exited)
        const bob = c.bob(now, working)
        items.push({
          z: c.state === 'seated' ? ox + oy + 1.5 : c.gx + c.gy,
          draw: () => {
            this.blit(characterSprite(d.colorIdx, frame, pal), { x: pos.x, y: pos.y + bob })
            if (c.holding) this.drawCup(pos, bob, now)
          }
        })
      }
    }
    for (const c of this.leavers) {
      if (!c.visible) continue
      const pos = iso(c.gx, c.gy)
      items.push({
        z: c.gx + c.gy,
        draw: () => this.blit(characterSprite(c.colorIdx, c.frame(now, false, false), pal), { x: pos.x, y: pos.y + c.bob(now, false) })
      })
    }
    items.sort((a, b) => a.z - b.z)
    for (const it of items) it.draw()

    const ctx = this.ctx
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(this.buf, 0, 0, L.bw * L.scale, L.bh * L.scale)
    this.drawOverlay(now)
  }

  private drawMachineState(now: number): void {
    const o = this.machineOrigin()
    const m = iso(o.x, o.y)
    const parts = machineParts()
    const bx = Math.round(this.L.ox + m.x)
    const by = Math.round(this.L.oy + m.y)
    const ctx = this.bctx
    const brewing = now < this.brewingUntil
    ctx.fillStyle = brewing ? (Math.floor(now / 250) % 2 ? '#e0574a' : '#8a3a33') : '#6fbf6a'
    ctx.fillRect(bx + parts.led.x, by + parts.led.y, 1, 1)
    if (!brewing) return
    // Coffee dripping into the cup + steam curling up from the top.
    const f = Math.floor(now / 120) % 3
    ctx.fillStyle = '#7a4b2a'
    ctx.fillRect(bx + parts.spout.x + 1, by + parts.spout.y + f, 1, 1)
    ctx.fillStyle = this.pal.dark ? '#d8d2c8' : '#ffffff'
    const st = Math.floor(now / 200) % 4
    ctx.fillRect(bx + parts.top.x - 1 + (st % 2), by + parts.top.y - 2 - st, 1, 1)
    ctx.fillRect(bx + parts.top.x + 1 - (st % 2), by + parts.top.y - 4 - ((st + 2) % 4), 1, 1)
  }

  /** Tiny mug in the worker's hand, with a wisp of steam. */
  private drawCup(pos: Pt, bob: number, now: number): void {
    const ctx = this.bctx
    const x = Math.round(this.L.ox + pos.x) + 5
    const y = Math.round(this.L.oy + pos.y) - 7 + bob
    ctx.fillStyle = this.pal.outline
    ctx.fillRect(x, y, 5, 5)
    ctx.fillStyle = '#f4efe6'
    ctx.fillRect(x + 1, y + 1, 3, 3)
    ctx.fillStyle = '#7a4b2a'
    ctx.fillRect(x + 1, y + 1, 3, 1)
    if (Math.floor(now / 400) % 2) {
      ctx.fillStyle = this.pal.dark ? '#d8d2c8' : '#b9b2a6'
      ctx.fillRect(x + 2, y - 2, 1, 1)
    }
  }

  private drawMonitorGlow(d: DeskView, at: Pt, working: boolean, now: number): void {
    const m = monitorRect()
    const x = Math.round(this.L.ox + at.x) + m.x
    const y = Math.round(this.L.oy + at.y) + m.y
    const ctx = this.bctx
    // Screen light spilling over the top/right edge of the monitor back.
    if (working) {
      const flick = Math.floor(now / 90) % 3
      ctx.fillStyle = shade(BODY_COLORS[d.colorIdx % BODY_COLORS.length], 0.25)
      ctx.fillRect(x + 1, y - 1, m.w - 2 - flick, 1)
      ctx.fillRect(x + m.w, y + 1, 1, m.h - 2)
    }
    ctx.fillStyle = d.exited ? '#c25b4e' : working ? this.pal.monitorLed : shade(this.pal.monitorLed, -0.25)
    ctx.fillRect(x + m.w - 2, y + m.h - 2, 1, 1)
  }

  // ---- overlay (labels + speech bubbles, drawn at device resolution) --------

  private drawOverlay(now: number): void {
    const { L } = this
    const list = [...this.desks.values()].filter((d) => d.char.visible)
    // Front-most first so their bubbles keep the preferred spot; the hovered one wins outright.
    list.sort((a, b) => {
      if (this.hover?.id === a.id) return -1
      if (this.hover?.id === b.id) return 1
      return this.depthOf(b) - this.depthOf(a)
    })

    const placed: Rect[] = []
    const labels: { d: DeskView; r: Rect; img: HTMLCanvasElement }[] = []
    for (const d of list) {
      const pos = this.charPos(d)
      const cx = (L.ox + pos.x) * L.scale
      const head = (L.oy + pos.y - CHAR_H - 2) * L.scale
      const lab = this.labelRect(d, cx, head)
      labels.push({ d, ...lab })
      placed.push(lab.r)
    }

    // Link pills right above the name tag, then speech bubbles above those.
    const pills: { p: LinkPill; anchor: Rect }[] = []
    const tops = new Map<string, Rect>()
    for (const { d, r } of labels) {
      tops.set(d.id, r)
      const url = d.links[d.links.length - 1]
      if (!url) continue
      const p = this.layoutLink(d, url, r.x + r.w / 2, r.y, placed)
      placed.push(p.r)
      pills.push({ p, anchor: r })
      tops.set(d.id, p.r)
    }
    this.linkHits = pills.map((x) => x.p)

    const bubbles: { b: Bubble; alpha: number; anchor: Rect }[] = []
    for (const { d } of labels) {
      const alpha = this.bubbleVisible(d, now)
      if (alpha <= 0) continue
      const anchor = tops.get(d.id)!
      const b = this.layoutBubble(d, anchor.x + anchor.w / 2, anchor.y, placed)
      placed.push(b.r)
      bubbles.push({ b, alpha, anchor })
    }
    // bubbles[0] is painted last (on top), so it is also hit-tested first.

    for (const l of labels) {
      this.pxRect(l.r.x, l.r.y, l.r.w, l.r.h, this.pal.labelBg, this.pal.outline)
      this.ctx.drawImage(l.img, l.r.x + L.pad, l.r.y + Math.round((l.r.h - l.img.height) / 2))
    }
    for (let i = pills.length - 1; i >= 0; i--) this.drawLink(pills[i].p, pills[i].anchor)
    // Paint back-to-front so the preferred (hovered / front) bubble ends up on top.
    const bubbleLinks = new Map<string, { r: Rect; url: string }[]>()
    for (let i = bubbles.length - 1; i >= 0; i--)
      bubbleLinks.set(bubbles[i].b.id, this.drawBubble(bubbles[i].b, bubbles[i].anchor, bubbles[i].alpha))
    // bubbles[0] is painted last (on top), so it is also hit-tested first.
    this.bubbleHits = bubbles.map((x) => ({ r: x.b.r, id: x.b.id, links: bubbleLinks.get(x.b.id) ?? [] }))
    if (!this.desks.size) this.drawHint()
  }

  private pxRect(x: number, y: number, w: number, h: number, fill: string, border: string): void {
    const ts = this.L.ts
    const ctx = this.ctx
    ctx.fillStyle = border
    ctx.fillRect(x + ts, y, w - 2 * ts, h)
    ctx.fillRect(x, y + ts, w, h - 2 * ts)
    ctx.fillStyle = fill
    ctx.fillRect(x + ts, y + ts, w - 2 * ts, h - 2 * ts)
  }

  private labelRect(d: DeskView, cx: number, bottom: number): { r: Rect; img: HTMLCanvasElement } {
    const { ts, fs, lh, pad } = this.L
    const alert = d.alertUntil > performance.now() ? '! ' : ''
    const name = alert + truncate(d.name, this.mini ? 14 : 22) + (d.exited ? ' zZ' : '')
    const img = textSprite(name, this.pal.text, fs, true)
    const w = img.width + 2 * pad
    const h = lh + 2 * ts
    return { r: { x: Math.round(cx - w / 2), y: Math.round(bottom - h - ts), w, h }, img }
  }

  /** First free spot at or above `bottom`, nudged up past anything already placed. */
  private place(x: number, w: number, h: number, bottom: number, gap: number, placed: Rect[]): number {
    const { ts } = this.L
    let y = Math.round(bottom - h - gap)
    for (let guard = 0; guard < 12; guard++) {
      const hit = placed.find((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y)
      if (!hit) break
      y = hit.y - h - ts
    }
    return Math.max(2, y)
  }

  /** Vertical line from a moved-up box back down to what it belongs to. */
  private connector(tx: number, from: number, to: number): void {
    const { ts } = this.L
    if (to - from <= 0) return
    this.ctx.fillStyle = this.pal.outline
    this.ctx.fillRect(tx - Math.ceil(ts / 2), from, ts, to - from)
  }

  private layoutLink(d: DeskView, url: string, cx: number, bottom: number, placed: Rect[]): LinkPill {
    const { ts, fs, lh, pad } = this.L
    const text = truncate(prettyUrl(url), this.mini ? 20 : 32)
    const tw = Math.ceil(charWidth(fs) * text.length) + 2
    // [pad][chain icon: 7 units][gap][text][pad]
    const w = pad + 7 * ts + Math.round(fs * 0.5) + tw + pad
    const h = lh + 2 * ts
    const x = Math.max(2, Math.min(this.canvas.width - w - 2, Math.round(cx - w / 2)))
    const y = this.place(x, w, h, bottom, ts, placed)
    return { r: { x, y, w, h }, url, text, id: d.id }
  }

  private drawLink(p: LinkPill, anchor: Rect): void {
    const { ts, fs, pad } = this.L
    const ctx = this.ctx
    const { x, y, w, h } = p.r
    const hovered = this.hover?.kind === 'link' && this.hover.url === p.url && this.hover.id === p.id
    this.connector(Math.round(x + w / 2), y + h, anchor.y)
    this.pxRect(x, y, w, h, hovered ? this.pal.link : this.pal.bubbleBg, this.pal.link)
    const fg = hovered ? this.pal.bubbleBg : this.pal.link
    // Two interlocked chain links.
    ctx.fillStyle = fg
    const ix = x + pad
    const iy = y + Math.round((h - 5 * ts) / 2)
    const ring = (rx: number, ry: number) => {
      ctx.fillRect(ix + (rx + 1) * ts, iy + ry * ts, 2 * ts, ts)
      ctx.fillRect(ix + (rx + 1) * ts, iy + (ry + 2) * ts, 2 * ts, ts)
      ctx.fillRect(ix + rx * ts, iy + (ry + 1) * ts, ts, ts)
      ctx.fillRect(ix + (rx + 3) * ts, iy + (ry + 1) * ts, ts, ts)
    }
    ring(0, 2)
    ring(3, 0)
    const img = textSprite(p.text, fg, fs)
    const tx = ix + 7 * ts + Math.round(fs * 0.5)
    const ty = y + Math.round((h - img.height) / 2)
    ctx.drawImage(img, tx, ty)
    ctx.fillRect(tx, ty + img.height - Math.max(2, ts), Math.round(charWidth(fs) * p.text.length), Math.max(1, Math.round(fs / 12)))
  }

  private layoutBubble(d: DeskView, cx: number, bottom: number, placed: Rect[]): Bubble {
    const { ts, fs, lh, pad } = this.L
    const p = this.pal
    const hv = this.hover
    if (hv?.id === d.id && (hv.kind === 'bubble' || hv.inBubble)) return this.layoutExpanded(d, cx, bottom)
    const hovered = hv?.id === d.id
    const maxLines = this.mini ? 1 : hovered ? 3 : 2
    const maxChars = this.mini ? 24 : hovered ? 44 : 32
    const lines = d.lines
      .slice(-maxLines)
      .map((l) => truncateColored(colorize(l, p.dark, p.bubbleText, p.muted, p.link), maxChars))
    const chars = Math.max(1, ...lines.map((l) => l.reduce((n, c) => n + c.t.length, 0)))
    const tw = Math.ceil(charWidth(fs) * chars) + 2
    const w = tw + 2 * pad
    const h = lines.length * lh + Math.round(pad * 1.2)
    const x = Math.max(2, Math.min(this.canvas.width - w - 2, Math.round(cx - w / 2)))
    const y = this.place(x, w, h, bottom, 3 * ts, placed)
    return { r: { x, y, w, h }, lines, tx: Math.round(cx), id: d.id, expanded: false }
  }

  /** Hovered bubble: the last 10 lines, soft-wrapped instead of cut, sized to the window. */
  private layoutExpanded(d: DeskView, cx: number, bottom: number): Bubble {
    const { ts, fs, lh, pad } = this.L
    const p = this.pal
    const cw = charWidth(fs)
    const W = this.canvas.width
    const Hc = this.canvas.height
    const cols = Math.max(24, Math.min(120, Math.floor((W * 0.7 - 2 * pad) / cw)))
    const maxRows = Math.max(3, Math.min(16, Math.floor((Hc * 0.6 - pad) / lh)))
    const rows = d.lines.flatMap((l) => wrapColored(colorize(l, p.dark, p.bubbleText, p.muted, p.link), cols)).slice(-maxRows)
    const chars = Math.max(1, ...rows.map((l) => l.reduce((n, c) => n + c.t.length, 0)))
    const w = Math.ceil(cw * chars) + 2 + 2 * pad
    const h = rows.length * lh + Math.round(pad * 1.2)
    const x = Math.max(2, Math.min(W - w - 2, Math.round(cx - w / 2)))
    // Grow upwards from where the small bubble sat, but always stay on screen.
    const y = Math.max(2, Math.min(Hc - h - 2, Math.round(bottom - h - 3 * ts)))
    return { r: { x, y, w, h }, lines: rows, tx: Math.round(cx), id: d.id, expanded: true }
  }

  /** Paints a bubble; returns where its links ended up (for hit testing). */
  private drawBubble(b: Bubble, anchor: Rect, alpha: number): { r: Rect; url: string }[] {
    const { ts, fs, lh, pad } = this.L
    const ctx = this.ctx
    const { x, y, w, h } = b.r
    const tx = Math.max(x + 4 * ts, Math.min(x + w - 4 * ts, b.tx))
    ctx.globalAlpha = alpha
    this.connector(tx, y + h + 2 * ts, anchor.y)
    if (b.expanded) {
      // Hard pixel drop shadow so the enlarged bubble reads as floating above the office.
      ctx.globalAlpha = alpha * 0.3
      ctx.fillStyle = '#000000'
      ctx.fillRect(x + 3 * ts, y + 3 * ts, w, h)
      ctx.globalAlpha = alpha
    }
    this.pxRect(x, y, w, h, this.pal.bubbleBg, this.pal.outline)
    // Stepped tail.
    ctx.fillStyle = this.pal.outline
    ctx.fillRect(tx - 3 * ts, y + h - ts, 6 * ts, ts)
    ctx.fillRect(tx - 2 * ts, y + h, 4 * ts, ts)
    ctx.fillRect(tx - ts, y + h + ts, 2 * ts, ts)
    ctx.fillStyle = this.pal.bubbleBg
    ctx.fillRect(tx - 2 * ts, y + h - ts, 4 * ts, ts)
    ctx.fillRect(tx - ts, y + h, 2 * ts, ts)
    const cw = charWidth(fs)
    const top = y + Math.round(pad * 0.6)
    const links: { r: Rect; url: string }[] = []
    const hoverUrl = this.hover?.inBubble && this.hover.id === b.id ? this.hover.url : undefined
    b.lines.forEach((line, i) => {
      const ly = top + i * lh
      let col = 0
      for (const seg of line) {
        const sx = x + pad + Math.round(col * cw)
        const sw = Math.round(seg.t.length * cw)
        const hot = !!seg.url && seg.url === hoverUrl
        if (hot) {
          // Hovered link: tinted background across every row it wraps onto.
          ctx.fillStyle = this.pal.link
          ctx.globalAlpha = alpha * 0.18
          ctx.fillRect(sx - 1, ly, sw + 2, lh)
          ctx.globalAlpha = alpha
        }
        ctx.drawImage(textSprite(seg.t, seg.color ?? this.pal.bubbleText, fs, seg.bold), sx, ly)
        if (seg.link) {
          const thick = Math.max(1, Math.round(fs / 12)) * (hot ? 2 : 1)
          ctx.fillStyle = seg.color ?? this.pal.link
          ctx.fillRect(sx, ly + lh - Math.max(2, ts), sw, thick)
          if (seg.url) links.push({ r: { x: sx, y: ly, w: sw, h: lh }, url: seg.url })
        }
        col += seg.t.length
      }
    })
    ctx.globalAlpha = 1
    return links
  }

  private drawHint(): void {
    const { L } = this
    const img = textSprite(t('scene.hint'), this.pal.text, L.fs, true)
    const w = img.width + 2 * L.pad
    const h = L.lh + Math.round(L.pad * 1.2)
    const p = iso(L.W / 2, L.H / 2)
    const x = Math.round((L.ox + p.x) * L.scale - w / 2)
    const y = Math.round((L.oy + p.y) * L.scale - h / 2)
    this.pxRect(x, y, w, h, this.pal.labelBg, this.pal.outline)
    this.ctx.drawImage(img, x + L.pad, y + Math.round((h - img.height) / 2))
  }
}
