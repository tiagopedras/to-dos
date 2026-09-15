import { useEffect, useMemo, useState } from 'react'
import type { MeetingRef, MessageRef, NightRun, PlanRef, Snapshot, TaskRef } from '../../shared/types.js'

type SectionKey = 'plans' | 'overdue' | 'today' | 'messages'

/* What the sliding screen is showing: one of the section lists, or one
   meeting's agenda. A meeting is held by its task key rather than as the
   object, so a refresh that lands while it is open redraws the new agenda. */
type Screen = { kind: 'section'; key: SectionKey } | { kind: 'meeting'; task: string }

/* The board's own bucket colours — bucketColor() in kanban/js/02-state.js.
   A name with nothing chosen for it in bucket-colors.json falls through to
   its position in the list, exactly as it does over there. */
const BUCKET_COLOR = [
  'var(--b1)', 'var(--b2)', 'var(--b3)', 'var(--b4)', 'var(--b5)',
  'var(--b6)', 'var(--b7)', 'var(--b8)', 'var(--b9)', 'var(--b10)'
]

function makeBucketColor(snapshot: Snapshot): (name: string) => string {
  const { digest, bucketColors } = snapshot
  return (name: string): string => {
    const chosen = bucketColors[name]
    if (chosen) return chosen
    const index = digest.buckets.indexOf(name)
    if (index < 0) return 'var(--line)'
    return BUCKET_COLOR[index % BUCKET_COLOR.length]
  }
}

function dayHeading(): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
}

function dueLabel(iso: string): string {
  const date = new Date(iso + 'T00:00:00')
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date)
}

/* A night folder is named for its own day, but nothing enforces that, so a
   name that is not a date is shown as it is rather than as "Invalid Date". */
function nightLabel(night: string): string {
  const date = new Date(night + 'T00:00:00')
  return Number.isNaN(date.getTime()) ? night : dueLabel(night)
}

/* What the planning agent did, in one line. This sits on the home screen rather
   than inside the plans section because the section card for an empty section
   cannot be opened — and a night that ran and planned nothing, a night that
   never woke up, and a night that died halfway are all an empty section. */
function nightSummary(run: NightRun): string {
  const when = nightLabel(run.night)
  if (!run.recorded) return `${when} — the night left no record, so it did not finish`
  const did: string[] = []
  if (run.planned) did.push(`${run.planned} planned`)
  if (run.folded) did.push(`${run.folded} needing a decision`)
  if (run.skipped) did.push(`${run.skipped} skipped`)
  return [
    `${when} — ${did.length ? did.join(', ') : 'nothing to plan'}`,
    run.cost ? `$${run.cost.toFixed(2)}` : '',
    run.stopped ? 'cut short' : ''
  ]
    .filter(Boolean)
    .join(' · ')
}

/* A card, the board's shape: bucket name along the top, title under it,
   chips along the bottom. See board-cards.css, which is that stylesheet's own
   card block. */
function Card({
  bucket,
  color,
  title,
  sub,
  tags,
  onClick,
  className,
  action
}: {
  bucket?: string
  color?: string
  title: string
  sub?: string
  tags?: React.ReactNode
  onClick?: () => void
  className?: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={`card${className ? ' ' + className : ''}`}
      style={color ? ({ ['--bc' as string]: color } as React.CSSProperties) : undefined}
    >
      <button className="card-hit" onClick={onClick}>
        {(bucket || action) && (
          <div className="row1">
            {bucket && <span className="bucket">{bucket}</span>}
            {action && <span className="right">{action}</span>}
          </div>
        )}
        <div className="title">{title}</div>
        {sub && <div className="notecount cardsub">{sub}</div>}
        {tags && <div className="meta">{tags}</div>}
      </button>
    </div>
  )
}

/* Marked the way the board marks a plan: a red top border, the night in the
   accent while it is unread, and faded once it has been read. */
function PlanCard({ plan, color }: { plan: PlanRef; color: string }): React.JSX.Element {
  const unread = plan.status === 'unread'
  return (
    <Card
      className={`planitem${unread ? '' : ' read'}`}
      bucket={plan.bucket}
      color={color}
      title={plan.title}
      sub={plan.summary}
      onClick={() => window.companion.openBoard(undefined, 'plans')}
      tags={<span className={`tag night${unread ? ' new' : ''}`}>{plan.night}</span>}
    />
  )
}

function TaskCard({
  task,
  color,
  overdue
}: {
  task: TaskRef
  color: string
  overdue?: boolean
}): React.JSX.Element {
  return (
    <Card
      bucket={task.bucket}
      color={color}
      title={task.title}
      onClick={() => window.companion.openBoard(task.task)}
      tags={
        task.due ? (
          <span className={`tag due${overdue ? ' over' : ' soon'}`}>{dueLabel(task.due)}</span>
        ) : undefined
      }
    />
  )
}

