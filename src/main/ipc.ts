import { BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { isLang, translate, type Lang } from '../shared/i18n'
import type { DeskConfig, ThemePref, WindowMode } from '../shared/types'
import type { PtyManager } from './pty-manager'
import { loadStore, saveDesks, saveLang, saveOnboarded, saveRecent, saveTheme } from './store'

export interface WindowControls {
  setMode(mode: WindowMode): void
  minimize(): void
  hide(): void
  /** Language changed: rebuild native menus. */
  langChanged(): void
}

export function registerIpc(ptys: PtyManager, getWin: () => BrowserWindow | null, controls: WindowControls): void {
  ipcMain.handle('store:load', () => loadStore())
  ipcMain.handle('store:saveDesks', (_e, desks: DeskConfig[]) => saveDesks(desks))
  ipcMain.handle('store:setLang', (_e, lang: Lang) => {
    if (!isLang(lang)) return
    saveLang(lang)
    controls.langChanged()
  })
  ipcMain.handle('store:setOnboarded', (_e, done: boolean) => saveOnboarded(!!done))
  ipcMain.handle('store:saveRecent', (_e, recent: string[]) => saveRecent(recent))
  ipcMain.handle('store:setTheme', (_e, theme: ThemePref) => {
    nativeTheme.themeSource = theme
    saveTheme(theme)
  })

  ipcMain.handle('dialog:pickFolder', async () => {
    const win = getWin()
    const opts: Electron.OpenDialogOptions = { title: translate(loadStore().lang, 'main.pickFolder'), properties: ['openDirectory'] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  // Only real web links leave the app; anything else (file:, javascript:, custom schemes) is ignored.
  ipcMain.on('open:url', (_e, url: string) => {
    try {
      const u = new URL(url)
      if (u.protocol === 'http:' || u.protocol === 'https:') void shell.openExternal(u.toString())
    } catch {
      /* not a URL */
    }
  })

  ipcMain.handle('pty:create', (_e, desk: DeskConfig) => ptys.create(desk))
  ipcMain.on('pty:write', (_e, id: string, data: string) => ptys.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows))
  ipcMain.handle('pty:kill', (_e, id: string) => ptys.kill(id))
  ipcMain.handle('pty:snapshot', (_e, id: string) => ptys.snapshot(id))
  ipcMain.handle('pty:lines', (_e, id: string) => ptys.lines(id))

  ipcMain.on('win:setMode', (_e, mode: WindowMode) => controls.setMode(mode))
  ipcMain.on('win:minimize', () => controls.minimize())
  ipcMain.on('win:hide', () => controls.hide())
}
