/* The board, optionally with a view and a card named in the fragment — a
   byte-for-byte port of board_url()/open_board() from the old app.py
   (companion/app.py:203-271). Nothing here reads or writes todo.md; it only
   ever asks macOS to open a URL. */

import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'

export const BOARD_URL = 'http://127.0.0.1:8765/kanban/index.html'

/** Python's urllib.parse.quote(text, safe="") escapes five characters
    encodeURIComponent leaves alone — !'()* — and one of those, `!`, is
    exactly the separator this fragment splits on. Left unescaped, a `!` in a
    task's title would look like the boundary between the view and `task=`
    instead of part of the title. */
function quoteAll(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  )
}

export function boardUrl(task?: string | null, view?: string | null): string {
  if (!task && !view) return BOARD_URL
  let frag = view || ''
  if (task) frag += '!task=' + quoteAll(task)
  return BOARD_URL + '#' + frag
}

function boardUp(timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 8765 })
    let settled = false
    const done = (ok: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

function open(url: string): void {
  spawn('/usr/bin/open', [url], { stdio: 'ignore' }).unref()
}

/** Waits for the server to come up after launching the board app, then sends
    the fragment on — the same follow() thread app.py ran, twenty seconds and
    then give up. */
function followBoard(task?: string | null, view?: string | null): void {
  let tries = 0
  const timer: ReturnType<typeof setInterval> = setInterval(() => {
    tries += 1
    void boardUp(200).then((up) => {
      if (up) {
        clearInterval(timer)
        setTimeout(() => open(boardUrl(task, view)), 1500)
        return
      }
      if (tries >= 40) clearInterval(timer)
    })
  }, 500)
}

/** Open the board, starting the server first if nothing is listening — same
    contract as app.py's open_board(). `root` is the to-dos repo root, where
    "To-Do Board.app" lives. */
export function openBoard(root: string, task?: string | null, view?: string | null): void {
  void boardUp().then((up) => {
    if (up) {
      open(boardUrl(task, view))
      return
    }
    open(path.join(root, 'To-Do Board.app'))
    if (task || view) followBoard(task, view)
  })
}
