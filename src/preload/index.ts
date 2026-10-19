import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

const on =
  <T>(channel: string) =>
  (cb: (payload: T) => void) => {
    ipcRenderer.on(channel, (_e, payload: T) => cb(payload))
  }

const api: Api = {
  platform: process.platform,
  store: {
    load: () => ipcRenderer.invoke('store:load'),
    saveDesks: (desks) => ipcRenderer.invoke('store:saveDesks', desks),
    setTheme: (theme) => ipcRenderer.invoke('store:setTheme', theme),
    saveRecent: (recent) => ipcRenderer.invoke('store:saveRecent', recent),
    setLang: (lang) => ipcRenderer.invoke('store:setLang', lang)
  },
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  openUrl: (url) => ipcRenderer.send('open:url', url),
  pty: {
    create: (desk) => ipcRenderer.invoke('pty:create', desk),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.invoke('pty:kill', id),
    snapshot: (id) => ipcRenderer.invoke('pty:snapshot', id),
    lines: (id) => ipcRenderer.invoke('pty:lines', id),
    onData: on('pty:data'),
    onLines: on('pty:lines'),
    onExit: on('pty:exit')
  },
  sys: {
    onCpu: on('sys:cpu')
  },
  win: {
    setMode: (mode) => ipcRenderer.send('win:setMode', mode),
    minimize: () => ipcRenderer.send('win:minimize'),
    hide: () => ipcRenderer.send('win:hide'),
    onMode: on('win:mode')
  }
}

contextBridge.exposeInMainWorld('api', api)
