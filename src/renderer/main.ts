import './styles.css'
import type { Api, CpuSample, DeskConfig, ThemePref } from '../shared/types'
import { iconPixels, scalePixels } from '../shared/icon-art'
import { currentLang, onLangChange, setLang, t } from './i18n'
import { Office } from './scene/office'
import { BODY_COLORS, DESK_COLORS } from './scene/palette'
import { AddDialog } from './ui/add-dialog'
import { CommandInput } from './ui/command-input'
import { ConsolePanel } from './ui/console-panel'
import { SettingsDialog } from './ui/settings-dialog'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/** Title bar logo: the app icon's 16px art, drawn at a whole number of device pixels per art pixel. */
function drawLogos(): void {
  const k = Math.max(1, Math.round(window.devicePixelRatio || 1))
  const p = scalePixels(iconPixels('small'), k)
  for (const c of document.querySelectorAll<HTMLCanvasElement>('canvas.logo')) {
    c.width = c.height = p.size
    c.style.width = c.style.height = `${p.size / (window.devicePixelRatio || 1)}px`
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.size, p.size), 0, 0)
  }
}

const folderName = (cwd: string) => cwd.split(/[\\/]+/).filter(Boolean).pop() ?? cwd
/** Desks sharing a folder name count as the same project. */
const projectKey = (d: DeskConfig) => folderName(d.cwd).toLowerCase()

/** Path equality that ignores trailing separators (and case on Windows/macOS). */
const normPath = (p: string, platform: string) => {
  const s = p.replace(/[\\/]+$/, '')
  return platform === 'linux' ? s : s.toLowerCase()
}

/** Least used index among `used`, so neighbours get different colors. */
const leastUsed = (size: number, used: number[]) => {
  const counts = Array.from({ length: size }, (_, i) => used.filter((u) => u === i).length)
  return counts.indexOf(Math.min(...counts))
}

