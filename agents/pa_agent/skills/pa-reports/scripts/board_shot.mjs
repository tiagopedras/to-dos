#!/usr/bin/env node
/* Screenshot one part of the board at a given width, without it being able to
 * save anything.
 *
 *   node board_shot.mjs --view reports --from .trendhead --to .trendkey \
 *     --width 390 --out /path/to/shot.png
 *
 * --view    a board view name (board, plans, reports, overview, matrix, ...)
 * --from    selector for the top edge of the crop
 * --to      selector for the bottom edge (defaults to --from)
 * --width   CSS pixels, default 390 (an iPhone). Always phone-emulated below 800.
 * --out     where the PNG goes
 *
 * Two guards, in this order. Every non-GET fetch is swallowed before any board
 * script runs, so an autosave or an archive pass has nowhere to go. Then the tab
 * is locked, the same lock demo mode uses. The real list is read, never written.
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) =>
  a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc, []))
const view = args.view || 'board'
const from = args.from
const to = args.to || from
const width = Number(args.width || 390)
const out = args.out
const BOARD = process.env.BOARD_PORT || 8765
const PORT = 9480 + Math.floor(Math.random() * 15)
if (!from || !out) { console.error('need --from and --out'); process.exit(2) }

try { await fetch(`http://127.0.0.1:${BOARD}/kanban/index.html`) } catch {
  console.error(`The board server is not running on port ${BOARD}. Open To-Do Board.app first.`)
  process.exit(3)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'pa-reports-'))}`,
  `--window-size=${width},900`, 'about:blank'
], { stdio: 'ignore' })
const fail = msg => { console.error(msg); chrome.kill(); process.exit(1) }

let ws
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page')
    if (t) ws = new WebSocket(t.webSocketDebuggerUrl)
  } catch {}
  if (!ws) await new Promise(r => setTimeout(r, 250))
}
if (!ws) fail('headless Chrome did not start')
await new Promise(r => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })) })
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) fail(r.result.exceptionDetails.exception?.description || 'page error')
  return r.result?.result?.value
}

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 3, mobile: width < 800 })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const real = window.fetch
  window.fetch = (u, o = {}) => (o.method && o.method.toUpperCase() !== 'GET')
    ? Promise.resolve(new Response('{}', { status: 200 })) : real(u, o)
})()` })
await send('Page.navigate', { url: `http://127.0.0.1:${BOARD}/kanban/index.html` })
await new Promise(r => setTimeout(r, 3000))
await ev(`state.locked = true; state.lockedLabel = 'screenshot'; state.view = ${JSON.stringify(view)}; renderView(); 1`)
await new Promise(r => setTimeout(r, 1500))

const rect = await ev(`(() => {
  const a = document.querySelector(${JSON.stringify(from)}), b = document.querySelector(${JSON.stringify(to)})
  if (!a || !b) return null
  const top = a.getBoundingClientRect().top + scrollY, bottom = b.getBoundingClientRect().bottom + scrollY
  return { top: top - 12, height: bottom - top + 24, overflow: document.documentElement.scrollWidth > innerWidth }
})()`)
if (!rect) fail(`nothing on the ${view} view matches ${from} / ${to}`)

const shot = await send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: rect.top, width, height: rect.height, scale: 1 }
})
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log(JSON.stringify({ out, width, overflow: rect.overflow }))
chrome.kill()
process.exit(0)
