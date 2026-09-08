import { useEffect, useState } from 'react'
import { parseFishbowlDate } from '../lib/format.js'
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  assigneeLabel,
  daysOverdue,
  overdueSeverity,
  personLabel,
  priorityLabel,
  relatedParts,
} from '../lib/tasks.js'

// Buckets can run to several hundred rows; render a slice and let the user ask
// for more rather than mounting the lot.
const PAGE_SIZE = 50

function EmptyState({ message }) {
  return (
    <div className="flex min-h-[7rem] items-center justify-center rounded-lg border border-dashed border-surface-border bg-surface/60 px-4 py-6 text-center text-sm text-ink-subtle">
      {message}
    </div>
  )
}

function formatDate(value) {
  const date = parseFishbowlDate(value)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function TaskRow({ task, showAssignee }) {
  const [expanded, setExpanded] = useState(false)
  const severity = overdueSeverity(task)
  const days = daysOverdue(task)
  const chipClass =
    severity === 'bad'
      ? 'bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-400'
      : severity === 'warn'
        ? 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400'
        : 'bg-ink/[0.05] text-ink-subtle ring-surface-border'

  let chipText = '—'
  if (task.is_done) chipText = 'Done'
  else if (days != null && days > 0) chipText = `${days}d late`
  else if (days != null && days === 0) chipText = 'Today'
  else if (days != null) chipText = `in ${Math.abs(days)}d`

  const displayDate = task.is_done ? task.completed_date || task.due_date : task.due_date
  const status = STATUS_LABELS[task.status] ?? task.status
  const source = SOURCE_LABELS[task.source]
  const priority = priorityLabel(task.priority)
  const createdBy = personLabel(task.created_by)
  const related = relatedParts(task)
  const meta = [status, priority, showAssignee ? assigneeLabel(task) : null, createdBy ? `Created by ${createdBy}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="rounded-lg">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-ink/[0.03] focus:outline-none focus-visible:bg-sky-500/10"
      >
        <span
          className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${chipClass}`}
        >
          {chipText}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p
              className={`text-sm font-medium text-ink ${expanded ? 'whitespace-pre-wrap' : 'truncate'}`}
              title={task.name || 'Untitled task'}
            >
              {task.name || 'Untitled task'}
            </p>
            <div className="shrink-0 text-right">
              <p className="text-[11px] text-ink-subtle">{task.is_done ? 'Completed' : 'Due'}</p>
              <p className="text-xs font-medium tabular-nums text-ink">{formatDate(displayDate)}</p>
            </div>
          </div>
          {related.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-ink-muted" title={related.join(' · ')}>
              {related.join(' · ')}
            </p>
          )}
          {meta && <p className="mt-0.5 truncate text-[11px] text-ink-subtle">{meta}</p>}
          {!expanded && task.description && (
            <p className="mt-0.5 truncate text-xs text-ink-muted" title={task.description}>
              {task.description}
            </p>
          )}
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {task.description ? (
                <p className="whitespace-pre-wrap text-xs text-ink-muted">{task.description}</p>
              ) : (
                <p className="text-xs text-ink-subtle">No description</p>
              )}
              {source && <p className="text-[11px] text-ink-subtle">{source}</p>}
            </div>
          )}
        </div>
      </button>
    </li>
  )
}

export default function TaskBucketSection({
  title,
  blurb,
  tasks,
  tone = 'default',
  footer = null,
  empty,
  showAssignee = true,
}) {
  const [visible, setVisible] = useState(PAGE_SIZE)

  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [tasks])

  const shown = tasks.slice(0, visible)
  const countClass =
    tone === 'bad'
      ? 'text-red-700 dark:text-red-400'
      : tone === 'warn'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-ink'

  return (
    <section className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {blurb && <p className="mt-0.5 text-xs text-ink-subtle">{blurb}</p>}
        </div>
        <p className={`shrink-0 text-lg font-semibold tabular-nums ${countClass}`}>{tasks.length}</p>
      </div>

      <div className="p-4 sm:p-5">
        {tasks.length === 0 ? (
          <EmptyState message={empty} />
        ) : (
          <>
            <ul className="space-y-0.5">
              {shown.map((task) => (
                <TaskRow key={task.task_id} task={task} showAssignee={showAssignee} />
              ))}
            </ul>
            {visible < tasks.length && (
              <button
                type="button"
                onClick={() => setVisible((current) => current + PAGE_SIZE)}
                className="mt-3 w-full rounded-lg border border-surface-border px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:bg-ink/[0.03] hover:text-ink"
              >
                Show {Math.min(PAGE_SIZE, tasks.length - visible)} more ({tasks.length - visible} remaining)
              </button>
            )}
          </>
        )}
        {footer}
      </div>
    </section>
  )
}
