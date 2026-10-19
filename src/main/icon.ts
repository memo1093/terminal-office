import { nativeImage, type NativeImage } from 'electron'

// Tiny "office worker" glyph, same silhouette as the in-app characters.
const GLYPH = [
  '..XXXXXXXX..',
  '..XXXXXXXX..',
  '..XEXXXXEX..',
  'XXXEXXXXEXXX',
  'XXXXXXXXXXXX',
  '..XXXXXXXX..',
  '..XXXXXXXX..',
  '..X.X..X.X..',
  '..X.X..X.X..'
]

/** Builds the icon from pixel data at runtime so the app ships no image assets. */
export function makeIcon(size = 16): NativeImage {
  const scale = Math.max(1, Math.floor(size / 16))
  const px = 16 * scale
  const buf = Buffer.alloc(px * px * 4)
  const ox = 2
  const oy = 3
  const set = (x: number, y: number, [r, g, b]: number[]) => {
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++) {
        const i = ((y * scale + dy) * px + x * scale + dx) * 4
        // Bitmap buffers are BGRA.
        buf[i] = b
        buf[i + 1] = g
        buf[i + 2] = r
        buf[i + 3] = 255
      }
  }
  GLYPH.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === 'X') set(x + ox, y + oy, [217, 119, 87])
      else if (c === 'E') set(x + ox, y + oy, [40, 30, 28])
    })
  )
  return nativeImage.createFromBitmap(buf, { width: px, height: px })
}