function MessageCard({ message, color }: { message: MessageRef; color: string }): React.JSX.Element {
  return (
    <div className="card message-card" style={{ ['--bc' as string]: color } as React.CSSProperties}>
      <button className="card-hit" onClick={() => window.companion.copyMessage(message.key)}>
        <div className="row1">
          <span className="bucket msgwho">{message.where || message.task}</span>
        </div>
        <div className="title msgtext">{message.text}</div>
        <div className="meta">
          {message.draft && <span className="tag urgent">draft</span>}
          {message.due && <span className="tag due">{dueLabel(message.due)}</span>}
          <span className="copyhint">Click to copy</span>
        </div>
      </button>
      <button
        className="dismiss"
        title="Hide until reworded"
        onClick={() => window.companion.dismissMessage(message.key)}
      >
        ×
      </button>
    </div>
  )
}

/* The card on a recurring meeting is its prep, so the title usually starts
   "Prepare for". The meeting is what follows. */
function meetingName(title: string): string {
  return title.replace(/^prepare for\s+/i, '').replace(/^./, (c) => c.toUpperCase())
}

function agendaCount(meeting: MeetingRef): string {
  const n = meeting.agenda.length
  if (!n) return 'No agenda yet'
  return n === 1 ? '1 topic' : `${n} topics`
}

function MeetingCard({ meeting, onOpen }: { meeting: MeetingRef; onOpen: (task: string) => void }): React.JSX.Element {
  return (
    <Card
      className="meeting-card"
      title={meetingName(meeting.title)}
      onClick={() => onOpen(meeting.task)}
      tags={
        <>
          <span className="tag meeting-time">{meeting.time}</span>
          <span className={`meeting-count${meeting.agenda.length ? '' : ' none'}`}>{agendaCount(meeting)}</span>
        </>
      }
    />
  )
}

