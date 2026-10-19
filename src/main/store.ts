import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_LANG, isLang, type Lang } from '../shared/i18n'
import type { DeskConfig, StoreData, ThemePref } from '../shared/types'

const file = () => join(app.getPath('userData'), 'office.json')
export const MAX_RECENT = 12

let cache: StoreData | null = null

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

export function loadStore(): StoreData {
  if (cache) return cache
  let data: StoreData = { desks: [], theme: 'system', recent: [], lang: DEFAULT_LANG }
  try {
    if (existsSync(file())) {
      const raw = JSON.parse(readFileSync(file(), 'utf8'))
      const desks: DeskConfig[] = Array.isArray(raw.desks) ? raw.desks : []
      let recent: string[] = Array.isArray(raw.recent) ? raw.recent.filter((r: unknown) => typeof r === 'string') : []
      // Configs from before the recent list existed: seed it with the open desks.
      if (!Array.isArray(raw.recent)) recent = [...new Set(desks.map((d) => d.cwd))]
      data = {
        desks,
        theme: ['system', 'light', 'dark'].includes(raw.theme) ? raw.theme : 'system',
        // Folders that were deleted/moved since are dropped.
        recent: recent.filter(isDir).slice(0, MAX_RECENT),
        lang: isLang(raw.lang) ? raw.lang : DEFAULT_LANG
      }
    }
  } catch (err) {
    console.error('store: failed to read', err)
  }
  cache = data
  return data
}

function persist(): void {
  if (!cache) return
  const target = file()
  mkdirSync(dirname(target), { recursive: true })
  const tmp = target + '.tmp'
  writeFileSync(tmp, JSON.stringify(cache, null, 2))
  renameSync(tmp, target)
}

export function saveDesks(desks: DeskConfig[]): void {
  loadStore().desks = desks
  persist()
}

export function saveTheme(theme: ThemePref): void {
  loadStore().theme = theme
  persist()
}

export function saveLang(lang: Lang): void {
  loadStore().lang = lang
  persist()
}

export function saveRecent(recent: string[]): void {
  loadStore().recent = recent.filter((r) => typeof r === 'string').slice(0, MAX_RECENT)
  persist()
}
