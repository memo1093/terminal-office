/**
 * Renders the pixel-art icon (src/shared/icon-art.ts) into the files electron-builder
 * packages: build/icon.png (1024², macOS/Linux) and build/icon.ico (Windows, multi-size).
 * Run with `npm run icons` (Node ≥ 22.18 runs the TypeScript directly).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import { iconPixels, scalePixels, type Pixels } from '../src/shared/icon-art.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'build')

function png(p: Pixels): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(body.length)
    const tb = Buffer.concat([Buffer.from(type, 'ascii'), body])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(tb))
    return Buffer.concat([len, tb, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(p.size, 0)
  ihdr.writeUInt32BE(p.size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // Each scanline is prefixed with filter type 0.
  const raw = Buffer.alloc((p.size * 4 + 1) * p.size)
  for (let y = 0; y < p.size; y++) {
    raw[y * (p.size * 4 + 1)] = 0
    Buffer.from(p.data.buffer, p.data.byteOffset + y * p.size * 4, p.size * 4).copy(raw, y * (p.size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** ICO with PNG-compressed entries (supported since Windows Vista). */
function ico(images: Pixels[]): Buffer {
  const pngs = images.map(png)
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

const full = iconPixels('full') // 32×32
const tiny = iconPixels('small-tile') // 16×16, readable at taskbar size

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'icon.png'), png(scalePixels(full, 32))) // 1024²
// Windows picks the closest size: hand-drawn 16 for small, integer upscales elsewhere.
writeFileSync(
  join(out, 'icon.ico'),
  ico([tiny, full, scalePixels(tiny, 3), scalePixels(full, 2), scalePixels(full, 4), scalePixels(full, 8)])
)
console.log('wrote', join(out, 'icon.png'), 'and', join(out, 'icon.ico'))

// Optional preview sheet for eyeballing the design: `npm run icons -- --preview <file.png>`.
const i = process.argv.indexOf('--preview')
if (i > 0 && process.argv[i + 1]) {
  const sheet = scalePixels(full, 8)
  writeFileSync(process.argv[i + 1], png(sheet))
  writeFileSync(process.argv[i + 1].replace(/\.png$/, '-small.png'), png(scalePixels(tiny, 8)))
  writeFileSync(process.argv[i + 1].replace(/\.png$/, '-tray.png'), png(scalePixels(iconPixels('small'), 8)))
}
