export interface Palette {
  dark: boolean
  bg: string
  floorA: string
  floorB: string
  wallTop: string
  wallLeft: string
  wallRight: string
  door: string
  doorFrame: string
  /** Contrast outline drawn around every sprite. */
  outline: string
  deskTop: string
  deskLeft: string
  deskRight: string
  monitor: string
  monitorLed: string
  chair: string
  chairDark: string
  eye: string
  text: string
  labelBg: string
  bubbleBg: string
  bubbleText: string
  hover: string
  link: string
  muted: string
}

const light: Palette = {
  dark: false,
  bg: '#e4dfd5',
  floorA: '#f4f1ea',
  floorB: '#efebe2',
  wallTop: '#d6cfc2',
  wallLeft: '#e2dcd0',
  wallRight: '#d9d2c5',
  door: '#b9a58c',
  doorFrame: '#9d8a72',
  outline: '#2e2925',
  deskTop: '#c9a77e',
  deskLeft: '#a8865f',
  deskRight: '#b8956c',
  monitor: '#4a4a52',
  monitorLed: '#7ad17a',
  chair: '#6d7480',
  chairDark: '#565c66',
  eye: '#231d1a',
  text: '#2e2925',
  labelBg: '#fffdf8',
  bubbleBg: '#fffdf8',
  bubbleText: '#2e2925',
  hover: '#e6a23c',
  link: '#2f6db3',
  muted: '#6f675e'
}

// Dark theme still keeps a soft, light-ish floor so the room never turns into a black hole.
const dark: Palette = {
  dark: true,
  bg: '#252429',
  floorA: '#5b5852',
  floorB: '#56534d',
  wallTop: '#3d3b40',
  wallLeft: '#47454b',
  wallRight: '#424046',
  door: '#7a6a58',
  doorFrame: '#5e5244',
  outline: '#f3eee5',
  deskTop: '#9c7d5c',
  deskLeft: '#7a5f43',
  deskRight: '#8a6d4f',
  monitor: '#2b2b31',
  monitorLed: '#7ad17a',
  chair: '#3a3f47',
  chairDark: '#30343b',
  eye: '#1d1816',
  text: '#f3eee5',
  labelBg: '#35333a',
  bubbleBg: '#35333a',
  bubbleText: '#f3eee5',
  hover: '#f0b450',
  link: '#79aef0',
  muted: '#b8b2a8'
}

export const getPalette = (isDark: boolean): Palette => (isDark ? dark : light)

/** One body color per terminal; index stored in DeskConfig.color. */
export const BODY_COLORS = [
  '#d97757', // claude orange
  '#6a9bd8',
  '#7bbf6a',
  '#c58ad6',
  '#e0b84a',
  '#5fbfb5',
  '#e07a9a',
  '#9aa3ad'
]

/** Desk top colors, one per project (index stored in DeskConfig.projectColor). */
export const DESK_COLORS = [
  '#c9a77e', // natural wood
  '#7fb3a8', // teal
  '#a9c27f', // sage
  '#b9a3d6', // lavender
  '#d9b85f', // mustard
  '#d99a9a', // rose
  '#8fa8cf', // slate blue
  '#d0896a' // terracotta
]

/** Top / front-left / front-right face colors for a project desk. */
export function deskShades(idx: number, pal: Palette): { top: string; left: string; right: string } {
  const top = shade(DESK_COLORS[idx % DESK_COLORS.length], pal.dark ? -0.14 : 0)
  return { top, left: shade(top, -0.13), right: shade(top, -0.06) }
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt * 255)))
  const r = f(n >> 16)
  const g = f((n >> 8) & 0xff)
  const b = f(n & 0xff)
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)
}
