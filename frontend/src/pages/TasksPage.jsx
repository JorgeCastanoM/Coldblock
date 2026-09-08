import { useCallback, useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import TaskBucketSection from '../components/TaskBucketSection.jsx'
import TaskPeopleBoard from '../components/TaskPeopleBoard.jsx'
import TaskScopePicker from '../components/TaskScopePicker.jsx'
import {
  AGING_BANDS,
  BUCKET_META,
  BUCKET_TABS,
  TASK_SORT_OPTIONS,
  buildPeopleBoard,
  compareTasks,
  countAging,
  matchesScope,
  matchesTaskQuery,
  overdueAgingKey,
  scopeName,
  sortPeopleBoard,
} from '../lib/tasks.js'
import { getTasksReport } from '../services/api.js'

const controlClass =
  'rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-sky-500 focus:outline-none'

function toneValueClass(tone) {
  if (tone === 'bad') return 'text-red-600 dark:text-red-400'
  if (tone === 'warn') return 'text-amber-600 dark:text-amber-400'
  return 'text-ink'
}

function TasksSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((key) => (
          <div key={key} className="h-[4.5rem] rounded-xl border border-surface-border bg-surface-raised" />
        ))}
      </div>
      <div className="h-80 rounded-xl border border-surface-border bg-surface-raised" />
    </div>
  )
}

function emptyCopy(bucket, name, agingFilter = 'all') {
  if (bucket === 'overdue' && agingFilter !== 'all') {
    const band = AGING_BANDS.find((item) => item.key === agingFilter)
    return `Nothing overdue in the ${band?.label ?? 'selected'} band for ${name}.`
  }
  const phrases = {
    overdue: `Nothing overdue for ${name}.`,
    due_next_week: `Nothing due in the next 7 days for ${name}.`,
    done: `Nothing completed recently for ${name}.`,
    no_due_date: `No open tasks without a due date for ${name}.`,
  }
  return phrases[bucket] ?? `No tasks for ${name}.`
}

