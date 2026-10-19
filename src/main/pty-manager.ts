import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import * as pty from '@lydell/node-pty'
import { Terminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import type { DeskConfig, PtyData, PtyLines, PtySnapshot } from '../shared/types'
import { readColoredLines, readLinks } from './buffer-read'
import { resolveShell, shellEnv } from './shell'

const FLUSH_MS = 50
const LINES_MS = 250
// Enough history for the enlarged (hovered) bubble; the normal one shows the last 2.
const BUBBLE_LINES = 10

interface Session {
  id: string
  proc: pty.IPty | null
  term: Terminal
  serializer: SerializeAddon
  /** Total chars written so far. */
  seq: number
  pending: string
  pendingSeq: number
  linesDirty: boolean
  /** JSON of the last emitted lines+links, to skip no-op updates. */
  lastLines: string
  exited: boolean
}

type Emit = {
  data(e: PtyData): void
  lines(e: PtyLines): void
  exit(e: { id: string; code: number }): void
}

export class PtyManager {
  private sessions = new Map<string, Session>()
  private timer: NodeJS.Timeout
  private linesTimer: NodeJS.Timeout

  constructor(private emit: Emit) {
    this.timer = setInterval(() => this.flushAll(), FLUSH_MS)
    this.linesTimer = setInterval(() => this.updateLines(), LINES_MS)
  }

  create(desk: DeskConfig): { ok: boolean; error?: string; exited?: boolean } {
    const existing = this.sessions.get(desk.id)
    if (existing) return { ok: true, exited: existing.exited }

    const cols = 100
    const rows = 30
    const term = new Terminal({ cols, rows, scrollback: 2000, allowProposedApi: true })
    const serializer = new SerializeAddon()
    term.loadAddon(serializer)
    const s: Session = {
      id: desk.id,
      proc: null,
      term,
      serializer,
      seq: 0,
      pending: '',
      pendingSeq: 0,
      linesDirty: false,
      lastLines: '',
      exited: false
    }
    this.sessions.set(desk.id, s)

    const cwd = existsSync(desk.cwd) ? desk.cwd : homedir()
    const { file: shell, args } = resolveShell(desk.shell)
    try {
      const proc = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: shellEnv()
      })
      s.proc = proc
      proc.onData((data) => this.push(s, data))
      proc.onExit(({ exitCode }) => {
        s.exited = true
        s.proc = null
        this.push(s, `\r\n\x1b[90m[process exited with code ${exitCode}]\x1b[0m\r\n`)
        this.flush(s)
        this.emit.exit({ id: s.id, code: exitCode })
      })
      return { ok: true }
    } catch (err) {
      s.exited = true
      const msg = err instanceof Error ? err.message : String(err)
      this.push(s, `\x1b[31mFailed to start ${shell}: ${msg}\x1b[0m\r\n`)
      return { ok: false, error: msg, exited: true }
    }
  }

  private push(s: Session, data: string): void {
    if (!s.pending) s.pendingSeq = s.seq
    s.pending += data
    s.seq += data.length
    s.term.write(data)
    s.linesDirty = true
  }

  private flush(s: Session): void {
    if (!s.pending) return
    this.emit.data({ id: s.id, data: s.pending, seq: s.pendingSeq })
    s.pending = ''
  }

  private flushAll(): void {
    for (const s of this.sessions.values()) this.flush(s)
  }

  private updateLines(): void {
    for (const s of this.sessions.values()) {
      if (!s.linesDirty) continue
      s.linesDirty = false
      const e = this.readLines(s)
      const key = JSON.stringify([e.lines, e.links])
      if (key !== s.lastLines) {
        s.lastLines = key
        this.emit.lines(e)
      }
    }
  }

  private readLines(s: Session): PtyLines {
    return { id: s.id, lines: readColoredLines(s.term, BUBBLE_LINES), links: readLinks(s.term) }
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.proc?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const s = this.sessions.get(id)
    if (!s || cols < 2 || rows < 2) return
    s.term.resize(cols, rows)
    try {
      s.proc?.resize(cols, rows)
    } catch {
      /* process may be gone */
    }
  }

  snapshot(id: string): Promise<PtySnapshot> {
    const s = this.sessions.get(id)
    if (!s) return Promise.resolve({ data: '', seq: 0 })
    // Send whatever is pending first so chunk boundaries line up with the snapshot seq.
    this.flush(s)
    const seq = s.seq
    return new Promise((resolve) => {
      s.term.write('', () => resolve({ data: s.serializer.serialize(), seq }))
    })
  }

  lines(id: string): PtyLines {
    const s = this.sessions.get(id)
    return s ? this.readLines(s) : { id, lines: [], links: [] }
  }

  kill(id: string): void {
    const s = this.sessions.get(id)
    if (!s) return
    this.sessions.delete(id)
    try {
      s.proc?.kill()
    } catch {
      /* already dead */
    }
    s.term.dispose()
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
    clearInterval(this.timer)
    clearInterval(this.linesTimer)
  }
}
