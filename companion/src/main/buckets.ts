/* Whatever the board has been told to colour each bucket, so a card here gets
   the same stripe it has over there. `bucket-colors.json` is written by the
   board's own colour picker (loadBucketColors in kanban/js/08-buckets.js) and
   is usually absent, in which case every bucket falls through to its position
   in the list — which is what bucketColor() in kanban/js/02-state.js does
   too, and what the renderer repeats. */

import fs from 'node:fs'
import path from 'node:path'

export function readBucketColors(root: string, dataset: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(path.join(root, 'data', dataset, 'bucket-colors.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch {
    // No file, or an unreadable one: positions it is.
  }
  return {}
}
