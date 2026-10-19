import type { Api } from '../../shared/types'
import { bindHistory, remember } from './history'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/** Centered command prompt for a single terminal, opened by clicking its worker. */
export class CommandInput {
  private overlay = $('cmd-overlay')
  private input = $<HTMLInputElement>('cmd-input')
  private title = $('cmd-title')
  private id: string | null = null
  private resetHistory: () => void

  constructor(private api: Api) {
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close()
    })
    $('cmd-ctrlc').addEventListener('click', () => {
      if (this.id) this.api.pty.write(this.id, '\x03')
      this.input.focus()
    })
    this.resetHistory = bindHistory(this.input, () => this.id)
    this.input.addEventListener('keydown', (e) => this.onKey(e))
  }

  get isOpen(): boolean {
    return !this.overlay.hidden
  }

  open(id: string, name: string, color: string): void {
    this.id = id
    this.title.textContent = name
    this.overlay.style.setProperty('--dot', color)
    this.resetHistory()
    this.input.value = ''
    this.overlay.hidden = false
    this.input.focus()
  }

  close(): void {
    this.overlay.hidden = true
    this.id = null
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close()
    } else if (e.key === 'Enter') {
      const cmd = this.input.value
      if (this.id) {
        this.api.pty.write(this.id, cmd + '\r')
        remember(this.id, cmd)
      }
      this.close()
    } else if (e.key === 'c' && e.ctrlKey && !this.input.value && this.id) {
      this.api.pty.write(this.id, '\x03')
    }
  }
}
