import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { Api, PtyData } from '../../shared/types'
import { xtermAnsi } from '../scene/ansi'
import { bindHistory, remember } from './history'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const THEMES = {
  light: { background: '#fbf8f2', foreground: '#2e2925', cursor: '#d97757', selectionBackground: '#e8d9c4', ...xtermAnsi(false) },
  dark: { background: '#1f1e22', foreground: '#ece6dc', cursor: '#d97757', selectionBackground: '#4a4650', ...xtermAnsi(true) }
}

/** Full console output for one desk, opened by clicking the desk. */
export class ConsolePanel {
  private overlay = $('console-overlay')
  private host = $('console-term')
  private confirm = $('console-confirm')
  private term: Terminal | null = null
  private fit = new FitAddon()
  private id: string | null = null
  private loading = false
  private queue: PtyData[] = []
  private ro = new ResizeObserver(() => this.refit())
  private input = $<HTMLInputElement>('console-input')
  private resetHistory: () => void

  /** Called when the user confirms closing the terminal. */
  onDelete: (id: string) => void = () => {}

  constructor(private api: Api) {
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close()
    })
    $('console-hide').addEventListener('click', () => this.close())
    $('console-close').addEventListener('click', () => {
      this.confirm.hidden = false
      $('confirm-yes').focus()
    })
    $('confirm-no').addEventListener('click', () => {
      this.confirm.hidden = true
      this.input.focus()
    })
    $('confirm-yes').addEventListener('click', () => {
      const id = this.id
      this.close()
      if (id) this.onDelete(id)
    })
    this.ro.observe(this.host)

    // Command line under the terminal; typing straight into the terminal keeps working too
    // (needed for interactive programs, prompts, vim…).
    this.resetHistory = bindHistory(this.input, () => this.id)
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.send()
      } else if (e.key === 'c' && e.ctrlKey && !this.input.value && this.id) {
        this.api.pty.write(this.id, '\x03')
      } else if (e.key === 'Escape') {
        this.close()
      }
    })
    $('console-send').addEventListener('click', () => this.send())
    $('console-ctrlc').addEventListener('click', () => {
      if (this.id) this.api.pty.write(this.id, '\x03')
      this.input.focus()
    })
  }

  private send(): void {
    if (!this.id) return
    const cmd = this.input.value
    this.api.pty.write(this.id, cmd + '\r')
    remember(this.id, cmd)
    this.resetHistory()
    this.input.value = ''
    this.term?.scrollToBottom()
    this.input.focus()
  }

  get isOpen(): boolean {
    return !this.overlay.hidden
  }

  get openId(): string | null {
    return this.id
  }

  private ensureTerm(): Terminal {
    if (this.term) return this.term
    const term = new Terminal({
      fontFamily: "Consolas, 'Cascadia Mono', Menlo, 'SF Mono', 'DejaVu Sans Mono', 'Liberation Mono', 'Ubuntu Mono', monospace",
      fontSize: 14,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      // OSC 8 hyperlinks (e.g. `ls --hyperlink`, many CLIs) open in the browser too.
      linkHandler: { activate: (_e, uri) => this.api.openUrl(uri) }
    })
    term.loadAddon(this.fit)
    // Plain-text URLs become clickable; opening goes through the main process (http/https only).
    term.loadAddon(new WebLinksAddon((_e, uri) => this.api.openUrl(uri)))
    term.open(this.host)
    term.onData((d) => this.id && this.api.pty.write(this.id, d))
    this.term = term
    return term
  }

  async open(id: string, name: string, cwd: string, color: string, dark: boolean): Promise<void> {
    this.id = id
    this.loading = true
    this.queue = []
    this.confirm.hidden = true
    $('console-title').textContent = name
    $('console-path').textContent = cwd
    this.overlay.style.setProperty('--dot', color)
    this.overlay.hidden = false

    const term = this.ensureTerm()
    const theme = dark ? THEMES.dark : THEMES.light
    term.options.theme = theme
    this.host.style.setProperty('--term-bg', theme.background)
    term.reset()
    this.refit()
    this.input.value = ''
    this.resetHistory()
    this.input.focus()

    // Replay the session state, then apply only chunks that arrived after the snapshot.
    const snap = await this.api.pty.snapshot(id)
    if (this.id !== id) return
    term.write(snap.data)
    for (const q of this.queue) if (q.seq >= snap.seq) term.write(q.data)
    this.queue = []
    this.loading = false
  }

  onData(e: PtyData): void {
    if (e.id !== this.id || !this.term) return
    if (this.loading) this.queue.push(e)
    else this.term.write(e.data)
  }

  close(): void {
    this.overlay.hidden = true
    this.id = null
    this.loading = false
    this.queue = []
  }

  private refit(): void {
    if (!this.term || this.overlay.hidden || !this.id) return
    try {
      this.fit.fit()
      this.api.pty.resize(this.id, this.term.cols, this.term.rows)
    } catch {
      /* host not measurable yet */
    }
  }
}
