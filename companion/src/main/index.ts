/* The desktop companion: a tray icon and a small window, replacing the
   AppKit menu bar app that used to live at companion/app.py (retired
   alongside this). Same contract as before — reads data/twinkl/todo.md and
   friends straight off disk, never writes todo.md, says one thing each
   working morning — with room to actually show the planning agent's plans
   instead of only saying "it happened".

   Run it in dev with `npm run dev` (dev.command), or:
     python3 ... not required at runtime except as digest.py's own
     interpreter, which this shells out to once a tick — see digest.ts.
*/

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, clipboard, nativeImage } from 'electron'
import type { Digest, Snapshot } from '../shared/types.js'
import { runDigest } from './digest.js'
import { planListing } from './plans.js'
import { readNightRun } from './night.js'
import { drainQueue } from './notifyQueue.js'
import { readState, writeState, type CompanionState } from './state.js'
import { readBucketColors } from './buckets.js'
import { openBoard } from './boardUrl.js'

const dirname_ = fileURLToPath(new URL('.', import.meta.url))
// out/main/ -> this app's own resources (the compiled JS, the tray icons).
// Only used to find those, and even then only as a starting guess — see
// findRepoRoot below.
const APP_DIR = path.resolve(dirname_, '..', '..')

/** The live to-dos checkout, where data/, digest.py and To-Do Board.app
    actually are — not necessarily APP_DIR's parent. A packaged .app is a
    frozen copy of this whole project under Contents/Resources/app, cut off
    from the real repo, so `../data` from there doesn't exist. The old
    launcher script solved the same problem the same way: guess from where
    this is running, and fall back to the one machine this has ever run on
    when the guess comes up empty (companion/build-app.command, now retired,
    had the identical fallback). */
function findRepoRoot(): string {
  const guess = path.resolve(APP_DIR, '..')
  if (fs.existsSync(path.join(guess, 'data'))) return guess
  return '/Users/tiagopedras/Code/to-dos'
}

const ROOT = findRepoRoot()
// Always the live companion/ next to the live data/ — never this app's own
// bundled copy — so digest.py (which finds its own root the same relative
// way) reads the real todo.md whether this is running from source or from a
// packaged, frozen .app.
const COMPANION_DIR = path.join(ROOT, 'companion')

const DATASET = 'twinkl'
const TICK_MS = 60_000
// The morning notification fires at the first tick at or after this, on a
// working day, and not after this — same window as app.py's NOTIFY_AT /
// NOTIFY_UNTIL.
const NOTIFY_AT = { hour: 8, minute: 30 }
const NOTIFY_UNTIL = { hour: 20, minute: 0 }

const LOG_PATH = path.join(os.homedir(), 'Library', 'Logs', 'To-Do Companion.log')

function log(message: string): void {
  const line = `${new Date().toTimeString().slice(0, 8)}  ${message}`
  console.log(line)
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    fs.appendFileSync(LOG_PATH, line + '\n')
  } catch {
    // a companion that cannot log is still a companion
  }
}

let tray: Tray | null = null
let window_: BrowserWindow | null = null
let state: CompanionState = {}
let snapshot: Snapshot | null = null
let quitting = false

function minutesOf(t: { hour: number; minute: number }): number {
  return t.hour * 60 + t.minute
}

function nowMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function taskKeyLabel(message: { where: string; task: string }): string {
  return message.where || message.task
}

/** Same wording as app.py's status_line(): what today's quiet, or when the
    next notification is due. */
function statusLine(d: Digest, now: Date): string {
  const today = now.toISOString().slice(0, 10)
  if (state.notified === today) {
    return 'Notified today' + (state.notified_at ? ' at ' + state.notified_at : '')
  }
  if (d.today_status.holidays.length) {
    const [, firstName] = d.today_status.holidays[0]
    const regions = d.today_status.holidays.map(([r]) => r).join(' & ')
    return `Quiet — ${firstName} (${regions})`
  }
  const day = now.getDay()
  if (day === 0 || day === 6) return 'Quiet at the weekend'
  if (nowMinutes(now) > minutesOf(NOTIFY_UNTIL)) return 'Too late in the day to notify'
  const label = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit' })
  return `Notifying at ${label.format(new Date(0, 0, 0, NOTIFY_AT.hour, NOTIFY_AT.minute))}`
}

function dayHeading(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
}

function postNotification(title: string, body: string, task?: string, view?: string): void {
  if (!Notification.isSupported()) {
    log('notifications unsupported on this machine')
    return
  }
  const note = new Notification({ title, body })
  note.on('click', () => {
    log(`banner clicked → ${task || view || 'the board'}`)
    openBoard(ROOT, task, view)
  })
  note.show()
  log('notification delivered')
}

/** The morning briefing's title, body and where it points — shared by send()
    below and the --notify-once one-shot path, which posts the same banner
    without ever touching companion.json. */
function morningBriefing(d: Digest): { title: string; body: string; task?: string } {
  let body = d.line
  let task: string | undefined
  if (d.headline) {
    body += `.\nThe one thing: ${d.headline.title}`
    task = d.headline.task
  }
  return { title: `To-do — ${dayHeading(new Date())}`, body, task }
}

function send(d: Digest): void {
  const { title, body, task } = morningBriefing(d)
  postNotification(title, body, task)
  const now = new Date()
  state.notified = now.toISOString().slice(0, 10)
  state.notified_at = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit' }).format(now)
  writeState(ROOT, DATASET, state)
}

function maybeNotify(d: Digest): void {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  if (state.notified === today) return
  if (!d.today_status.working) return
  const mins = nowMinutes(now)
  if (mins < minutesOf(NOTIFY_AT) || mins > minutesOf(NOTIFY_UNTIL)) return
  send(d)
}

