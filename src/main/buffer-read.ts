import type { IBufferCell, Terminal } from '@xterm/headless'
import type { Line, Seg } from '../shared/types'

const URL_RE = /\bhttps?:\/\/[^\s"'<>`\\]+/g
const LINK_SCAN_LINES = 300
const MAX_LINKS = 2

function cellColor(cell: IBufferCell): number | string | undefined {
  if (cell.isFgDefault()) return undefined
  if (cell.isFgPalette()) return cell.getFgColor()
  if (cell.isFgRGB()) return '#' + cell.getFgColor().toString(16).padStart(6, '0')
  return undefined
}

/**
 * Last `count` non-empty lines above the cursor, as runs of same-colored text.
 * Rows the terminal soft-wrapped are joined back into one logical line, so the
 * bubble can re-wrap them at its own width.
 */
export function readColoredLines(term: Terminal, count: number): Line[] {
  const buf = term.buffer.active
  const out: Line[] = []
  const last = buf.baseY + buf.cursorY
  let cell: IBufferCell | undefined
  for (let i = last; i >= 0 && i > last - 80 && out.length < count; ) {
    // Walk back to the first physical row of this logical line.
    let start = i
    while (start > 0 && buf.getLine(start)?.isWrapped) start--
    const segs: Seg[] = []
    let started = false
    for (let r = start; r <= i; r++) {
      const line = buf.getLine(r)
      if (!line) continue
      // Earlier rows of a wrapped line are full width; only the last one is trimmed.
      const len = r === i ? line.translateToString(true).length : line.length
      for (let x = 0; x < len; x++) {
        cell = line.getCell(x, cell)
        if (!cell || cell.getWidth() === 0) continue
        const ch = cell.getChars() || ' '
        // Drop leading indentation; bubbles are narrow.
        if (!started && ch === ' ') continue
        started = true
        const c = cellColor(cell)
        const b = !!cell.isBold()
        const prev = segs[segs.length - 1]
        if (prev && prev.c === c && !!prev.b === b) prev.t += ch
        else segs.push(b ? { t: ch, c, b } : { t: ch, c })
      }
    }
    if (segs.length) out.push(segs)
    i = start - 1
  }
  return out.reverse()
}

/** Most recent distinct URLs in the scrollback (wrapped lines joined), newest last. */
export function readLinks(term: Terminal): string[] {
  const buf = term.buffer.active
  const last = buf.baseY + buf.cursorY
  const logical: string[] = []
  for (let i = Math.max(0, last - LINK_SCAN_LINES); i <= last; i++) {
    const line = buf.getLine(i)
    if (!line) continue
    const text = line.translateToString(true)
    if (line.isWrapped && logical.length) logical[logical.length - 1] += text
    else logical.push(text)
  }
  const found: string[] = []
  for (const text of logical)
    for (const m of text.matchAll(URL_RE)) {
      const url = m[0].replace(/[).,;:!?\]}]+$/, '')
      const i = found.indexOf(url)
      if (i >= 0) found.splice(i, 1)
      found.push(url)
    }
  return found.slice(-MAX_LINKS)
}
