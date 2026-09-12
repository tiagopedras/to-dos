/* What the night agent's last run did, read off the run.json it leaves beside
   the plans — write_run_record() (agents/night_agent/plan.py:734).

   The plans on their own cannot say this. A night that planned nothing and a
   night that never woke up both leave a folder with no open plan in it, so
   plans.ts draws the same empty section for either. The record is the only
   thing that tells them apart.

   It reads the newest night's folder and only that one, which is where this
   parts company with the agents dashboard's _last_run()
   (agents/night_agent/dashboard.py:69). That one walks back to the newest
   folder that has a record, because a dashboard reporting nothing would read
   as an agent that has never worked. Here the missing record is the news: the
   run wrote plans and then died before it could write its own account of
   them, and saying so is the whole point of the line. */

import fs from 'node:fs'
import path from 'node:path'
import type { NightRun } from '../shared/types.js'

interface RawEntry {
  outcome?: string
  title?: string
  summary?: string
  file?: string
}

interface RawRecord {
  started?: string
  finished?: string
  cost?: number
  stopped?: string | null
  entries?: RawEntry[]
}

export function readNightRun(root: string, dataset: string): NightRun | null {
  const dir = path.join(root, 'data', dataset, 'plans')
  let nights: string[]
  try {
    nights = fs
      .readdirSync(dir)
      .filter((n) => !n.startsWith('.') && fs.statSync(path.join(dir, n)).isDirectory())
      .sort()
  } catch {
    return null
  }
  const night = nights[nights.length - 1]
  // No folder at all is not a night that went wrong — it is an agent that has
  // never run here, or one whose every night has since been pruned. Nothing
  // to say either way.
  if (!night) return null

  let record: RawRecord
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, night, 'run.json'), 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not a record')
    record = parsed as RawRecord
  } catch {
    return {
      night,
      recorded: false,
      started: '',
      finished: '',
      cost: 0,
      stopped: null,
      planned: 0,
      folded: 0,
      skipped: 0
    }
  }

  const entries = Array.isArray(record.entries) ? record.entries : []
  const count = (outcome: string): number => entries.filter((e) => e.outcome === outcome).length
  return {
    night,
    recorded: true,
    started: record.started || '',
    finished: record.finished || '',
    cost: typeof record.cost === 'number' ? record.cost : 0,
    // A sentence saying why it broke off early, or nothing when it ran to the
    // end — see plan.py, which writes the wording.
    stopped: record.stopped || null,
    planned: count('planned'),
    folded: count('folded'),
    skipped: count('skipped')
  }
}
