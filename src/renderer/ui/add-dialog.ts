import { t } from '../i18n'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

export interface RecentInfo {
  /** Desks currently open in this folder. */
  open: number
  /** Desk color of the project, if it has one. */
  color?: string
}

/** "+ Add Desk" dialog: pick a folder or reopen a recent project. */
export class AddDialog {
  private overlay = $('add-overlay')
  private list = $<HTMLUListElement>('recent-list')
  private empty = $('recent-empty')

  /** Browse for a folder. */
  onBrowse: () => void = () => {}
  /** Open a desk in a recent folder. */
  onChoose: (cwd: string) => void = () => {}
  /** Remove a folder from the recent list. */
  onForget: (cwd: string) => void = () => {}

  constructor(private info: (cwd: string) => RecentInfo) {
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close()
    })
    $('add-close').addEventListener('click', () => this.close())
    $('add-pick').addEventListener('click', () => {
      this.close()
      this.onBrowse()
    })
    this.overlay.addEventListener('keydown', (e) => this.onKey(e))
  }

  get isOpen(): boolean {
    return !this.overlay.hidden
  }

  open(recent: string[]): void {
    this.render(recent)
    this.overlay.hidden = false
    // Most likely action first: the newest recent project, else the folder picker.
    ;(this.list.querySelector<HTMLButtonElement>('.recent-item') ?? $('add-pick')).focus()
  }

  close(): void {
    this.overlay.hidden = true
  }

  /** Re-render in place (e.g. after removing an entry). */
  render(recent: string[]): void {
    this.list.replaceChildren(...recent.map((cwd) => this.item(cwd)))
    this.empty.hidden = recent.length > 0
  }

  private item(cwd: string): HTMLLIElement {
    const { open, color } = this.info(cwd)
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.className = 'recent-item'
    btn.title = cwd
    const dot = document.createElement('span')
    dot.className = 'r-dot'
    if (color) dot.style.setProperty('--c', color)
    const name = document.createElement('span')
    name.className = 'r-name'
    name.textContent = cwd.split(/[\\/]+/).filter(Boolean).pop() ?? cwd
    const path = document.createElement('span')
    path.className = 'r-path'
    // rtl keeps the end of long paths visible; the bdi stops it from reordering the text.
    const bdi = document.createElement('bdi')
    bdi.textContent = cwd
    path.append(bdi)
    btn.append(dot, name, path)
    if (open) {
      const badge = document.createElement('span')
      badge.className = 'r-badge'
      badge.textContent = t('add.open', { n: open })
      btn.append(badge)
    }
    btn.addEventListener('click', () => {
      this.close()
      this.onChoose(cwd)
    })

    const rm = document.createElement('button')
    rm.className = 'recent-remove'
    rm.title = t('add.forget')
    rm.textContent = '✕'
    rm.addEventListener('click', () => this.onForget(cwd))
    li.append(btn, rm)
    return li
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [$('add-pick'), ...this.list.querySelectorAll<HTMLElement>('.recent-item')]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
    next?.focus()
    e.preventDefault()
  }
}
