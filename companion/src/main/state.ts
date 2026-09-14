/* The companion's own memory: which messages have been dismissed, and when it
   last sent the morning notification. Same file digest.py reads for the
   dismissed set (companion/digest.py:read_dismissed) — this is the only thing
   that writes it. */

import fs from 'node:fs'
import path from 'node:path'

export interface CompanionState {
  dismissed?: string[]
  notified?: string
  notified_at?: string
  /** Which timed meetings have already popped up today, as `date::task` —
      so a tick landing after the fire minute doesn't post the same meeting
      twice, and so a meeting popped yesterday pops again today. */
  meetingsFired?: string[]
}

export function statePath(root: string, dataset: string): string {
  return path.join(root, 'data', dataset, 'companion.json')
}

export function readState(root: string, dataset: string): CompanionState {
  try {
    return JSON.parse(fs.readFileSync(statePath(root, dataset), 'utf8')) as CompanionState
  } catch {
    return {}
  }
}

/** Never raises — a companion that cannot remember is still a companion,
    same reasoning as write_state in the old app.py. */
export function writeState(root: string, dataset: string, state: CompanionState): void {
  try {
    const target = statePath(root, dataset)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, JSON.stringify(state, null, 2))
  } catch {
    // best effort
  }
}