function drawTray(d: Digest): void {
  if (!tray) return
  const alert = Boolean(d.error || d.overdue.length)
  const iconName = alert ? 'trayAlertTemplate.png' : 'trayTemplate.png'
  const image = nativeImage.createFromPath(path.join(COMPANION_DIR, 'resources', iconName))
  image.setTemplateImage(true)
  tray.setImage(image)
  tray.setTitle(d.count ? ` ${d.count}` : '')
  tray.setToolTip(d.line)
}

async function refresh(): Promise<void> {
  const [digest, plans] = await Promise.all([
    runDigest(COMPANION_DIR),
    Promise.resolve(planListing(ROOT, DATASET))
  ])
  const now = new Date()
  const withinWindow = nowMinutes(now) >= minutesOf(NOTIFY_AT) && nowMinutes(now) <= minutesOf(NOTIFY_UNTIL)
  drainQueue(ROOT, DATASET, withinWindow, postNotification)

  snapshot = {
    digest,
    plans,
    night: readNightRun(ROOT, DATASET),
    statusLine: statusLine(digest, now),
    bucketColors: readBucketColors(ROOT, DATASET)
  }
  drawTray(digest)
  window_?.webContents.send('companion:snapshot', snapshot)
  maybeNotify(digest)
}

function toggleWindow(): void {
  if (!window_) return
  if (window_.isVisible()) window_.hide()
  else {
    window_.show()
    window_.focus()
  }
}

function createTray(): void {
  const image = nativeImage.createFromPath(path.join(COMPANION_DIR, 'resources', 'trayTemplate.png'))
  image.setTemplateImage(true)
  tray = new Tray(image)
  tray.setToolTip('To-do')
  tray.on('click', toggleWindow)
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open the board', click: () => openBoard(ROOT) },
      { label: 'Check again', click: () => void refresh() },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
    tray?.popUpContextMenu(menu)
  })
}

function createWindow(): void {
  window_ = new BrowserWindow({
    width: 380,
    height: 640,
    show: false,
    resizable: true,
    fullscreenable: false,
    title: 'To-Do Companion',
    webPreferences: {
      preload: path.join(dirname_, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  window_.on('close', (event) => {
    if (quitting) return
    // Closing the window leaves the tray icon up — the window is the
    // surface, the icon is the process.
    event.preventDefault()
    window_?.hide()
  })

  window_.on('ready-to-show', () => {
    if (snapshot) window_?.webContents.send('companion:snapshot', snapshot)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window_.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window_.loadFile(path.join(dirname_, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('companion:getSnapshot', () => snapshot)
  ipcMain.on('companion:openBoard', (_event, task?: string, view?: string) => {
    openBoard(ROOT, task, view)
  })
  ipcMain.on('companion:copyMessage', (_event, key: string) => {
    const message = snapshot?.digest.messages.find((m) => m.key === key)
    if (!message) return
    clipboard.writeText(message.text)
    log(`copied the message for ${taskKeyLabel(message)}`)
  })
  ipcMain.on('companion:dismissMessage', (_event, key: string) => {
    const seen = state.dismissed ?? []
    if (!seen.includes(key)) {
      // Trimmed the same way app.py did: far more than are ever live at
      // once, so the oldest dropping off only means a sent message
      // reappears once.
      state.dismissed = [...seen, key].slice(-200)
      writeState(ROOT, DATASET, state)
    }
    void refresh()
  })
  ipcMain.on('companion:checkNow', () => void refresh())
}

/** `--notify-once` / `--notify-test [--task X] [--view Y]` — fire one banner
    and quit, without touching companion.json or claiming the single-instance
    lock, so it never contends with an already-running tray. Same shape as
    app.py's notify_once()/notify_test(). */
async function runOneShot(argv: string[]): Promise<void> {
  app.dock?.hide()
  await app.whenReady()
  const digest = await runDigest(COMPANION_DIR)

  if (argv.includes('--notify-test')) {
    const opt = (name: string): string | undefined => {
      const i = argv.indexOf(name)
      return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined
    }
    let task = opt('--task')
    const view = opt('--view')
    let where = 'the board'
    if (!task && !view) {
      const pick = digest.headline ?? digest.overdue[0] ?? digest.today[0]
      if (pick) {
        task = pick.task
        where = pick.title
      }
    } else if (task) {
      where = task
    } else if (view) {
      where = `the ${view} view`
    }
    postNotification('To-do — test', `Press this. It should open ${where}.`, task, view)
    log(`test banner sent → ${task || view || 'the board'}`)
  } else {
    // Fire the briefing and quit, without touching companion.json — the
    // whole reason this flag exists is checking what today's banner would
    // say without waiting for a morning, so it must not count as having
    // already sent one.
    const { title, body, task } = morningBriefing(digest)
    postNotification(title, body, task)
  }
  setTimeout(() => app.quit(), 30_000)
}

async function main(): Promise<void> {
  const argv = process.argv.slice(1)
  if (argv.includes('--notify-once') || argv.includes('--notify-test')) {
    await runOneShot(argv)
    return
  }

  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  await app.whenReady()
  app.dock?.hide()
  state = readState(ROOT, DATASET)

  createWindow()
  createTray()
  registerIpc()

  app.on('before-quit', () => {
    quitting = true
  })
  app.on('window-all-closed', () => {
    // Accessory app: quitting is a tray menu action, not a window closing.
  })

  await refresh()
  setInterval(() => void refresh(), TICK_MS)
}

void main()
