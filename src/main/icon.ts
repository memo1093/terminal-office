import { nativeImage, type NativeImage } from 'electron'
import { iconPixels, scalePixels, type IconVariant, type Pixels } from '../shared/icon-art'

/** nativeImage bitmaps are BGRA. */
function bitmap(p: Pixels): NativeImage {
  const buf = Buffer.alloc(p.data.length)
  for (let i = 0; i < p.data.length; i += 4) {
    buf[i] = p.data[i + 2]
    buf[i + 1] = p.data[i + 1]
    buf[i + 2] = p.data[i]
    buf[i + 3] = p.data[i + 3]
  }
  return nativeImage.createFromBitmap(buf, { width: p.size, height: p.size })
}

/**
 * Pixel-art icon built at runtime from src/shared/icon-art.ts (the same art as the
 * packaged build/icon.*), with a crisp @2x representation for HiDPI screens.
 * `scale` enlarges the base size (e.g. 16 for the 512px macOS dock icon).
 */
export function makeIcon(variant: IconVariant, scale = 1): NativeImage {
  const base = iconPixels(variant)
  const img = bitmap(scalePixels(base, scale))
  img.addRepresentation({ scaleFactor: 2, buffer: bitmap(scalePixels(base, scale * 2)).toPNG() })
  return img
}
