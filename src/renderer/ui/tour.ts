import type { Key } from '../../shared/i18n'
import { t } from '../i18n'

/** A walkthrough step: what to spotlight (null = centered card, no hole) and its text. */
export interface TourStep {
  id: string
  target: () => DOMRect | null
}

const PAD = 8
const GAP = 14

/**
 * First-run walkthrough: dims the window, cuts a spotlight around the current step's
 * target and shows a small card with Back / Next / Skip. Scene targets move (workers
 * walk), so the spotlight is re-measured continuously while the tour is open.
 */
export class Tour {
  private root: HTMLDivElement | null = null
  private spot!: HTMLDivElement
  private card!: HTMLDivElement
  private i = 0
  private raf = 0
  private onKey = (e: KeyboardEvent) => this.key(e)

  /** Called once when the tour is finished or skipped. */
  onDone: () => void = () => {}

  constructor(private steps: TourStep[]) {}

  get isOpen(): boolean {
    return !!this.root
  }

  start(): void {
    if (this.root) return
    this.i = 0
    const root = document.createElement('div')
    root.id = 'tour'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    this.spot = document.createElement('div')
    this.spot.className = 'tour-spot'
    this.card = document.createElement('div')
    this.card.className = 'tour-card'
    root.append(this.spot, this.card)
    document.body.append(root)
    this.root = root
    window.addEventListener('keydown', this.onKey, true)
    this.render()
    const loop = () => {
      this.place()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  private finish(): void {
    if (!this.root) return
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.onKey, true)
    this.root.remove()
    this.root = null
    this.onDone()
  }

  private go(delta: number): void {
    const next = this.i + delta
    if (next >= this.steps.length) return this.finish()
    this.i = Math.max(0, next)
    this.render()
  }

  private key(e: KeyboardEvent): void {
    if (!this.root) return
    // The tour is modal: keep keys away from the rest of the UI.
    e.stopPropagation()
    if (e.key === 'Escape') this.finish()
    else if (e.key === 'ArrowRight' || e.key === 'Enter') this.go(1)
    else if (e.key === 'ArrowLeft') this.go(-1)
    else return
    e.preventDefault()
  }

  private render(): void {
    const step = this.steps[this.i]
    const last = this.i === this.steps.length - 1
    const title = document.createElement('div')
    title.className = 'tour-title'
    title.textContent = t(`tour.${step.id}.title` as Key)
    const body = document.createElement('p')
    body.className = 'tour-body'
    body.textContent = t(`tour.${step.id}.body` as Key)

    const foot = document.createElement('div')
    foot.className = 'tour-foot'
    const dots = document.createElement('span')
    dots.className = 'tour-step'
    dots.textContent = t('tour.step', { n: this.i + 1, total: this.steps.length })
    const btn = (label: string, cls: string, fn: () => void) => {
      const b = document.createElement('button')
      b.textContent = label
      if (cls) b.className = cls
      b.addEventListener('click', fn)
      return b
    }
    const skip = btn(t('tour.skip'), 'tour-skip', () => this.finish())
    const back = btn(t('tour.back'), '', () => this.go(-1))
    back.disabled = this.i === 0
    const next = btn(last ? t('tour.finish') : t('tour.next'), 'primary', () => this.go(1))
    foot.append(dots, ...(last ? [] : [skip]), back, next)

    this.card.replaceChildren(title, body, foot)
    this.card.setAttribute('aria-label', title.textContent ?? '')
    this.place()
    next.focus()
  }

  /** Positions the spotlight on the target and the card next to it, kept on screen. */
  private place(): void {
    if (!this.root) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const r = this.steps[this.i].target()
    const card = this.card.getBoundingClientRect()

    if (!r) {
      // No target: everything dimmed, card centered.
      // Zero-size spot: its shadow still dims the whole window, the frame is hidden.
      Object.assign(this.spot.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: '0px', height: '0px', borderColor: 'transparent' })
      Object.assign(this.card.style, { left: `${(vw - card.width) / 2}px`, top: `${(vh - card.height) / 2}px` })
      return
    }
    const s = { x: r.left - PAD, y: r.top - PAD, w: r.width + 2 * PAD, h: r.height + 2 * PAD }
    Object.assign(this.spot.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px`, borderColor: '' })

    // Prefer below the target, then above, then whichever side has more room.
    let y = s.y + s.h + GAP
    if (y + card.height > vh - 8) y = s.y - GAP - card.height
    if (y < 8) y = Math.max(8, Math.min(vh - card.height - 8, (vh - card.height) / 2))
    const x = Math.max(8, Math.min(vw - card.width - 8, s.x + s.w / 2 - card.width / 2))
    Object.assign(this.card.style, { left: `${x}px`, top: `${y}px` })
  }
}

/** Union of several element rects (e.g. a group of title bar controls). */
export function unionRect(els: (Element | null)[]): DOMRect | null {
  const rs = els.filter((e): e is Element => !!e && (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect())
  if (!rs.length) return null
  const l = Math.min(...rs.map((r) => r.left))
  const tp = Math.min(...rs.map((r) => r.top))
  const rt = Math.max(...rs.map((r) => r.right))
  const b = Math.max(...rs.map((r) => r.bottom))
  return new DOMRect(l, tp, rt - l, b - tp)
}
