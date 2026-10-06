import { useCallback, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import QuarterlyReviewTable, { compactTotal, sortRows } from '../components/QuarterlyReviewTable.jsx'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import { sumAmountsByCurrency } from '../lib/format.js'
import {
  DEFAULT_STAGE_KEYS,
  QUARTERS,
  REVIEW_STAGES,
  STAGE_BY_KEY,
  STAGE_TONES,
  buildReviewCsv,
  closeDateOf,
  loadNotes,
  quarterOf,
  reviewStageKey,
  saveNote,
} from '../lib/quarterlyReview.js'

const controlClass =
  'rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-sky-500 focus:outline-none'

function ownerLabel(deal) {
  return deal.owner?.name ?? deal.owner?.email ?? (deal.owner ? `Owner ${deal.owner.id}` : 'Unassigned')
}

function matchesQuery(deal, note, query) {
  if (!query) return true
  const haystack = [
    deal.name,
    deal.company,
    deal.country,
    deal.purchase_type,
    deal.deal_type,
    deal.next_step,
    ownerLabel(deal),
    note?.text,
    ...(deal.expected_products ?? []),
    ...(deal.sectors ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

function usdTotal(rows) {
  return sumAmountsByCurrency(
    rows.map((row) => row.deal),
    (deal) => deal.amount,
    (deal) => deal.currency,
    'USD',
  )
}

// Stacked bar of a quarter's dollars by stage, so the mix (how much is
// already in purchasing vs still in dialogue) reads at a glance.
function StageMixBar({ rows }) {
  const byStage = new Map()
  let total = 0
  for (const { deal, stageKey } of rows) {
    const amount = Number(deal.amount) || 0
    byStage.set(stageKey, (byStage.get(stageKey) ?? 0) + amount)
    total += amount
  }
  return (
    <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-ink/[0.05]">
      {total > 0 &&
        REVIEW_STAGES.filter((stage) => byStage.get(stage.key)).map((stage) => (
          <div
            key={stage.key}
            className={STAGE_TONES[stage.tone].bar}
            style={{ width: `${(byStage.get(stage.key) / total) * 100}%` }}
            title={`${stage.label}: ${compactTotal({ USD: byStage.get(stage.key) })}`}
          />
        ))}
    </div>
  )
}

// USD stays the headline; any other currency drops to the detail line rather
// than truncating the headline into "$1.76M USD + $12…".
function splitTotal(rows) {
  const { USD, ...others } = usdTotal(rows)
  const primaryCurrency = USD != null || Object.keys(others).length === 0 ? 'USD' : Object.keys(others)[0]
  const primary = primaryCurrency === 'USD' ? (USD ?? 0) : others[primaryCurrency]
  const rest = Object.fromEntries(
    Object.entries(others).filter(([currency, amount]) => currency !== primaryCurrency && amount),
  )
  return {
    primary: compactTotal({ [primaryCurrency]: primary }),
    detail: Object.keys(rest).length ? `+ ${compactTotal(rest)}` : null,
  }
}

function QuarterCard({ label, sublabel, rows, active, current, pending, onClick }) {
  const total = pending ? { primary: '—', detail: null } : splitTotal(rows)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border px-4 py-3 text-left shadow-panel transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        active
          ? 'border-sky-500 bg-sky-500/[0.06] ring-1 ring-sky-500'
          : 'border-surface-border bg-surface-raised hover:bg-ink/[0.03]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {label} <span className="font-normal text-ink-subtle">{sublabel}</span>
        </p>
        {current && (
          <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
            Now
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-ink">{total.primary}</p>
      <p className="truncate text-xs text-ink-subtle" title={total.detail ?? undefined}>
        {pending ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'deal' : 'deals'}`}
        {total.detail && ` · ${total.detail}`}
      </p>
      <StageMixBar rows={rows} />
    </button>
  )
}

function StageChip({ stage, count, active, onToggle }) {
  const tone = STAGE_TONES[stage.tone]
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        active
          ? 'border-surface-border bg-surface-raised text-ink shadow-panel'
          : `${stage.optional ? 'border-dashed' : ''} border-surface-border text-ink-subtle hover:text-ink`
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${active ? tone.bar : 'bg-ink/[0.15]'}`} />
      {stage.optional && !active ? `+ ${stage.label}` : stage.label}
      <span className="tabular-nums text-xs text-ink-subtle">{count}</span>
    </button>
  )
}

function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function QuarterlyReviewPage() {
  const { summary, error, loading, refresh } = useDashboardData()
  const deals = summary?.deals ?? []

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentQuarter = quarterOf(now)

  const [year, setYear] = useState(currentYear)
  // null = whole year; 1-4 = one quarter; 'past_due' = carried-over deals only.
  const [quarter, setQuarter] = useState(null)
  const [stageKeys, setStageKeys] = useState(() => new Set(DEFAULT_STAGE_KEYS))
  const [owner, setOwner] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'close', dir: 'asc' })
  const [notes, setNotes] = useState(loadNotes)

  const handleSaveNote = useCallback((dealId, text) => {
    const result = saveNote(dealId, text)
    setNotes(result.notes)
    return result.saved
  }, [])

  const candidates = useMemo(
    () =>
      deals
        .map((deal) => ({ deal, stageKey: reviewStageKey(deal), close: closeDateOf(deal) }))
        .filter((row) => row.stageKey),
    [deals],
  )

  const years = useMemo(() => {
    const found = new Set([currentYear])
    for (const { close } of candidates) if (close) found.add(close.getFullYear())
    return [...found].sort((a, b) => a - b)
  }, [candidates, currentYear])

  const owners = useMemo(
    () => [...new Set(candidates.map(({ deal }) => ownerLabel(deal)))].sort((a, b) => a.localeCompare(b)),
    [candidates],
  )

  // Everything below the stage chips: rows for the chosen year that pass the
  // owner + search filters, before the stage filter (so chip counts stay put
  // while toggling).
  const yearRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const isCurrentYear = year === currentYear
    const rows = { quarters: { 1: [], 2: [], 3: [], 4: [] }, pastDue: [], noDate: [] }
    for (const row of candidates) {
      const { deal, close } = row
      if (owner !== 'all' && ownerLabel(deal) !== owner) continue
      if (!matchesQuery(deal, notes[deal.deal_id], needle)) continue
      if (!close) {
        if (isCurrentYear && !deal.is_closed) rows.noDate.push(row)
      } else if (close.getFullYear() === year) {
        rows.quarters[quarterOf(close)].push(row)
      } else if (isCurrentYear && !deal.is_closed && close.getFullYear() < year) {
        // Still open with a close date in an earlier year — it slipped and
        // nobody moved the date. Shown so it can't silently drop off the sheet.
        rows.pastDue.push(row)
      }
    }
    return rows
  }, [candidates, year, currentYear, owner, query, notes])

  const stageCounts = useMemo(() => {
    const counts = new Map()
    const all = [...Object.values(yearRows.quarters).flat(), ...yearRows.pastDue, ...yearRows.noDate]
    for (const { stageKey } of all) counts.set(stageKey, (counts.get(stageKey) ?? 0) + 1)
    return counts
  }, [yearRows])

  const byStage = useCallback((rows) => rows.filter((row) => stageKeys.has(row.stageKey)), [stageKeys])

  const quarterRows = useMemo(
    () => Object.fromEntries(QUARTERS.map((q) => [q.key, byStage(yearRows.quarters[q.key])])),
    [yearRows, byStage],
  )
  const pastDueRows = useMemo(() => byStage(yearRows.pastDue), [yearRows, byStage])
  const noDateRows = useMemo(() => byStage(yearRows.noDate), [yearRows, byStage])

  const groups = useMemo(() => {
    const result = []
    if ((quarter === null || quarter === 'past_due') && pastDueRows.length > 0) {
      result.push({
        key: 'past_due',
        title: 'Past due',
        subtitle: `Open, but the close date is before ${year} — update it in HubSpot`,
        tone: 'warn',
        rows: sortRows(pastDueRows, sort),
      })
    }
    for (const q of QUARTERS) {
      if (quarter !== null && quarter !== q.key) continue
      result.push({
        key: `q${q.key}`,
        title: `${q.label} ${year}`,
        subtitle: q.months,
        current: year === currentYear && q.key === currentQuarter,
        rows: sortRows(quarterRows[q.key], sort),
      })
    }
    if (quarter === null && noDateRows.length > 0) {
      result.push({ key: 'no_date', title: 'No close date', rows: sortRows(noDateRows, sort) })
    }
    return result
  }, [quarter, pastDueRows, quarterRows, noDateRows, sort, year, currentYear, currentQuarter])

  const yearTotalRows = useMemo(() => QUARTERS.flatMap((q) => quarterRows[q.key]), [quarterRows])
  const noteCount = Object.keys(notes).length

  const toggleStage = (key) => {
    setStageKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const handleExport = () => {
    const rows = groups.flatMap((group) => group.rows.map((row) => ({ ...row, group: group.title })))
    const scope = quarter === null ? 'full-year' : quarter === 'past_due' ? 'past-due' : `q${quarter}`
    downloadCsv(`quarterly-pipeline-${year}-${scope}.csv`, buildReviewCsv(rows, notes))
  }

  const changeYear = (value) => {
    setYear(value)
    if (quarter === 'past_due') setQuarter(null)
  }

  const showInitialLoad = loading && !summary

  return (
    <div className="min-h-screen px-6 pb-10">
      <AppHeader title="Quarterly" onRefresh={refresh} loading={loading} />

      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Pipeline by quarter</h2>
            <p className="text-sm text-ink-muted">
              Active Sales Pipeline deals by HubSpot close date. Tap a quarter to focus on it.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-raised p-1">
            <button
              type="button"
              onClick={() => changeYear(years[years.indexOf(year) - 1])}
              disabled={years.indexOf(year) <= 0}
              className="rounded-md px-2.5 py-1.5 text-sm text-ink-muted hover:bg-ink/[0.05] hover:text-ink disabled:opacity-30"
              aria-label="Previous year"
            >
              ‹
            </button>
            <select
              value={year}
              onChange={(event) => changeYear(Number(event.target.value))}
              className="rounded-md bg-transparent px-1 py-1 text-sm font-semibold text-ink focus:outline-none"
              aria-label="Year"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => changeYear(years[years.indexOf(year) + 1])}
              disabled={years.indexOf(year) >= years.length - 1}
              className="rounded-md px-2.5 py-1.5 text-sm text-ink-muted hover:bg-ink/[0.05] hover:text-ink disabled:opacity-30"
              aria-label="Next year"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <QuarterCard
            label="Full year"
            sublabel={year}
            rows={yearTotalRows}
            active={quarter === null}
            pending={showInitialLoad}
            onClick={() => setQuarter(null)}
          />
          {QUARTERS.map((q) => (
            <QuarterCard
              key={q.key}
              label={q.label}
              sublabel={q.months}
              rows={quarterRows[q.key]}
              active={quarter === q.key}
              current={year === currentYear && q.key === currentQuarter}
              pending={showInitialLoad}
              onClick={() => setQuarter((prev) => (prev === q.key ? null : q.key))}
            />
          ))}
        </div>

        {pastDueRows.length > 0 && (
          <button
            type="button"
            onClick={() => setQuarter((prev) => (prev === 'past_due' ? null : 'past_due'))}
            aria-pressed={quarter === 'past_due'}
            className={`mb-4 flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
              quarter === 'past_due'
                ? 'border-amber-500 bg-amber-500/15'
                : 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15'
            }`}
          >
            <span className="text-amber-800 dark:text-amber-300">
              <span className="font-semibold">
                {pastDueRows.length} open {pastDueRows.length === 1 ? 'deal' : 'deals'}
              </span>{' '}
              still {pastDueRows.length === 1 ? 'has' : 'have'} a close date before {year} (
              {compactTotal(usdTotal(pastDueRows))}). They’re listed at the top as Past due.
            </span>
            <span className="text-xs font-medium text-amber-800 underline dark:text-amber-300">
              {quarter === 'past_due' ? 'Show full year' : 'Show only these'}
            </span>
          </button>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {REVIEW_STAGES.map((stage) => (
            <StageChip
              key={stage.key}
              stage={stage}
              count={stageCounts.get(stage.key) ?? 0}
              active={stageKeys.has(stage.key)}
              onToggle={() => toggleStage(stage.key)}
            />
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search account, country, product, notes…"
            className={`${controlClass} min-w-[14rem] flex-1`}
            aria-label="Search deals"
          />
          <select
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className={controlClass}
            aria-label="Owner"
          >
            <option value="all">All owners</option>
            {owners.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExport}
            disabled={groups.every((group) => group.rows.length === 0)}
            className="rounded-lg border border-surface-border bg-surface-raised px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>

        <p className="mb-3 text-xs text-ink-subtle">
          Notes are saved in this browser only
          {noteCount > 0 && ` (${noteCount} ${noteCount === 1 ? 'note' : 'notes'})`} — other people and devices
          won’t see them. Export CSV includes them.
        </p>

        {showInitialLoad ? (
          <div className="flex min-h-[16rem] items-center justify-center rounded-xl border border-surface-border bg-surface-raised text-sm text-ink-subtle">
            Loading deals from HubSpot…
          </div>
        ) : stageKeys.size === 0 ? (
          <div className="flex min-h-[10rem] items-center justify-center rounded-xl border border-dashed border-surface-border text-sm text-ink-subtle">
            Pick at least one stage above.
          </div>
        ) : (
          <QuarterlyReviewTable
            groups={groups}
            year={year}
            sort={sort}
            onSort={handleSort}
            notes={notes}
            onSaveNote={handleSaveNote}
          />
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
          {REVIEW_STAGES.map((stage) => (
            <span key={stage.key} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STAGE_TONES[stage.tone].bar}`} />
              {STAGE_BY_KEY.get(stage.key).label}
              {stage.key === 'closed_won' && ' (incl. Ready to ship, Shipped, …)'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
