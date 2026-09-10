import { contextBridge, ipcRenderer } from 'electron'
import type { CompanionApi, Snapshot } from '../shared/types.js'

const api: CompanionApi = {
  getSnapshot: () => ipcRenderer.invoke('companion:getSnapshot'),
  onSnapshot: (cb: (snapshot: Snapshot) => void) => {
    const listener = (_event: unknown, snapshot: Snapshot): void => cb(snapshot)
    ipcRenderer.on('companion:snapshot', listener)
    return () => ipcRenderer.removeListener('companion:snapshot', listener)
  },
  openBoard: (task, view) => ipcRenderer.send('companion:openBoard', task, view),
  copyMessage: (key) => ipcRenderer.send('companion:copyMessage', key),
  dismissMessage: (key) => ipcRenderer.send('companion:dismissMessage', key),
  checkNow: () => ipcRenderer.send('companion:checkNow'),
  notifyNow: () => ipcRenderer.send('companion:notifyNow')
}

contextBridge.exposeInMainWorld('companion', api)