export default function TasksPage() {
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [window_, setWindow] = useState('actionable')
  const [scope, setScope] = useState('all')
  const [bucket, setBucket] = useState('overdue')
  const [sort, setSort] = useState('due_asc')
  const [query, setQuery] = useState('')
  const [agingFilter, setAgingFilter] = useState('all')
  const [plannerDismissed, setPlannerDismissed] = useState(false)

  // Page-local fetch rather than DashboardDataContext: that context exists so
  // several pages share one Fishbowl login, and this is the only page that
  // needs tasks. Keeping it separate also means a Planner outage can't slow
  // down or break the sales pages.
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReport(await getTasksReport(window_))
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not load the task report')
    } finally {
      setLoading(false)
    }
  }, [window_])

  useEffect(() => {
    refresh()
  }, [refresh])

  const buckets = report?.buckets ?? { done: [], overdue: [], due_next_week: [] }
  const excluded = report?.excluded ?? {}
  const sources = report?.sources ?? {}

  const scoped = useMemo(() => {
    const apply = (rows) => rows.filter((task) => matchesScope(task, scope))
    return {
      overdue: apply(buckets.overdue ?? []),
      due_next_week: apply(buckets.due_next_week ?? []),
      done: apply(buckets.done ?? []),
      no_due_date: apply(report?.no_due_date ?? []),
    }
  }, [buckets, report, scope])

  const peopleBoard = useMemo(() => {
    const rows = buildPeopleBoard({
      overdue: buckets.overdue ?? [],
      due_next_week: buckets.due_next_week ?? [],
      done: buckets.done ?? [],
      no_due_date: report?.no_due_date ?? [],
    })
    return sortPeopleBoard(rows, bucket)
  }, [buckets, report, bucket])

  const listed = useMemo(() => {
    return (scoped[bucket] ?? [])
      .filter((task) => matchesTaskQuery(task, query))
      .filter((task) => bucket !== 'overdue' || agingFilter === 'all' || overdueAgingKey(task) === agingFilter)
      .sort((a, b) => compareTasks(a, b, sort))
  }, [scoped, bucket, query, sort, agingFilter])

  const agingCounts = useMemo(() => countAging(scoped.overdue ?? []), [scoped])

  const tabs = useMemo(() => {
    const anyNoDue = (report?.no_due_date ?? []).length > 0
    return BUCKET_TABS.filter((tab) => !tab.optional || anyNoDue || bucket === 'no_due_date')
  }, [report, bucket])

  const plannerOff = sources.planner && sources.planner.ok === false
  const hubspotFailed = sources.hubspot && sources.hubspot.ok === false
  const olderOverdue = excluded.overdue_beyond_window ?? 0
  const who = scopeName(scope, peopleBoard)
  const overall = scope === 'all'

  function selectScope(next) {
    setScope(next)
    setQuery('')
    setAgingFilter('all')
  }

  function selectBucket(next) {
    setBucket(next)
    setAgingFilter('all')
  }

  const olderOverdueNote =
    bucket === 'overdue' && window_ === 'actionable' && olderOverdue > 0 ? (
      <p className="text-xs text-ink-subtle">
        ~{olderOverdue} more are overdue by over {excluded.overdue_lookback_days ?? 90} days and aren&apos;t shown.{' '}
        <button
          type="button"
          onClick={() => setWindow('all')}
          className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
        >
          Show everything
        </button>
      </p>
    ) : null

  const activeMeta = BUCKET_META[bucket] ?? BUCKET_META.overdue
  const scopedCount = scoped[bucket]?.length ?? 0
  const blurb = query.trim()
    ? `${listed.length} of ${scopedCount} match “${query.trim()}”`
    : bucket === 'done'
      ? `Completed in the last ${excluded.completed_lookback_days ?? 30} days`
      : activeMeta.blurb

  return (
    <div className="min-h-screen px-6 pb-10">
      <AppHeader title="Tasks" onRefresh={refresh} loading={loading} />

      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {hubspotFailed && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            HubSpot tasks failed to load: {sources.hubspot.reason}
          </div>
        )}

        {plannerOff && !plannerDismissed && (
          <div className="mb-4 flex items-start justify-between gap-3 text-xs text-ink-subtle">
            <p>
              {sources.planner.reason === 'disabled'
                ? 'HubSpot only — Planner is waiting on an Azure app registration and admin consent from IT.'
                : `Planner tasks failed to load: ${sources.planner.reason}`}
            </p>
            <button
              type="button"
              onClick={() => setPlannerDismissed(true)}
              className="shrink-0 font-medium text-ink-muted hover:text-ink"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading && !report ? (
          <TasksSkeleton />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-surface-raised p-4 shadow-panel">
              <TaskScopePicker scope={scope} people={peopleBoard} bucket={bucket} onChange={selectScope} />

              {!overall && (
                <label className="flex min-w-48 flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Search tasks</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Name or description"
                    className={controlClass}
                  />
                </label>
              )}

              {!overall && (
                <label className="flex min-w-44 flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Sort</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value)} className={controlClass}>
                    {TASK_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="ml-auto flex min-w-40 flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Range</span>
                <select
                  value={window_}
                  onChange={(event) => setWindow(event.target.value)}
                  className={`${controlClass} text-xs`}
                >
                  <option value="actionable">Actionable ({excluded.overdue_lookback_days ?? 90}d)</option>
                  <option value="all">Everything</option>
                </select>
              </label>
            </div>

            <div className={`mb-5 grid grid-cols-1 gap-3 ${tabs.length > 3 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
              {tabs.map((tab) => {
                const count = scoped[tab.key]?.length ?? 0
                const active = tab.key === bucket
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectBucket(tab.key)}
                    className={`rounded-xl border px-4 py-3 text-left shadow-panel transition-colors ${
                      active
                        ? 'border-sky-500/40 bg-sky-500/10'
                        : 'border-surface-border bg-surface-raised hover:bg-ink/[0.03]'
                    }`}
                  >
                    <p className="text-xs text-ink-muted">{tab.title}</p>
                    <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneValueClass(tab.tone)}`}>
                      {count}
                    </p>
                  </button>
                )
              })}
            </div>

            {overall ? (
              <>
                <TaskPeopleBoard rows={peopleBoard} bucket={bucket} onSelect={selectScope} />
                {olderOverdueNote ? <div className="mt-3 px-1">{olderOverdueNote}</div> : null}
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-muted">
                    Showing <span className="font-medium text-ink">{who}</span>
                    {' · '}
                    assigned to, not created by
                  </p>
                  <button
                    type="button"
                    onClick={() => selectScope('all')}
                    className="rounded-lg border border-surface-border px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-ink/[0.03] hover:text-ink"
                  >
                    Back to overall team
                  </button>
                </div>

                {bucket === 'overdue' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="mr-2 text-sm text-ink-muted">
                      {agingCounts.overdue_90 + agingCounts.overdue_31_90 + agingCounts.overdue_1_30} overdue
                      {agingCounts.overdue_90 > 0 ? ` · ${agingCounts.overdue_90} over 90 days` : ''}
                      {agingCounts.overdue_31_90 > 0 ? ` · ${agingCounts.overdue_31_90} in 31–90d` : ''}
                      {agingCounts.overdue_1_30 > 0 ? ` · ${agingCounts.overdue_1_30} in 1–30d` : ''}
                    </p>
                    <button
                      type="button"
                      onClick={() => setAgingFilter('all')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        agingFilter === 'all'
                          ? 'bg-sky-500/15 text-sky-700 ring-1 ring-inset ring-sky-500/30 dark:text-sky-300'
                          : 'border border-surface-border text-ink-muted hover:bg-ink/[0.03]'
                      }`}
                    >
                      All
                    </button>
                    {AGING_BANDS.map((band) => (
                      <button
                        key={band.key}
                        type="button"
                        onClick={() => setAgingFilter(band.key)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                          agingFilter === band.key
                            ? 'bg-sky-500/15 text-sky-700 ring-1 ring-inset ring-sky-500/30 dark:text-sky-300'
                            : 'border border-surface-border text-ink-muted hover:bg-ink/[0.03]'
                        }`}
                      >
                        {band.label} ({agingCounts[band.key]})
                      </button>
                    ))}
                  </div>
                )}

                <TaskBucketSection
                  title={`${who} · ${activeMeta.title}`}
                  blurb={blurb}
                  tasks={listed}
                  tone={BUCKET_TABS.find((tab) => tab.key === bucket)?.tone ?? 'default'}
                  empty={emptyCopy(bucket, who, agingFilter)}
                  showAssignee={false}
                  footer={
                    olderOverdueNote ? (
                      <div className="mt-3 border-t border-surface-border pt-3">{olderOverdueNote}</div>
                    ) : null
                  }
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
