import { join } from 'node:path'
import { app, BrowserWindow, Menu, nativeTheme, screen, Tray, type Rectangle } from 'electron'
import { translate, type Key } from '../shared/i18n'
import type { WindowMode } from '../shared/types'
import { startCpuSampler } from './cpu'
import { makeIcon } from './icon'
import { registerIpc } from './ipc'
import { PtyManager } from './pty-manager'
import { loadStore } from './store'

const isMac = process.platform === 'darwin'
const MINI = { width: 480, height: 320 }
const NORMAL_MIN = { width: 560, height: 380 }

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let mode: WindowMode = 'normal'
let normalBounds: Rectangle | null = null

const send = (channel: string, payload: unknown) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

const ptys = new PtyManager({
  data: (e) => send('pty:data', e),
  lines: (e) => send('pty:lines', e),
  exit: (e) => send('pty:exit', e)
})

function showWindow(): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function setMode(next: WindowMode): void {
  if (!win || next === mode) return
  // macOS: a fullscreen window can't be resized/pinned; leave fullscreen first.
  if (next === 'mini' && win.isFullScreen()) {
    win.once('leave-full-screen', () => setMode(next))
    win.setFullScreen(false)
    return
  }
  if (next === 'mini') {
    if (win.isMaximized()) win.unmaximize()
    normalBounds = win.getBounds()
    const wa = screen.getDisplayMatching(normalBounds).workArea
    win.setMinimumSize(280, 190)
    win.setBounds({
      x: wa.x + wa.width - MINI.width - 12,
      y: wa.y + 12,
      width: MINI.width,
      height: MINI.height
    })
    win.setAlwaysOnTop(true, 'floating')
    // skipTransformProcessType keeps the macOS dock icon.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    win.setSkipTaskbar(true)
    if (isMac) win.setWindowButtonVisibility(false)
  } else {
    win.setAlwaysOnTop(false)
    win.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true })
    win.setSkipTaskbar(false)
    if (isMac) win.setWindowButtonVisibility(true)
    win.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height)
    if (normalBounds) win.setBounds(normalBounds)
  }
  mode = next
  showWindow()
  send('win:mode', mode)
  rebuildTrayMenu()
}

const t = (key: Key) => translate(loadStore().lang, key)

function rebuildTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('tray.show'), click: showWindow },
      {
        label: mode === 'mini' ? t('tray.normal') : t('tray.mini'),
        click: () => setMode(mode === 'mini' ? 'normal' : 'mini')
      },
      { type: 'separator' },
      {
        label: t('tray.quit'),
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

/** Hide to tray/dock; without a tray (some Linux desktops) just minimize so the window stays reachable. */
function hideWindow(): void {
  if (!win) return
  if (tray || isMac) win.hide()
  else win.minimize()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: NORMAL_MIN.width,
    minHeight: NORMAL_MIN.height,
    // macOS keeps native traffic lights inside our custom title bar; elsewhere fully frameless.
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 13 } } : { frame: false }),
    show: false,
    title: 'Terminal Office',
    icon: makeIcon(32),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#2b2a2e' : '#e9e4da',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win?.show())
  win.on('close', (e) => {
    if (quitting) return
    // Closing only hides to the tray; terminals keep running.
    e.preventDefault()
    hideWindow()
  })
  // Never let the renderer open new windows or navigate away.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  // macOS: clicking the dock icon brings the hidden window back.
  app.on('activate', showWindow)

  app.whenReady().then(() => {
    // macOS needs an app menu for Cmd+C/V/Q; other platforms get none.
    Menu.setApplicationMenu(
      isMac ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null
    )
    if (isMac) app.dock?.setIcon(makeIcon(128))
    nativeTheme.themeSource = loadStore().theme

    registerIpc(ptys, () => win, {
      setMode,
      minimize: () => win?.minimize(),
      hide: hideWindow,
      langChanged: rebuildTrayMenu
    })
    createWindow()
    // Only sample while someone can see the number.
    startCpuSampler((s) => send('sys:cpu', s), () => !!win && win.isVisible() && !win.isMinimized())

    try {
      tray = new Tray(makeIcon(16))
      tray.setToolTip('Terminal Office')
      // On macOS a click opens the menu; elsewhere it toggles the window.
      if (!isMac) tray.on('click', () => (win?.isVisible() ? win.hide() : showWindow()))
      rebuildTrayMenu()
    } catch (err) {
      console.warn('tray unavailable, closing will minimize instead', err)
      tray = null
    }
  })

  app.on('before-quit', () => {
    quitting = true
    ptys.killAll()
  })
}
