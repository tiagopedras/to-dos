/* The shapes crossing every boundary in this app: digest.py's --json output,
   what plans.ts reads off disk, and the snapshot the renderer actually draws.
   One file, imported by main and renderer both, so the two never drift on
   what a field is called. */

export interface TaskRef {
  title: string
  bucket: string
  task: string
  due: string
}

export interface HeadlineRef {
  title: string
  task: string
}

export interface MessageRef {
  key: string
  task: string
  where: string
  text: string
  draft: boolean
  due: string
  bucket: string
}

export interface TodayStatus {
  working: boolean
  holidays: [string, string][]
}

/** digest.py's to_json() — see companion/digest.py. */
export interface Digest {
  day: string
  line: string
  count: number
  error: string | null
  parked: number
  headline: HeadlineRef | null
  overdue: TaskRef[]
  today: TaskRef[]
  messages: MessageRef[]
  /** Bucket names in the order todo.md declares them — what the board
      colours a card's left stripe by when nothing is chosen for it. */
  buckets: string[]
  today_status: TodayStatus
}

export type PlanStatus = 'unread' | 'read' | 'agreed' | 'redo' | 'actioned'

/** One file under data/<dataset>/plans/<night>/ — the fields the window
    actually shows, a subset of plan_meta() in kanban/server.py. */
export interface PlanRef {
  name: string
  night: string
  title: string
  task: string
  bucket: string
  status: PlanStatus
  summary: string
  generated: string
  modified: string
}

export interface Snapshot {
  digest: Digest
  plans: PlanRef[]
  statusLine: string
  /** bucket name -> swatch, straight off the board's own bucket-colors.json.
      Usually empty, which means every bucket takes its position's colour. */
  bucketColors: Record<string, string>
}

export interface CompanionApi {
  getSnapshot: () => Promise<Snapshot | null>
  onSnapshot: (cb: (snapshot: Snapshot) => void) => () => void
  openBoard: (task?: string, view?: string) => void
  copyMessage: (key: string) => void
  dismissMessage: (key: string) => void
  checkNow: () => void
}
