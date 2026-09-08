import { AGING_BANDS, BUCKET_TABS, UNASSIGNED_KEY } from '../lib/tasks.js'

const OVERDUE_COLUMNS = [{ key: 'overdue', short: 'Overdue', tone: 'bad' }, ...AGING_BANDS]

function countClass(value, tone, active) {
  if (!value) return active ? 'text-ink-muted' : 'text-ink-subtle'
  if (tone === 'bad') return 'text-red-700 dark:text-red-400'
  if (tone === 'warn') return 'text-amber-700 dark:text-amber-400'
  return 'text-ink'
}

function CountCell({ label, value, tone, active }) {
  return (
    <div className={`sm:text-right ${active ? 'rounded-md bg-ink/[0.03] px-2 py-1 sm:bg-transparent sm:px-0 sm:py-0' : ''}`}>
      <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-subtle sm:hidden">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${countClass(value, tone, active)}`}>{value}</p>
    </div>
  )
}

export default function TaskPeopleBoard({ rows, bucket, onSelect }) {
  const overdueView = bucket === 'overdue'
  const showNoDue = !overdueView && (bucket === 'no_due_date' || rows.some((row) => row.no_due_date > 0))
  const columns = overdueView ? OVERDUE_COLUMNS : BUCKET_TABS.filter((tab) => !tab.optional || showNoDue)
  const gridClass =
    columns.length > 3
      ? 'sm:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(4.5rem,0.65fr))]'
      : 'sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(5.5rem,0.7fr))]'
  const barKey = overdueView ? 'overdue_90' : bucket
  const maxActive = Math.max(1, ...rows.map((row) => row[barKey] ?? 0))

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-panel">
      <div className={`hidden grid-cols-1 gap-4 border-b border-surface-border px-4 py-2.5 sm:grid ${gridClass}`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Person</p>
        {columns.map((tab) => (
          <p
            key={tab.key}
            className={`text-right text-[11px] font-semibold uppercase tracking-wide ${
              tab.key === bucket || (overdueView && tab.key === 'overdue_90') ? 'text-ink' : 'text-ink-subtle'
            }`}
          >
            {tab.short}
          </p>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-subtle">No people have tasks in this range.</p>
      ) : (
        <ul>
          {rows.map((row, index) => {
            const unassigned = row.key === UNASSIGNED_KEY
            const share = Math.max(row[barKey] > 0 ? 8 : 0, Math.round(((row[barKey] ?? 0) / maxActive) * 100))

            return (
              <li key={row.key} className="border-b border-surface-border/60 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(row.key)}
                  className={`grid w-full grid-cols-1 gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink/[0.04] focus:outline-none focus-visible:bg-sky-500/10 sm:items-center sm:gap-4 ${gridClass}`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                        unassigned
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
                      }`}
                    >
                      {unassigned ? '—' : index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
                      <p className="mt-0.5 text-xs text-ink-subtle">
                        {overdueView && row.overdue_90 > 0
                          ? `${row.overdue_90} over 90 days`
                          : `${row[bucket] === 1 ? '1 task' : `${row[bucket] ?? 0} tasks`}${
                              overdueView ? ' overdue' : ' in this bucket'
                            }`}
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-sky-700 dark:text-sky-300 sm:hidden">
                        View queue →
                      </p>
                      {row[barKey] > 0 && (
                        <div className="mt-2 hidden h-1 overflow-hidden rounded-full bg-surface sm:block">
                          <div className="h-full rounded-full bg-sky-400/80" style={{ width: `${share}%` }} />
                        </div>
                      )}
                    </div>
                  </div>

                  {columns.map((tab) => (
                    <CountCell
                      key={tab.key}
                      label={tab.short}
                      value={row[tab.key]}
                      tone={tab.tone}
                      active={tab.key === bucket || (overdueView && tab.key === 'overdue_90')}
                    />
                  ))}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
