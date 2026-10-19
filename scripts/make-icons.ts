/**
 * Renders the pixel-art brand assets electron-builder packages, all from
 * src/shared/icon-art.ts:
 *   build/icon.png, build/icon.ico            app icon (macOS/Linux, Windows multi-size)
 *   build/background.png, background@2x.png   DMG window background (macOS)
 *   build/installerSidebar.bmp, uninstallerSidebar.bmp, installerHeader.bmp   NSIS wizard
 * Run with `npm run icons` (Node ≥ 22.18 runs the TypeScript directly).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import { iconPixels, scalePixels, type Pixels } from '../src/shared/icon-art.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'build')

// ---- tiny raster helpers ------------------------------------------------------

interface Img {
  w: number
  h: number
  data: Uint8ClampedArray
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 0xff, n & 0xff]
}
const fromPixels = (p: Pixels): Img => ({ w: p.size, h: p.size, data: p.data })

function canvas(w: number, h: number, hex?: string): Img {
  const img = { w, h, data: new Uint8ClampedArray(w * h * 4) }
  if (hex) rect(img, 0, 0, w, h, hex)
  return img
}

function rect(img: Img, x: number, y: number, w: number, h: number, hex: string): void {
  const [r, g, b] = rgb(hex)
  for (let j = Math.max(0, y); j < Math.min(img.h, y + h); j++)
    for (let i = Math.max(0, x); i < Math.min(img.w, x + w); i++) img.data.set([r, g, b, 255], (j * img.w + i) * 4)
}

/** Copies `src` onto `dst` at (x, y), integer-scaled, skipping transparent pixels. */
function blit(dst: Img, src: Img, x: number, y: number, scale = 1): void {
  for (let j = 0; j < src.h * scale; j++)
    for (let i = 0; i < src.w * scale; i++) {
      const s = (Math.floor(j / scale) * src.w + Math.floor(i / scale)) * 4
      if (!src.data[s + 3]) continue
      const dx = x + i
      const dy = y + j
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue
      dst.data.set(src.data.subarray(s, s + 4), (dy * dst.w + dx) * 4)
    }
}

const upscale = (img: Img, k: number): Img => {
  const o = canvas(img.w * k, img.h * k)
  blit(o, img, 0, 0, k)
  return o
}

// 5-row pixel font, variable width (only what the assets spell).
const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  ' ': ['...', '...', '...', '...', '...']
}
const advance = (ch: string) => GLYPHS[ch][0].length + 1
const textWidth = (s: string) => [...s].reduce((w, ch) => w + advance(ch), -1)

function text(img: Img, s: string, x: number, y: number, hex: string): void {
  let cx = x
  for (const ch of s) {
    GLYPHS[ch].forEach((row, j) => [...row].forEach((c, i) => c === '#' && rect(img, cx + i, y + j, 1, 1, hex)))
    cx += advance(ch)
  }
}

// ---- encoders ---------------------------------------------------------------------

