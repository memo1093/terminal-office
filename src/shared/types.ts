import type { Lang } from './i18n'

export type ThemePref = 'system' | 'light' | 'dark'
export type WindowMode = 'normal' | 'mini'

export interface DeskConfig {
  id: string
  cwd: string
  /** Shell executable; empty = platform default (PowerShell / $SHELL). */
  shell: string
  slot: number
  /** Worker body color index. */
  color: number
  /** Desk color index, shared by every desk of the same project. */
  projectColor?: number
}

export interface StoreData {
  desks: DeskConfig[]
  theme: ThemePref
  /** Recently used project folders, newest first. */
  recent: string[]
  lang: Lang
  /** The first-run walkthrough has been shown (or skipped). */
  onboarded: boolean
}

/** Machine-wide usage sample. "app" = Terminal Office's own processes (main + renderer + GPU), excluding the shells. */
export interface SysSample {
  /** CPU % of all cores. */
  cpu: number
  appCpu: number
  /** Physical memory in use, %. */
  mem: number
  memUsedGB: number
  memTotalGB: number
  appMemMB: number
}

export interface PtyData {
  id: string
  data: string
  /** Offset (in chars) of the first char of `data` in this terminal's output stream. */
  seq: number
}

export interface PtySnapshot {
  data: string
  seq: number
}

/**
 * A run of same-colored text. `c`: ANSI palette index (0–255), '#rrggbb' truecolor,
 * or undefined for the default foreground. `b`: bold.
 */
export interface Seg {
  t: string
  c?: number | string
  b?: boolean
}
export type Line = Seg[]

export interface PtyLines {
  id: string
  /** Last few non-empty lines, with their terminal colors. */
  lines: Line[]
  /** Most recent URLs seen in the output, newest last. */
  links: string[]
}

export interface Api {
  /** process.platform of the host: 'win32' | 'darwin' | 'linux' … */
  platform: string
  store: {
    load(): Promise<StoreData>
    saveDesks(desks: DeskConfig[]): Promise<void>
    setTheme(theme: ThemePref): Promise<void>
    saveRecent(recent: string[]): Promise<void>
    setLang(lang: Lang): Promise<void>
    setOnboarded(done: boolean): Promise<void>
  }
  pickFolder(): Promise<string | null>
  /** Opens an http(s) URL in the default browser. */
  openUrl(url: string): void
  pty: {
    create(desk: DeskConfig): Promise<{ ok: boolean; error?: string; exited?: boolean }>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): Promise<void>
    snapshot(id: string): Promise<PtySnapshot>
    lines(id: string): Promise<PtyLines>
    onData(cb: (e: PtyData) => void): void
    onLines(cb: (e: PtyLines) => void): void
    onExit(cb: (e: { id: string; code: number }) => void): void
  }
  sys: {
    onStats(cb: (s: SysSample) => void): void
  }
  win: {
    setMode(mode: WindowMode): void
    minimize(): void
    hide(): void
    onMode(cb: (mode: WindowMode) => void): void
  }
}
