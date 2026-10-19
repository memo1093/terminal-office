import type { Line, Seg } from '../../shared/types'

/**
 * 16 base ANSI colors per theme. Tuned for contrast against the bubble / console
 * backgrounds (classic yellow on cream would be unreadable).
 */
const BASE = {
  light: [
    '#2e2925', '#c0392b', '#3f8a3a', '#a8770c', '#2f6db3', '#9b4fb0', '#1f8a8a', '#8a8278',
    '#6b625a', '#d6493b', '#4fa046', '#c28a12', '#3f82d1', '#b062c8', '#28a3a3', '#2e2925'
  ],
  dark: [
    '#5c5862', '#ef6b5f', '#8fd17f', '#f0c35a', '#79aef0', '#d79af0', '#6fd3cf', '#d8d2c8',
    '#8a8590', '#ff8a7e', '#a8e598', '#ffd77a', '#9cc4ff', '#e7b5ff', '#8ee8e4', '#f3eee5'
  ]
}

const hex = (n: number) => n.toString(16).padStart(2, '0')

export function ansiColor(c: number | string, dark: boolean): string {
  if (typeof c === 'string') return c
  if (c < 16) return (dark ? BASE.dark : BASE.light)[c]
  if (c < 232) {
    // 6x6x6 color cube.
    const i = c - 16
    const v = (k: number) => (k ? 55 + k * 40 : 0)
    return '#' + hex(v(Math.floor(i / 36))) + hex(v(Math.floor(i / 6) % 6)) + hex(v(i % 6))
  }
  const g = 8 + (c - 232) * 10
  return '#' + hex(g) + hex(g) + hex(g)
}

/** xterm.js theme colors built from the same palette. */
export function xtermAnsi(dark: boolean): Record<string, string> {
  const names = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
  const base = dark ? BASE.dark : BASE.light
  const out: Record<string, string> = {}
  names.forEach((n, i) => {
    out[n] = base[i]
    out['bright' + n[0].toUpperCase() + n.slice(1)] = base[i + 8]
  })
  return out
}

// Keyword highlighting for text the program printed without colors.
const RULES: { re: RegExp; color: number | 'link' | 'muted' }[] = [
  { re: /\bhttps?:\/\/[^\s"'<>`]+/g, color: 'link' },
  { re: /(\b(error|errors|err!|failed|failure|fatal|exception|panic|denied|refused|cannot|hata)\b|[✗✖×])/gi, color: 1 },
  { re: /(\b(warn|warning|warnings|deprecated|uyarı)\b|⚠)/gi, color: 3 },
  { re: /(\b(success|successful|succeeded|done|ready|passed|compiled|built|ok)\b|[✓✔])/gi, color: 2 }
]
const PROMPT = /^(PS [^>]{1,200}>|[\w.-]+@[\w.-]+[^$#]{0,200}[$#%]|❯|➜)/

export interface Colored {
  t: string
  color?: string
  bold?: boolean
  link?: boolean
  /** Full target of a link run (the text itself may be wrapped or shortened). */
  url?: string
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>`]+/g
/** Trailing punctuation is almost never part of a printed URL. */
const cleanUrl = (u: string) => u.replace(/[).,;:!?\]}]+$/, '')

/** Resolves ANSI colors and adds keyword highlights to default-colored runs. */
export function colorize(line: Line, dark: boolean, fg: string, muted: string, link: string): Colored[] {
  const out: Colored[] = []
  line.forEach((seg: Seg, si) => {
    if (seg.c !== undefined) {
      // Program-colored text keeps its color, but URLs inside it still become links.
      const color = ansiColor(seg.c, dark)
      let i = 0
      for (const m of seg.t.matchAll(URL_IN_TEXT)) {
        if (m.index! > i) out.push({ t: seg.t.slice(i, m.index), color, bold: seg.b })
        out.push({ t: m[0], color, bold: seg.b, link: true, url: cleanUrl(m[0]) })
        i = m.index! + m[0].length
      }
      if (i < seg.t.length) out.push({ t: seg.t.slice(i), color, bold: seg.b })
      return
    }
    let text = seg.t
    // A shell prompt at the start of the line is dimmed so the command stands out.
    if (si === 0) {
      const p = PROMPT.exec(text)
      if (p) {
        out.push({ t: p[0], color: muted })
        text = text.slice(p[0].length)
      }
    }
    const marks: { s: number; e: number; color: string; link?: boolean }[] = []
    for (const r of RULES)
      for (const m of text.matchAll(r.re)) {
        const s = m.index!
        const e = s + m[0].length
        if (marks.some((k) => s < k.e && e > k.s)) continue
        const isLink = r.color === 'link'
        marks.push({ s, e, color: isLink ? link : r.color === 'muted' ? muted : ansiColor(r.color, dark), link: isLink })
      }
    marks.sort((a, b) => a.s - b.s)
    let i = 0
    for (const k of marks) {
      if (k.s > i) out.push({ t: text.slice(i, k.s), color: fg, bold: seg.b })
      const part = text.slice(k.s, k.e)
      out.push({ t: part, color: k.color, bold: seg.b, link: k.link, url: k.link ? cleanUrl(part) : undefined })
      i = k.e
    }
    if (i < text.length) out.push({ t: text.slice(i), color: fg, bold: seg.b })
  })
  return out.filter((c) => c.t)
}

/** Cuts a colored line to `max` characters, ending with an ellipsis. */
export function truncateColored(line: Colored[], max: number): Colored[] {
  const out: Colored[] = []
  let n = 0
  for (const c of line) {
    if (n + c.t.length <= max) {
      out.push(c)
      n += c.t.length
      continue
    }
    out.push({ ...c, t: c.t.slice(0, Math.max(0, max - n - 1)) + '…' })
    break
  }
  return out
}

/** Soft-wraps a colored line into rows of at most `cols` characters. */
export function wrapColored(line: Colored[], cols: number): Colored[][] {
  const rows: Colored[][] = [[]]
  let n = 0
  for (const c of line) {
    let text = c.t
    while (text) {
      if (n === cols) {
        rows.push([])
        n = 0
      }
      const take = text.slice(0, cols - n)
      rows[rows.length - 1].push({ ...c, t: take })
      n += take.length
      text = text.slice(take.length)
    }
  }
  return rows
}

/** Short display form of a URL: no scheme, no trailing slash. */
export function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