async function init(): Promise<void> {
  // Outside Electron (plain browser dev server) fall back to a fake backend.
  const api: Api = window.api ?? (await import('./mock-api')).createMockApi()

  document.body.classList.add(`platform-${api.platform}`)
  drawLogos()
  const office = new Office($<HTMLCanvasElement>('office'))
  if (import.meta.env.DEV) Object.assign(window, { office })
  const cmd = new CommandInput(api)
  const panel = new ConsolePanel(api)
  const store = await api.store.load()
  setLang(store.lang ?? 'en')
  let desks: DeskConfig[] = store.desks
  let theme: ThemePref = store.theme
  let recent: string[] = store.recent ?? []

  const save = () => api.store.saveDesks(desks)
  const colorOf = (d: DeskConfig) => BODY_COLORS[d.color % BODY_COLORS.length]
  const find = (id: string) => desks.find((d) => d.id === id)

  /** Same project → same desk color; a new project gets the least used one. */
  function projectColorFor(d: DeskConfig, others: DeskConfig[]): number {
    const sibling = others.find((o) => o !== d && o.projectColor !== undefined && projectKey(o) === projectKey(d))
    if (sibling) return sibling.projectColor!
    const perProject = new Map<string, number>()
    for (const o of others) if (o.projectColor !== undefined) perProject.set(projectKey(o), o.projectColor)
    return leastUsed(DESK_COLORS.length, [...perProject.values()])
  }

  // Older configs have no project colors yet.
  let migrated = false
  for (const d of desks)
    if (d.projectColor === undefined) {
      d.projectColor = projectColorFor(d, desks)
      migrated = true
    }
  if (migrated) save()

  /** "api" alone, or "api #1", "api #2"… when several terminals share the project. */
  function displayName(d: DeskConfig): string {
    const group = desks.filter((o) => projectKey(o) === projectKey(d))
    const name = folderName(d.cwd)
    return group.length > 1 ? `${name} #${group.indexOf(d) + 1}` : name
  }

  const refreshMeta = () => {
    for (const d of desks) office.setMeta(d.id, displayName(d), d.projectColor ?? 0)
  }

  async function spawn(d: DeskConfig, delay: number): Promise<void> {
    office.addDesk({ id: d.id, name: displayName(d), slot: d.slot, color: d.color, deskColor: d.projectColor ?? 0 }, delay)
    refreshMeta()
    const res = await api.pty.create(d)
    if (res.exited) office.setExited(d.id, true)
    const l = await api.pty.lines(d.id)
    if (l.lines.length || l.links.length) office.setLines(d.id, l.lines, l.links)
  }

  const samePath = (a: string, b: string) => normPath(a, api.platform) === normPath(b, api.platform)

  /** Moves `cwd` to the top of the recent projects list. */
  function touchRecent(cwd: string): void {
    recent = [cwd, ...recent.filter((r) => !samePath(r, cwd))].slice(0, 12)
    void api.store.saveRecent(recent)
  }

  const addDialog = new AddDialog((cwd) => {
    const open = desks.filter((d) => samePath(d.cwd, cwd)).length
    const sibling = desks.find((d) => projectKey(d) === folderName(cwd).toLowerCase())
    const color = sibling?.projectColor !== undefined ? DESK_COLORS[sibling.projectColor % DESK_COLORS.length] : undefined
    return { open, color }
  })
  addDialog.onBrowse = async () => {
    const cwd = await api.pickFolder()
    if (cwd) await addDesk(cwd)
  }
  addDialog.onChoose = (cwd) => void addDesk(cwd)
  addDialog.onForget = (cwd) => {
    recent = recent.filter((r) => !samePath(r, cwd))
    void api.store.saveRecent(recent)
    addDialog.render(recent)
  }

  async function addDesk(cwd: string): Promise<void> {
    touchRecent(cwd)
    const color = leastUsed(
      BODY_COLORS.length,
      desks.map((d) => d.color)
    )
    const d: DeskConfig = { id: crypto.randomUUID(), cwd, shell: '', slot: office.freeSlot(), color }
    d.projectColor = projectColorFor(d, desks)
    desks = [...desks, d]
    save()
    await spawn(d, 0)
  }

  async function deleteDesk(id: string): Promise<void> {
    desks = desks.filter((d) => d.id !== id)
    save()
    office.removeDesk(id)
    refreshMeta()
    await api.pty.kill(id)
  }

  api.pty.onData((e) => {
    office.activity(e.id)
    panel.onData(e)
  })
  api.pty.onLines((e) => office.setLines(e.id, e.lines, e.links))
  api.pty.onExit((e) => office.setExited(e.id, true))

  office.onCharClick = (id) => {
    const d = find(id)
    if (d) cmd.open(id, displayName(d), colorOf(d))
  }
  office.onDeskClick = (id) => {
    const d = find(id)
    if (d) panel.open(id, displayName(d), d.cwd, colorOf(d), office.palette.dark)
  }
  office.onLinkClick = (url) => api.openUrl(url)
  panel.onDelete = (id) => void deleteDesk(id)

  // ---- window chrome ----
  // Theme and language live in the ⚙ Settings dialog.
  const settings = new SettingsDialog()
  settings.onTheme = (next) => {
    theme = next
    void api.store.setTheme(theme)
  }
  settings.onLang = (lang) => {
    setLang(lang)
    void api.store.setLang(lang)
  }
  $('btn-settings').addEventListener('click', () => settings.open(currentLang(), theme))
  onLangChange(() => {
    office.refresh()
    if (addDialog.isOpen) addDialog.render(recent)
  })

  // CPU readout (top right; in the mini bar when minimised to mini mode).
  const cpuEls = [$('cpu'), $('mini-cpu')]
  let lastCpu: CpuSample | null = null
  const showCpu = () => {
    if (!lastCpu) return
    for (const el of cpuEls) {
      el.textContent = `CPU ${lastCpu.total}%`
      el.title = t('cpu.title', { app: lastCpu.app })
      el.classList.toggle('warn', lastCpu.total >= 50 && lastCpu.total < 80)
      el.classList.toggle('high', lastCpu.total >= 80)
    }
  }
  api.sys.onCpu((s) => {
    lastCpu = s
    showCpu()
  })
  onLangChange(showCpu)

  $('btn-add').addEventListener('click', () => addDialog.open(recent))
  $('mini-add').addEventListener('click', () => addDialog.open(recent))
  $('btn-mini').addEventListener('click', () => api.win.setMode('mini'))
  $('mini-restore').addEventListener('click', () => api.win.setMode('normal'))
  $('btn-min').addEventListener('click', () => api.win.minimize())
  $('btn-hide').addEventListener('click', () => api.win.hide())
  $('mini-hide').addEventListener('click', () => api.win.hide())
  api.win.onMode((mode) => {
    document.body.classList.toggle('mini', mode === 'mini')
    office.setMini(mode === 'mini')
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cmd.isOpen) cmd.close()
  })

  // Restore saved desks; workers walk in one after another.
  desks.forEach((d, i) => void spawn(d, i * 450))
}

void init()
