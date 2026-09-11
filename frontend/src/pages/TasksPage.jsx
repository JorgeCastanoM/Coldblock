import { useCallback, useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import TaskBucketSection from '../components/TaskBucketSection.jsx'
import TaskPeopleBoard from '../components/TaskPeopleBoard.jsx'
import TaskScopePicker from '../components/TaskScopePicker.jsx'
import {
  AGING_BANDS,
  BUCKET_META,
  BUCKET_TABS,
  SOURCE_KEYS,
  SOURCE_LABELS,
  SOURCE_STYLES,
  TASK_SORT_OPTIONS,
  buildPeopleBoard,
  compareTasks,
  countAging,
  countBySource,
  matchesScope,
  matchesSource,
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

function filterChipClass(active, padding = 'py-1.5') {
  return `inline-flex items-center gap-1.5 rounded-lg px-3 ${padding} text-xs font-medium ${
    active
      ? 'bg-sky-500/15 text-sky-700 ring-1 ring-inset ring-sky-500/30 dark:text-sky-300'
      : 'border border-surface-border text-ink-muted hover:bg-ink/[0.03]'
  }`
}

function SourceDot({ source }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${SOURCE_STYLES[source].dot}`} aria-hidden="true" />
}

function filterBuckets(bucketMap, keep) {
  return Object.fromEntries(Object.entries(bucketMap).map(([key, rows]) => [key, rows.filter(keep)]))
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

function emptyCopy(bucket, name, agingFilter = 'all', source = 'all') {
  const where = source === 'all' ? '' : ` in ${SOURCE_LABELS[source]}`
  if (bucket === 'overdue' && agingFilter !== 'all') {
    const band = AGING_BANDS.find((item) => item.key === agingFilter)
    return `Nothing overdue in the ${band?.label ?? 'selected'} band for ${name}${where}.`
  }
  const phrases = {
    overdue: `Nothing overdue for ${name}${where}.`,
    due_next_week: `Nothing due in the next 7 days for ${name}${where}.`,
    done: `Nothing completed recently for ${name}${where}.`,
    no_due_date: `No open tasks without a due date for ${name}${where}.`,
  }
  return phrases[bucket] ?? `No tasks for ${name}${where}.`
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
  const [source, setSource] = useState('all')
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

  const allTasks = useMemo(
    () => ({
      overdue: buckets.overdue ?? [],
      due_next_week: buckets.due_next_week ?? [],
      done: buckets.done ?? [],
      no_due_date: report?.no_due_date ?? [],
    }),
    [buckets, report],
  )

  // Person first, then source: the per-source counts on the cards and filter
  // chips describe the chosen person's tasks before the source cut.
  const personScoped = useMemo(() => filterBuckets(allTasks, (task) => matchesScope(task, scope)), [allTasks, scope])
  const scoped = useMemo(
    () => filterBuckets(personScoped, (task) => matchesSource(task, source)),
    [personScoped, source],
  )

  // Unfiltered roster for names only — a chosen person keeps their name even
  // when the source filter leaves them nothing to show.
  const roster = useMemo(() => buildPeopleBoard(allTasks), [allTasks])
  const peopleBoard = useMemo(
    () => sortPeopleBoard(buildPeopleBoard(filterBuckets(allTasks, (task) => matchesSource(task, source))), bucket),
    [allTasks, source, bucket],
  )

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
  // Source splits and the filter only mean something with both systems in.
  const plannerConnected = sources.planner?.ok === true
  const hubspotFailed = sources.hubspot && sources.hubspot.ok === false
  const olderOverdue =
    source === 'all'
      ? (excluded.overdue_beyond_window ?? 0)
      : (excluded.overdue_beyond_window_by_source?.[source] ?? 0)
  const who = scopeName(scope, roster)
  const overall = scope === 'all'
  const bucketSplit = countBySource(personScoped[bucket] ?? [])

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
                ? "HubSpot only — Planner isn't connected on this server."
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
              <TaskScopePicker
                scope={scope}
                scopeLabel={overall ? null : who}
                people={peopleBoard}
                bucket={bucket}
                onChange={selectScope}
              />

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

              <div className="ml-auto flex flex-wrap items-end gap-3">
                {plannerConnected && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Source</span>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter tasks by source">
                      <button
                        type="button"
                        aria-pressed={source === 'all'}
                        onClick={() => setSource('all')}
                        className={filterChipClass(source === 'all', 'py-2')}
                      >
                        All
                        <span className="tabular-nums text-ink-subtle">{personScoped[bucket]?.length ?? 0}</span>
                      </button>
                      {SOURCE_KEYS.map((key) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={source === key}
                          onClick={() => setSource(key)}
                          className={filterChipClass(source === key, 'py-2')}
                        >
                          <SourceDot source={key} />
                          {SOURCE_LABELS[key]}
                          <span className="tabular-nums text-ink-subtle">{bucketSplit[key]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label className="flex min-w-40 flex-col gap-1.5">
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
            </div>

            <div className={`mb-5 grid grid-cols-1 gap-3 ${tabs.length > 3 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
              {tabs.map((tab) => {
                const count = scoped[tab.key]?.length ?? 0
                const split = countBySource(personScoped[tab.key] ?? [])
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
                    {plannerConnected &&
                      (source === 'all' ? (
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-subtle">
                          {SOURCE_KEYS.map((key) => (
                            <span key={key} className="inline-flex items-center gap-1.5">
                              <SourceDot source={key} />
                              <span className="font-medium tabular-nums text-ink-muted">{split[key]}</span>
                              {SOURCE_LABELS[key]}
                            </span>
                          ))}
                        </p>
                      ) : (
                        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-ink-subtle">
                          <SourceDot source={source} />
                          {SOURCE_LABELS[source]} only
                        </p>
                      ))}
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
                    {source !== 'all' && (
                      <>
                        {' · '}
                        <span className="font-medium text-ink">{SOURCE_LABELS[source]}</span> only
                      </>
                    )}
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
                      className={filterChipClass(agingFilter === 'all')}
                    >
                      All
                    </button>
                    {AGING_BANDS.map((band) => (
                      <button
                        key={band.key}
                        type="button"
                        onClick={() => setAgingFilter(band.key)}
                        className={filterChipClass(agingFilter === band.key)}
                      >
                        {band.label} ({agingCounts[band.key]})
                      </button>
                    ))}
                  </div>
                )}

                <TaskBucketSection
                  title={`${who} · ${activeMeta.title}${source === 'all' ? '' : ` · ${SOURCE_LABELS[source]}`}`}
                  blurb={blurb}
                  tasks={listed}
                  tone={BUCKET_TABS.find((tab) => tab.key === bucket)?.tone ?? 'default'}
                  empty={emptyCopy(bucket, who, agingFilter, source)}
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