function png(img: Img): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(body.length)
    const tb = Buffer.concat([Buffer.from(type, 'ascii'), body])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(tb))
    return Buffer.concat([len, tb, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(img.w, 0)
  ihdr.writeUInt32BE(img.h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // Each scanline is prefixed with filter type 0.
  const stride = img.w * 4
  const raw = Buffer.alloc((stride + 1) * img.h)
  for (let y = 0; y < img.h; y++) Buffer.from(img.data.buffer, img.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** ICO with PNG-compressed entries (supported since Windows Vista). */
function ico(images: Pixels[]): Buffer {
  const pngs = images.map((p) => png(fromPixels(p)))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const dir = images.map((img, i) => {
    const e = Buffer.alloc(16)
    e[0] = img.size >= 256 ? 0 : img.size
    e[1] = img.size >= 256 ? 0 : img.size
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bpp
    e.writeUInt32LE(pngs[i].length, 8)
    e.writeUInt32LE(offset, 12)
    offset += pngs[i].length
    return e
  })
  return Buffer.concat([header, ...dir, ...pngs])
}

/** 24-bit bottom-up BMP (what NSIS wizard images must be); transparency → `bg`. */
function bmp(img: Img, bg: string): Buffer {
  const [br, bgc, bb] = rgb(bg)
  const stride = Math.ceil((img.w * 3) / 4) * 4
  const size = 54 + stride * img.h
  const b = Buffer.alloc(size)
  b.write('BM', 0)
  b.writeUInt32LE(size, 2)
  b.writeUInt32LE(54, 10)
  b.writeUInt32LE(40, 14)
  b.writeInt32LE(img.w, 18)
  b.writeInt32LE(img.h, 22)
  b.writeUInt16LE(1, 26)
  b.writeUInt16LE(24, 28)
  b.writeUInt32LE(stride * img.h, 34)
  b.writeInt32LE(2835, 38) // 72 dpi
  b.writeInt32LE(2835, 42)
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * 4
      const o = 54 + (img.h - 1 - y) * stride + x * 3
      const a = img.data[s + 3] > 0
      b[o] = a ? img.data[s + 2] : bb
      b[o + 1] = a ? img.data[s + 1] : bgc
      b[o + 2] = a ? img.data[s] : br
    }
  return b
}

// ---- assets -----------------------------------------------------------------------

const full = iconPixels('full') // 32×32
const tiny = iconPixels('small-tile') // 16×16, readable at taskbar size
const worker = fromPixels(iconPixels('small'))

const INK = '#2e2925'
const ACCENT = '#d97757'

/** DMG window at 1/4 scale (135×95 art px → 540×380): app on the left, arrow to Applications. */
function dmgBackground(): Img {
  const img = canvas(135, 95, '#efe9de')
  // Soft checkered floor like the app's light theme.
  for (let y = 0; y < 95; y += 5) for (let x = (y / 5) % 2 ? 5 : 0; x < 135; x += 10) rect(img, x, y, 5, 5, '#f4f0e8')
  rect(img, 0, 0, 135, 2, '#e2dbcf')
  // Dashed arrow between the icon slots (Finder draws the icons at x=130 and x=410 px).
  for (let x = 50; x < 82; x += 4) rect(img, x, 47, 2, 1, ACCENT)
  for (let k = 0; k < 4; k++) rect(img, 82 + k, 44 + k, 1, 7 - 2 * k, ACCENT)
  const label = 'DRAG TO APPLICATIONS'
  text(img, label, Math.round((135 - textWidth(label)) / 2), 80, INK)
  return img
}

/** NSIS welcome/finish sidebar, 164×314: big icon + name on the dark tile color. */
function sidebar(): Img {
  // A step darker than the icon tile, so the icon reads as a badge.
  const img = canvas(164, 314, '#1c1b22')
  rect(img, 0, 250, 164, 64, '#26252d')
  blit(img, fromPixels(full), 18, 46, 4) // 128×128
  const big = canvas(164, 30)
  text(big, 'TERMINAL', Math.round((82 - textWidth('TERMINAL')) / 2), 0, '#f3eee5')
  text(big, 'OFFICE', Math.round((82 - textWidth('OFFICE')) / 2), 8, ACCENT)
  blit(img, big, 0, 196, 2)
  // A little worker on the floor strip.
  blit(img, worker, 66, 262, 2)
  return img
}

/** NSIS page header, 150×57: the worker on the light header background. */
function header(): Img {
  const img = canvas(150, 57, '#ffffff')
  blit(img, worker, 102, 4, 3) // 48×48
  return img
}

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'icon.png'), png(fromPixels(scalePixels(full, 32)))) // 1024²
// Windows picks the closest size: hand-drawn 16 for small, integer upscales elsewhere.
writeFileSync(join(out, 'icon.ico'), ico([tiny, full, scalePixels(tiny, 3), scalePixels(full, 2), scalePixels(full, 4), scalePixels(full, 8)]))
const dmg = dmgBackground()
writeFileSync(join(out, 'background.png'), png(upscale(dmg, 4)))
writeFileSync(join(out, 'background@2x.png'), png(upscale(dmg, 8)))
writeFileSync(join(out, 'installerSidebar.bmp'), bmp(sidebar(), '#1c1b22'))
writeFileSync(join(out, 'uninstallerSidebar.bmp'), bmp(sidebar(), '#1c1b22'))
writeFileSync(join(out, 'installerHeader.bmp'), bmp(header(), '#ffffff'))
console.log('wrote icon.png, icon.ico, background(@2x).png, installer BMPs to', out)

// Preview sheets for eyeballing: `npm run icons -- --preview <file.png>`.
const i = process.argv.indexOf('--preview')
if (i > 0 && process.argv[i + 1]) {
  const base = process.argv[i + 1].replace(/\.png$/, '')
  writeFileSync(`${base}.png`, png(fromPixels(scalePixels(full, 8))))
  writeFileSync(`${base}-dmg.png`, png(upscale(dmg, 4)))
  writeFileSync(`${base}-sidebar.png`, png(upscale(sidebar(), 2)))
  writeFileSync(`${base}-header.png`, png(upscale(header(), 3)))
}
