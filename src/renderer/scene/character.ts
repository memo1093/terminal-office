import type { Pt } from './iso'
import type { CharFrame } from './sprites'

/**
 * entering → seated ⇄ (away → returning → seated) … → leaving → gone.
 * `away` = up from the desk on a coffee/wander trip; the office drives where they go.
 */
export type CharState = 'entering' | 'seated' | 'away' | 'returning' | 'leaving' | 'gone'

const SPEED = 3.2 // tiles per second

export class Character {
  gx: number
  gy: number
  state: CharState = 'entering'
  /** Carrying a coffee cup (drawn next to the worker). */
  holding: 'coffee' | null = null
  private path: Pt[]
  private walkClock = 0
  private delay: number
  private blinkSeed = Math.random() * 4000

  constructor(
    public colorIdx: number,
    path: Pt[],
    delayMs = 0
  ) {
    const start = path[0]
    this.gx = start.x
    this.gy = start.y
    this.path = path.slice(1)
    this.delay = delayMs
  }

  get visible(): boolean {
    return this.delay <= 0 && this.state !== 'gone'
  }

  get walking(): boolean {
    return this.visible && this.path.length > 0
  }

  /** Walk along `path` (its first point is the current position) in the given state. */
  walk(path: Pt[], state: CharState): void {
    this.state = state
    this.delay = 0
    // Keep at least one point so update() still fires the arrival transition.
    this.path = path.length > 1 ? path.slice(1) : path.slice(0, 1)
  }

  /** Walk out along `path` (current position → door) and disappear. */
  leave(path: Pt[]): void {
    this.walk(path, 'leaving')
  }

  update(dt: number): void {
    if (this.delay > 0) {
      this.delay -= dt * 1000
      return
    }
    if (!this.path.length) return
    let step = SPEED * dt
    this.walkClock += dt
    while (step > 0 && this.path.length) {
      const t = this.path[0]
      const dx = t.x - this.gx
      const dy = t.y - this.gy
      const d = Math.hypot(dx, dy)
      if (d <= step) {
        this.gx = t.x
        this.gy = t.y
        step -= d
        this.path.shift()
      } else {
        this.gx += (dx / d) * step
        this.gy += (dy / d) * step
        step = 0
      }
    }
    if (!this.path.length) {
      if (this.state === 'entering' || this.state === 'returning') {
        this.state = 'seated'
        this.holding = null
      } else if (this.state === 'leaving') this.state = 'gone'
    }
  }

  frame(now: number, working: boolean, exited: boolean): CharFrame {
    if (this.walking) return Math.floor(this.walkClock * 8) % 2 ? 'walk1' : 'walk2'
    if (exited) return 'sleep'
    if (working) return Math.floor(now / 140) % 2 ? 'type1' : 'type2'
    const t = (now + this.blinkSeed) % 3800
    return t < 140 ? 'blink' : 'stand'
  }

  /** Small vertical offset: walk bounce / idle breathing. */
  bob(now: number, working: boolean): number {
    if (this.walking) return Math.floor(this.walkClock * 8) % 2 ? -1 : 0
    if (working) return Math.floor(now / 280) % 2 ? -1 : 0
    return Math.floor((now + this.blinkSeed) / 1200) % 2 ? 0 : -1
  }
}
