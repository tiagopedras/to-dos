/* Shells out to `python3 digest.py --json` once a tick rather than porting
   its policy into JavaScript. That policy — effective due dates, blocked-by,
   message extraction, and the UK/PT holiday calendar — lives in
   core/todo.py and companion/digest.py, and core/todo.js says outright the
   holiday calendar is deliberately not duplicated into JS ("the same
   holiday list is two lists to keep in step"). Reusing the tested Python as
   a short-lived call avoids adding the second copy that comment is there to
   prevent. See digest.to_json() in companion/digest.py for the shape. */

import { execFile } from 'node:child_process'
import path from 'node:path'
import type { Digest } from '../shared/types.js'

const CANDIDATES = [
  '/Library/Frameworks/Python.framework/Versions/Current/bin/python3',
  '/opt/homebrew/bin/python3',
  '/usr/local/bin/python3',
  '/usr/bin/python3',
  'python3'
]

function errorDigest(message: string): Digest {
  return {
    day: new Date().toISOString().slice(0, 10),
    line: 'The list could not be read',
    count: 0,
    error: message,
    parked: 0,
    headline: null,
    overdue: [],
    today: [],
    messages: [],
    buckets: [],
    today_status: { working: true, holidays: [] }
  }
}

function tryOne(python: string, script: string): Promise<Digest | null> {
  return new Promise((resolve) => {
    execFile(python, [script, '--json'], { timeout: 15_000 }, (err, stdout) => {
      if (err && !stdout) {
        resolve(null)
        return
      }
      try {
        const line = stdout.trim().split('\n').pop() as string
        resolve(JSON.parse(line) as Digest)
      } catch {
        resolve(null)
      }
    })
  })
}

/** `companionDir` is companion/ — where digest.py lives, whatever this app's
    own build output sits under. */
export async function runDigest(companionDir: string): Promise<Digest> {
  const script = path.join(companionDir, 'digest.py')
  for (const python of CANDIDATES) {
    const result = await tryOne(python, script)
    if (result) return result
  }
  return errorDigest('no Python on this machine could run digest.py')
}
