import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { daysInCurrentStage, stageAgingSeverity } from '../lib/deals.js'
import { formatCurrency } from '../lib/format.js'
import StatCard from './StatCard.jsx'

const controlClass =
  'rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink focus:border-sky-500 focus:outline-none'

const SORT_OPTIONS = [
  { value: 'days_desc', label: 'Days in stage (high → low)' },
  { value: 'days_asc', label: 'Days in stage (low → high)' },
  { value: 'amount_desc', label: 'Amount (high → low)' },
  { value: 'amount_asc', label: 'Amount (low → high)' },
  { value: 'name_asc', label: 'Name (A → Z)' },
]

function compactMoney(value, currency = 'USD') {
  const amount = Number(value) || 0
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M ${currency}`
  if (amount >= 1_000) return `$${Math.round(amount / 1000)}K ${currency}`
  return formatCurrency(amount, currency)
}

function StagePill({ stage }) {
  if (!stage) return null
  return (
    <span className="inline-flex max-w-full truncate rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
      {stage}
    </span>
  )
}

function EmptyState({ message }) {
  return (
    <div className="flex min-h-[7rem] items-center justify-center rounded-lg border border-dashed border-surface-border bg-surface/60 px-4 py-6 text-center text-sm text-ink-subtle">
      {message}
    </div>
  )
}

function AgingRow({ deal }) {
  const days = daysInCurrentStage(deal)
  const severity = stageAgingSeverity(deal)
  const chipClass =
    severity === 'bad'
      ? 'bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-400'
      : severity === 'warn'
        ? 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400'
        : 'bg-ink/[0.05] text-ink-subtle ring-surface-border'

  return (
    <li className="rounded-lg px-2.5 py-2.5 transition-colors hover:bg-ink/[0.03]">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${chipClass}`}
        >
          {days != null ? `${days}d` : '—'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink" title={deal.name || 'Untitled deal'}>
                {deal.name || 'Untitled deal'}
              </p>
              <p className="mt-0.5 truncate text-xs text-ink-subtle" title={deal.company || undefined}>
                {deal.company || 'No company linked'}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
              {deal.amount != null ? compactMoney(deal.amount, deal.currency || 'USD') : '—'}
            </p>
          </div>
          <div className="mt-1.5">
            <StagePill stage={deal.stage} />
          </div>
        </div>
      </div>
    </li>
  )
}

function AgingList({ deals, empty = 'Nothing stalled here.' }) {
  if (deals.length === 0) return <EmptyState message={empty} />
  return (
    <ul className="space-y-0.5">
      {deals.map((deal) => (
        <AgingRow key={deal.deal_id} deal={deal} />
      ))}
    </ul>
  )
}

function compareDeals(a, b, sort) {
  const daysA = daysInCurrentStage(a) ?? -1
  const daysB = daysInCurrentStage(b) ?? -1
  switch (sort) {
    case 'days_asc':
      return daysA - daysB
    case 'amount_desc':
      return (Number(b.amount) || 0) - (Number(a.amount) || 0)
    case 'amount_asc':
      return (Number(a.amount) || 0) - (Number(b.amount) || 0)
    case 'name_asc':
      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    case 'days_desc':
    default:
      return daysB - daysA
  }
}

/**
 * Executive "what needs attention" view of open deals sitting longer than
 * expected in their current stage — company-wide longest waits, plus the
 * two stages singled out in stakeholder feedback (Active Dialogue and
 * Procurement) called out on their own.
 */
export default function StalledDeals({
  worstOffenders = [],
  activeDialogue = [],
  procurement = [],
  stalledCount = 0,
  severeCount = 0,
}) {
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [sort, setSort] = useState('days_desc')

  const stageOptions = useMemo(
    () => [...new Set(worstOffenders.map((deal) => deal.stage).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [worstOffenders],
  )

  const filteredLongest = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return worstOffenders
      .filter((deal) => {
        if (stageFilter !== 'all' && deal.stage !== stageFilter) return false
        if (severityFilter !== 'all') {
          const severity = stageAgingSeverity(deal)
          if (severityFilter === 'stalled' && !severity) return false
          if (severityFilter === 'severe' && severity !== 'bad') return false
        }
        if (!needle) return true
        const haystack = `${deal.name ?? ''} ${deal.company ?? ''} ${deal.stage ?? ''}`.toLowerCase()
        return haystack.includes(needle)
      })
      .slice()
      .sort((a, b) => compareDeals(a, b, sort))
  }, [worstOffenders, query, stageFilter, severityFilter, sort])

  const hasFilters = query.trim() !== '' || stageFilter !== 'all' || severityFilter !== 'all' || sort !== 'days_desc'

  return (
    <div className="mb-6">
      <div className="mb-4 flex flex-wrap gap-3">
        <StatCard compact label="Stalled Deals" value={stalledCount} tone={stalledCount > 0 ? 'warn' : 'default'} />
        <StatCard compact label="Severely Stalled" value={severeCount} tone={severeCount > 0 ? 'bad' : 'default'} />
      </div>

      <section className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Deal health</p>
            <h2 className="mt-0.5 text-base font-semibold text-ink">Stalled Deals</h2>
            <p className="mt-0.5 text-xs text-ink-subtle">Open deals sitting longer than expected in their current stage</p>
          </div>
          <Link
            to="/deals"
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-sky-700 transition hover:bg-sky-500/10 dark:text-sky-300"
          >
            View all deals →
          </Link>
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">Longest in stage</h3>
              <p className="mt-0.5 text-xs text-ink-subtle">
                Open deals that have sat the longest, across every stage
              </p>
            </div>
            <p className="text-xs tabular-nums text-ink-subtle">
              {filteredLongest.length} of {worstOffenders.length}
            </p>
          </div>

          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">Search</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Deal, company, or stage"
                className={controlClass}
              />
            </label>
            <label className="flex min-w-40 flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">Stage</span>
              <select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value)}
                className={controlClass}
              >
                <option value="all">All stages</option>
                {stageOptions.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-36 flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">Status</span>
              <select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
                className={controlClass}
              >
                <option value="all">All open</option>
                <option value="stalled">Stalled only</option>
                <option value="severe">Severely stalled</option>
              </select>
            </label>
            <label className="flex min-w-44 flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">Sort</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)} className={controlClass}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setStageFilter('all')
                  setSeverityFilter('all')
                  setSort('days_desc')
                }}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:bg-surface"
              >
                Reset
              </button>
            )}
          </div>

          <div className="max-h-[28rem] overflow-y-auto [scrollbar-width:thin]">
            <AgingList
              deals={filteredLongest}
              empty={worstOffenders.length === 0 ? 'Nothing stalled here.' : 'No deals match the current filters.'}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-surface-border border-t border-surface-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="p-4 sm:p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Active Dialogue</h3>
            <AgingList deals={activeDialogue} />
          </div>
          <div className="p-4 sm:p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Procurement</h3>
            <AgingList deals={procurement} />
          </div>
        </div>
      </section>
    </div>
  )
}
