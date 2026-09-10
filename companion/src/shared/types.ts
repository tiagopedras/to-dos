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
}

export interface CompanionApi {
  getSnapshot: () => Promise<Snapshot | null>
  onSnapshot: (cb: (snapshot: Snapshot) => void) => () => void
  openBoard: (task?: string, view?: string) => void
  copyMessage: (key: string) => void
  dismissMessage: (key: string) => void
  checkNow: () => void
  notifyNow: () => void
}