function MeetingAgenda({ meeting }: { meeting: MeetingRef | undefined }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  if (!meeting) return <div className="quiet">This meeting is no longer on today.</div>
  return (
    <div className="agenda">
      <div className="agenda-when">
        Today at {meeting.time}
        {meeting.prepared && <span className="tag agenda-ready">Prepared</span>}
      </div>
      {meeting.agenda.length ? (
        <ul className="agenda-topics">
          {meeting.agenda.map((t, i) => (
            <li key={i}>
              <div className="agenda-topic">{t.topic}</div>
              {t.context && <div className="agenda-context">{t.context}</div>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="quiet">No agenda yet.</div>
      )}
      <div className="agenda-actions">
        {meeting.agenda.length > 0 && (
          <button
            className="iconbtn"
            onClick={() => {
              window.companion.copyAgenda(meeting.task)
              setCopied(true)
            }}
          >
            <span className="iconbtn-glyph">{copied ? '✓' : '⎘'}</span>
            <span>{copied ? 'Copied' : 'Copy agenda'}</span>
          </button>
        )}
        <button className="iconbtn" onClick={() => window.companion.openBoard(meeting.task)}>
          <span className="iconbtn-glyph">⧉</span>
          <span>Open on the board</span>
        </button>
      </div>
    </div>
  )
}

interface SectionDef {
  key: SectionKey
  title: string
  icon: string
  count: number
}

function SectionCard({ section, onOpen }: { section: SectionDef; onOpen: (key: SectionKey) => void }): React.JSX.Element {
  return (
    <button
      className={`sectioncard${section.count === 0 ? ' empty' : ''}`}
      disabled={section.count === 0}
      onClick={() => onOpen(section.key)}
    >
      <span className="sectioncard-icon">{section.icon}</span>
      <span className="sectioncard-count">{section.count}</span>
      <span className="sectioncard-title">{section.title}</span>
    </button>
  )
}

const SECTION_TITLES: Record<SectionKey, string> = {
  plans: "The night's plans",
  overdue: 'Overdue',
  today: 'Due today',
  messages: 'Messages to send'
}

function DetailList({
  sectionKey,
  snapshot,
  colorOf
}: {
  sectionKey: SectionKey
  snapshot: Snapshot
  colorOf: (name: string) => string
}): React.JSX.Element {
  const { digest, plans } = snapshot
  if (sectionKey === 'plans') {
    const openPlans = plans.filter((p) => p.status === 'unread' || p.status === 'read')
    return (
      <>
        {openPlans.map((p) => (
          <PlanCard key={`${p.night}/${p.name}`} plan={p} color={colorOf(p.bucket)} />
        ))}
      </>
    )
  }
  if (sectionKey === 'overdue') {
    return (
      <>
        {digest.overdue.map((t) => (
          <TaskCard key={t.task} task={t} color={colorOf(t.bucket)} overdue />
        ))}
      </>
    )
  }
  if (sectionKey === 'today') {
    return (
      <>
        {digest.today.map((t) => (
          <TaskCard key={t.task} task={t} color={colorOf(t.bucket)} />
        ))}
      </>
    )
  }
  return (
    <>
      {digest.messages.map((m) => (
        <MessageCard key={m.key} message={m} color={colorOf(m.bucket)} />
      ))}
    </>
  )
}

export default function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  // `mounted` stays set through the close animation so the detail screen keeps
  // drawing while it slides away; `closing` is what swaps which animation it
  // runs. See app.css for why this is an animation rather than a transition.
  const [mounted, setMounted] = useState<Screen | null>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    void window.companion.getSnapshot().then(setSnapshot)
    return window.companion.onSnapshot(setSnapshot)
  }, [])

  const sections = useMemo<SectionDef[]>(() => {
    if (!snapshot) return []
    const { digest, plans } = snapshot
    const openPlans = plans.filter((p) => p.status === 'unread' || p.status === 'read')
    return [
      { key: 'plans', title: "The night's plans", icon: '🌙', count: openPlans.length },
      { key: 'overdue', title: 'Overdue', icon: '⚠️', count: digest.overdue.length },
      { key: 'today', title: 'Due today', icon: '📅', count: digest.today.length },
      { key: 'messages', title: 'Messages to send', icon: '✉️', count: digest.messages.length }
    ]
  }, [snapshot])

  function pushScreen(screen: Screen): void {
    setClosing(false)
    setMounted(screen)
  }

  function pushSection(key: SectionKey): void {
    pushScreen({ kind: 'section', key })
  }

  function pushMeeting(task: string): void {
    pushScreen({ kind: 'meeting', task })
  }

  function popSection(): void {
    setClosing(true)
    setTimeout(() => {
      setMounted(null)
      setClosing(false)
    }, 260)
  }

  if (!snapshot) {
    return <div className="app loading">Reading the list…</div>
  }

  const { digest } = snapshot
  const colorOf = makeBucketColor(snapshot)

  return (
    <div className="app">
      <div className="screen home-screen">
        <div className="topbar">
          <button className="iconbtn" title="Open the board" onClick={() => window.companion.openBoard()}>
            <span className="iconbtn-glyph">⧉</span>
            <span>Open the board</span>
          </button>
          <button className="iconbtn" title="Check again now" onClick={() => window.companion.checkNow()}>
            <span className="iconbtn-glyph">↻</span>
            <span>Check again</span>
          </button>
        </div>

        <header>
          <div className="heading">{dayHeading()}</div>
          <div className="status">{snapshot.statusLine}</div>
          {digest.error ? <div className="error">{digest.error}</div> : <div className="line">{digest.line}</div>}
        </header>

        <main>
          {digest.headline && (
            <Card
              className="onething"
              color={'var(--accent)'}
              bucket="The one thing"
              title={digest.headline.title}
              onClick={() => window.companion.openBoard(digest.headline?.task)}
            />
          )}

          {snapshot.night && (
            // The reason it broke off is the run's own sentence, and too long
            // for the line, so it goes where hovering finds it.
            <div
              className={`nightline${snapshot.night.recorded ? '' : ' unfinished'}`}
              title={snapshot.night.stopped ?? undefined}
            >
              {nightSummary(snapshot.night)}
            </div>
          )}

          {digest.meetings.length > 0 && (
            <section className="meetings">
              <div className="group-title">Meetings today</div>
              {digest.meetings.map((m) => (
                <MeetingCard key={m.task} meeting={m} onOpen={pushMeeting} />
              ))}
            </section>
          )}

          <div className="cards">
            {sections.map((s) => (
              <SectionCard key={s.key} section={s} onOpen={pushSection} />
            ))}
          </div>

          {digest.parked > 0 && (
            <div className="parked">{digest.parked} more with somebody else or blocked</div>
          )}

          {!digest.headline && !digest.meetings.length && sections.every((s) => s.count === 0) && (
            <div className="quiet">Nothing owed today</div>
          )}
        </main>
      </div>

      {mounted && (
        <div className={`screen detail-screen${closing ? ' closing' : ''}`}>
          <header className="detail-header">
            <button className="back" onClick={popSection}>
              <span className="back-chevron">‹</span> Back
            </button>
            <div className="detail-title">
              {mounted.kind === 'section'
                ? SECTION_TITLES[mounted.key]
                : meetingName(digest.meetings.find((m) => m.task === mounted.task)?.title ?? 'Meeting')}
            </div>
          </header>
          <main className="detail-body">
            {mounted.kind === 'section' ? (
              <DetailList sectionKey={mounted.key} snapshot={snapshot} colorOf={colorOf} />
            ) : (
              <MeetingAgenda meeting={digest.meetings.find((m) => m.task === mounted.task)} />
            )}
          </main>
        </div>
      )}
    </div>
  )
}
