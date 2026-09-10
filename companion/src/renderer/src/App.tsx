import { useEffect, useState } from 'react'
import type { MessageRef, PlanRef, Snapshot, TaskRef } from '../../shared/types.js'

function dayHeading(): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function PlanRow({ plan }: { plan: PlanRef }): React.JSX.Element {
  return (
    <button className="row" onClick={() => window.companion.openBoard(undefined, 'plans')}>
      <div className="row-title">{plan.title}</div>
      {plan.summary && <div className="row-sub">{plan.summary}</div>}
      <div className="row-meta">
        <span className="chip">{plan.bucket}</span>
        {plan.status === 'unread' && <span className="chip chip-new">new</span>}
      </div>
    </button>
  )
}

function TaskRow({ task, when }: { task: TaskRef; when?: string }): React.JSX.Element {
  return (
    <button className="row" onClick={() => window.companion.openBoard(task.task)}>
      <div className="row-title">{task.title}</div>
      <div className="row-meta">
        <span className="chip">{task.bucket}</span>
        {when && <span className="row-when">{when}</span>}
      </div>
    </button>
  )
}

function MessageRow({ message }: { message: MessageRef }): React.JSX.Element {
  const label = message.where || message.task
  return (
    <div className="row message-row">
      <button className="row-main" onClick={() => window.companion.copyMessage(message.key)}>
        <div className="row-title">
          {label}
          {message.draft && <span className="chip chip-draft">draft</span>}
        </div>
        <div className="row-sub">{message.text}</div>
      </button>
      <button
        className="dismiss"
        title="Hide until reworded"
        onClick={(e) => {
          e.stopPropagation()
          window.companion.dismissMessage(message.key)
        }}
      >
        ×
      </button>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  useEffect(() => {
    void window.companion.getSnapshot().then(setSnapshot)
    return window.companion.onSnapshot(setSnapshot)
  }, [])

  if (!snapshot) {
    return <div className="app loading">Reading the list…</div>
  }

  const { digest, plans } = snapshot
  const openPlans = plans.filter((p) => p.status === 'unread' || p.status === 'read')

  return (
    <div className="app">
      <header>
        <div className="heading">{dayHeading()}</div>
        <div className="status">{snapshot.statusLine}</div>
        {digest.error ? (
          <div className="error">{digest.error}</div>
        ) : (
          <div className="line">{digest.line}</div>
        )}
      </header>

      <main>
        {digest.headline && (
          <Section title="The one thing">
            <TaskRow task={{ ...digest.headline, bucket: '', due: '' }} />
          </Section>
        )}

        {openPlans.length > 0 && (
          <Section title="The night's plans">
            {openPlans.map((p) => (
              <PlanRow key={`${p.night}/${p.name}`} plan={p} />
            ))}
          </Section>
        )}

        {digest.overdue.length > 0 && (
          <Section title="Overdue">
            {digest.overdue.map((t) => (
              <TaskRow key={t.task} task={t} when={t.due} />
            ))}
          </Section>
        )}

        {digest.today.length > 0 && (
          <Section title="Due today">
            {digest.today.map((t) => (
              <TaskRow key={t.task} task={t} />
            ))}
          </Section>
        )}

        {digest.messages.length > 0 && (
          <Section title="Messages to send">
            {digest.messages.map((m) => (
              <MessageRow key={m.key} message={m} />
            ))}
          </Section>
        )}

        {digest.parked > 0 && (
          <div className="parked">{digest.parked} more with somebody else or blocked</div>
        )}

        {!digest.headline &&
          openPlans.length === 0 &&
          digest.overdue.length === 0 &&
          digest.today.length === 0 &&
          digest.messages.length === 0 && <div className="quiet">Nothing owed today</div>}
      </main>

      <footer>
        <button onClick={() => window.companion.openBoard()}>Open the board</button>
        <button onClick={() => window.companion.checkNow()}>Check again</button>
        <button onClick={() => window.companion.notifyNow()}>Send this morning&rsquo;s notification</button>
      </footer>
    </div>
  )
}
