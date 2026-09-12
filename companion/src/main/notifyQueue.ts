/* Drains data/<dataset>/notify-queue.json — the channel companion/notify.py
   and anything else (the planning agent, a pa skill) appends to when they want a
   banner. Port of drain_notifications in the old app.py
   (companion/app.py:496-565). The time-of-day gate is the only rule here;
   the calendar (weekends, holidays) deliberately does not apply to this
   queue — see notify.py's own docstring on why. */

import fs from 'node:fs'
import path from 'node:path'

interface QueuedNotification {
  title?: string
  body?: string
  task?: string
  view?: string
}

export function queuePath(root: string, dataset: string): string {
  return path.join(root, 'data', dataset, 'notify-queue.json')
}

export function drainQueue(
  root: string,
  dataset: string,
  withinWindow: boolean,
  post: (title: string, body: string, task?: string, view?: string) => void
): void {
  const target = queuePath(root, dataset)
  let queued: unknown
  try {
    queued = JSON.parse(fs.readFileSync(target, 'utf8'))
  } catch {
    return
  }
  if (!Array.isArray(queued) || queued.length === 0) return
  if (!withinWindow) return // left on the queue, said in the morning

  const items = queued as QueuedNotification[]
  for (const entry of items.slice(0, 3)) {
    if (!entry || typeof entry !== 'object') continue
    const title = String(entry.title || 'To-do').slice(0, 120)
    const body = String(entry.body || '').slice(0, 400)
    if (body) {
      post(title, body, entry.task ? String(entry.task).slice(0, 200) : undefined,
        entry.view ? String(entry.view).slice(0, 40) : undefined)
    }
  }
  const rest = items.slice(3)
  try {
    fs.writeFileSync(target, JSON.stringify(rest, null, 2))
  } catch {
    // best effort, same as the Python drain
  }
}
