import type { Api, DeskConfig, Line, PtyData, PtyLines, StoreData } from '../shared/types'

/**
 * Fake backend so the renderer can be developed/previewed in a plain browser
 * (`electron-vite dev` serves it on localhost). Never used inside Electron.
 */
// Tiny SGR parser (30–37 / 90–97 / 0) — enough to fake colored bubbles.
function parse(text: string): Line {
  const segs: Line = []
  let c: number | undefined
  for (const part of text.split(/(\x1b\[[0-9;]*m)/)) {
    const m = /^\x1b\[([0-9;]*)m$/.exec(part)
    if (m) {
      const n = Number(m[1] || 0)
      c = n >= 30 && n <= 37 ? n - 30 : n >= 90 && n <= 97 ? n - 82 : undefined
    } else if (part) segs.push({ t: part, c })
  }
  return segs
}

function toLines(id: string, raw: string[]): PtyLines {
  const links = raw.join(' ').match(/https?:\/\/[^\s]+/g) ?? []
  return { id, lines: raw.slice(-10).map(parse), links: [...new Set(links)].slice(-2) }
}

export function createMockApi(): Api {
  const dataCbs: ((e: PtyData) => void)[] = []
  const modeCbs: ((m: 'normal' | 'mini') => void)[] = []
  const lineCbs: ((e: PtyLines) => void)[] = []
  const out = new Map<string, string[]>()
  const seq = new Map<string, number>()
  const store: StoreData = {
    theme: 'system',
    lang: 'en',
    recent: ['D:\\Projects\\portfolyo', 'D:\\Projects\\terminal-office', 'D:\\Projects\\GameStore', 'D:\\Projects\\netflix-app', 'D:\\Projects\\nuxt-tuto'],
    desks: [
      { id: 'a', cwd: 'D:\\Projects\\portfolyo', shell: 'powershell.exe', slot: 0, color: 0 },
      { id: 'b', cwd: 'D:\\Projects\\terminal-office', shell: 'powershell.exe', slot: 1, color: 1 },
      { id: 'c', cwd: 'D:\\Projects\\GameStore', shell: 'powershell.exe', slot: 4, color: 2 },
      { id: 'd', cwd: 'C:\\work\\portfolyo', shell: 'powershell.exe', slot: 2, color: 3 }
    ]
  }

  const emit = (id: string, text: string) => {
    const s = seq.get(id) ?? 0
    seq.set(id, s + text.length)
    dataCbs.forEach((cb) => cb({ id, data: text, seq: s }))
    const lines = out.get(id) ?? []
    lines.push(...text.split(/\r?\n/).filter((l) => l.trim()))
    out.set(id, lines.slice(-200))
    lineCbs.forEach((cb) => cb(toLines(id, lines)))
  }

  const samples = [
    'npm run dev',
    'VITE v8.3.4  ready in 312 ms',
    '➜  Local:   http://localhost:5173/',
    'git status',
    'On branch main — nothing to commit',
    'Compiling… 42 modules transformed',
    '\x1b[32m✓ built\x1b[0m in 1.24s',
    'npm \x1b[33mWARN\x1b[0m deprecated inflight@1.0.6',
    'Error: Cannot find module ./foo'
  ]
  let n = 0
  setInterval(() => {
    const ids = store.desks.map((d) => d.id)
    if (!ids.length) return
    emit(ids[n % ids.length], samples[n % samples.length] + '\r\n')
    n++
  }, 2600)

  return {
    platform: 'win32',
    openUrl: (url) => console.log('[mock] open', url),
    store: {
      load: async () => structuredClone(store),
      saveDesks: async (desks: DeskConfig[]) => void (store.desks = desks),
      setTheme: async (t) => void (store.theme = t),
      saveRecent: async (r) => void (store.recent = r),
      setLang: async (l) => void (store.lang = l)
    },
    pickFolder: async () => `D:\\Projects\\demo-${Math.floor(Math.random() * 100)}`,
    pty: {
      create: async (d) => {
        if (!out.has(d.id)) emit(d.id, `PS ${d.cwd}> \r\n`)
        return { ok: true }
      },
      write: (id, data) => emit(id, data.replace(/\r$/, '') + '\r\n(mock) output: ' + data.trim() + '\r\n'),
      resize: () => {},
      kill: async (id) => void out.delete(id),
      snapshot: async (id) => ({ data: (out.get(id) ?? []).join('\r\n') + '\r\n', seq: seq.get(id) ?? 0 }),
      lines: async (id) => toLines(id, out.get(id) ?? []),
      onData: (cb) => void dataCbs.push(cb),
      onLines: (cb) => void lineCbs.push(cb),
      onExit: () => {}
    },
    sys: {
      onCpu: (cb) => void setInterval(() => cb({ total: Math.round(10 + Math.random() * 85), app: 1.2 }), 2000)
    },
    win: {
      setMode: (m) => modeCbs.forEach((cb) => cb(m)),
      minimize: () => {},
      hide: () => {},
      onMode: (cb) => void modeCbs.push(cb)
    }
  }
}
