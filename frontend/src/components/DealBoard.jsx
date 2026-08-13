import { useMemo, useState } from 'react'
import { daysInCurrentStage, stageAgingSeverity } from '../lib/deals.js'
import { formatMultiCurrency, parseFishbowlDate, sumAmountsByCurrency } from '../lib/format.js'

// Column accents cycle by position rather than encoding "good/bad" by stage —
// different pipelines have entirely different stage sets (some "closed" stages
// mean won, others mean lost), and guessing that semantics wrong would be
// worse than just giving each column a distinct, neutral color.
const ACCENT_CYCLE = ['slate', 'sky', 'violet', 'cyan', 'amber', 'emerald', 'rose']
const ACCENT = {
  slate: { dot: 'bg-slate-400', border: 'border-t-slate-400', chip: 'text-ink-muted bg-slate-400/10' },
  sky: { dot: 'bg-sky-400', border: 'border-t-sky-400', chip: 'text-sky-700 dark:text-sky-300 bg-sky-400/10' },
  violet: { dot: 'bg-violet-400', border: 'border-t-violet-400', chip: 'text-violet-700 dark:text-violet-300 bg-violet-400/10' },
  cyan: { dot: 'bg-cyan-400', border: 'border-t-cyan-400', chip: 'text-cyan-700 dark:text-cyan-300 bg-cyan-400/10' },
  amber: { dot: 'bg-amber-400', border: 'border-t-amber-400', chip: 'text-amber-700 dark:text-amber-300 bg-amber-400/10' },
  emerald: { dot: 'bg-emerald-400', border: 'border-t-emerald-400', chip: 'text-emerald-700 dark:text-emerald-300 bg-emerald-400/10' },
  rose: { dot: 'bg-rose-400', border: 'border-t-rose-400', chip: 'text-rose-700 dark:text-rose-300 bg-rose-400/10' },
}

const SORT_OPTIONS = [
  { value: 'modified_desc', label: 'Recently updated' },
  { value: 'amount_desc', label: 'Amount (high → low)' },
  { value: 'amount_asc', label: 'Amount (low → high)' },
  { value: 'name_asc', label: 'Name (A → Z)' },
  { value: 'days_in_stage_desc', label: 'Longest in stage' },
]

const controlClass =
  'rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-sky-500 focus:outline-none'

function formatCurrency(value, currency) {
  if (value == null) return null
  const amount = Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return `$${amount} ${currency || 'USD'}`
}

function formatDate(value) {
  const date = parseFishbowlDate(value)
  if (!date) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function compareDeals(a, b, sort) {
  switch (sort) {
    case 'amount_desc':
      return (Number(b.amount) || 0) - (Number(a.amount) || 0)
    case 'amount_asc':
      return (Number(a.amount) || 0) - (Number(b.amount) || 0)
    case 'name_asc':
      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    case 'days_in_stage_desc':
      return (daysInCurrentStage(b) ?? -1) - (daysInCurrentStage(a) ?? -1)
    case 'modified_desc':
    default:
      return 0 // already sorted by hs_lastmodifieddate server-side
  }
}

function DealCard({ deal, accent, expanded, onToggle }) {
  const amount = formatCurrency(deal.amount, deal.currency)
  const closeDate = formatDate(deal.close_date)
  const items = deal.items ?? []
  const daysInStage = deal.is_closed ? null : daysInCurrentStage(deal)
  const agingSeverity = deal.is_closed ? null : stageAgingSeverity(deal)
  const agingClass =
    agingSeverity === 'bad'
      ? 'text-red-600 dark:text-red-400'
      : agingSeverity === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-ink-subtle'

  return (
    <div className={`rounded-lg border border-surface-border border-t-2 ${ACCENT[accent].border} bg-surface shadow-sm`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-expanded={expanded}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="truncate text-sm font-medium text-ink" title={deal.name ?? ''}>
            {deal.name || 'Untitled deal'}
          </span>
          {amount != null && <span className="shrink-0 text-sm font-semibold text-ink">{amount}</span>}
        </div>
        <p className="mb-1 truncate text-xs text-ink-muted" title={deal.company ?? ''}>
          {deal.company || 'No company linked'}
        </p>
        {daysInStage != null && (
          <p
            className={`mb-1 text-xs font-medium ${agingClass}`}
            title={`${daysInStage} ${daysInStage === 1 ? 'day' : 'days'} in ${deal.stage || 'this stage'}`}
          >
            {daysInStage}d in stage
          </p>
        )}
        <div className="flex items-center justify-between gap-2 text-xs text-ink-subtle">
          {closeDate ? <span>Close {closeDate}</span> : <span />}
          <span>
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-surface-border px-3 pb-3 pt-2">
          {items.length === 0 ? (
            <p className="px-1 py-2 text-xs text-ink-subtle">No line items on this deal.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li
                  key={`${item.sku ?? 'noskuI'}-${index}`}
                  className="rounded-md border border-surface-border/80 bg-surface-raised px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-ink-muted">{item.sku || '—'}</p>
                      <p className="truncate text-sm text-ink" title={item.name ?? ''}>
                        {item.name || 'No description'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] uppercase tracking-wide text-ink-subtle">Qty</p>
                      <p className="tabular-nums text-sm font-medium text-ink">{item.quantity ?? '—'}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function DealBoard({ deals }) {
  const [query, setQuery] = useState('')
  const [pipelineFilter, setPipelineFilter] = useState('all')
  const [showClosed, setShowClosed] = useState(false)
  const [sort, setSort] = useState('modified_desc')
  const [expandedId, setExpandedId] = useState(null)

  const pipelineOptions = useMemo(
    () => [...new Set(deals.map((deal) => deal.pipeline).filter(Boolean))].sort(),
    [deals],
  )

  const filteredDeals = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return deals
      .filter((deal) => {
        if (pipelineFilter !== 'all' && deal.pipeline !== pipelineFilter) return false
        if (!showClosed && deal.is_closed) return false
        if (!needle) return true
        const haystack = `${deal.name ?? ''} ${deal.company ?? ''}`.toLowerCase()
        return haystack.includes(needle)
      })
      .slice()
      .sort((a, b) => compareDeals(a, b, sort))
  }, [deals, query, pipelineFilter, showClosed, sort])

  const stages = useMemo(() => {
    const byStage = new Map()
    for (const deal of filteredDeals) {
      const key = deal.stage || 'Unknown'
      if (!byStage.has(key)) byStage.set(key, { key, order: deal.stage_order ?? 0, deals: [] })
      byStage.get(key).deals.push(deal)
    }
    return [...byStage.values()].sort((a, b) => a.order - b.order)
  }, [filteredDeals])

  const hasActiveFilters = query.trim() !== '' || pipelineFilter !== 'all' || showClosed

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-surface-raised shadow-panel p-4">
        <label className="flex min-w-48 flex-1 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Deal name or company"
            className={controlClass}
          />
        </label>

        <label className="flex min-w-48 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Pipeline</span>
          <select
            value={pipelineFilter}
            onChange={(event) => setPipelineFilter(event.target.value)}
            className={controlClass}
          >
            <option value="all">All pipelines</option>
            {pipelineOptions.map((pipeline) => (
              <option key={pipeline} value={pipeline}>
                {pipeline}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-44 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className={controlClass}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 pb-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(event) => setShowClosed(event.target.checked)}
            className="h-4 w-4 rounded border-surface-border bg-surface"
          />
          Show closed stages
        </label>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setPipelineFilter('all')
              setShowClosed(false)
            }}
            className="rounded-lg border border-surface-border px-3 py-2 text-sm text-ink-muted hover:bg-surface"
          >
            Clear filters
          </button>
        )}

        <p className="ml-auto self-center text-sm text-ink-muted">
          Showing {filteredDeals.length} of {deals.length}
        </p>
      </div>

      {stages.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface-raised shadow-panel p-10 text-center text-sm text-ink-muted">
          {deals.length === 0 ? 'No deals found.' : 'No deals match the current filters.'}
        </div>
      ) : (
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
          {stages.map((stage, index) => {
            const accent = ACCENT_CYCLE[index % ACCENT_CYCLE.length]
            const subtotal = formatMultiCurrency(
              sumAmountsByCurrency(
                stage.deals,
                (deal) => deal.amount,
                (deal) => deal.currency,
                'USD',
              ),
            )
            return (
              <div
                key={stage.key}
                className="flex min-w-72 flex-1 snap-start flex-col rounded-xl border border-surface-border bg-surface-raised shadow-panel"
              >
                <div className="border-b border-surface-border px-4 py-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${ACCENT[accent].dot}`} />
                    <span className="text-sm font-semibold text-ink">{stage.key}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${ACCENT[accent].chip}`}>
                      {stage.deals.length}
                    </span>
                  </div>
                  <p className="text-xs text-ink-subtle">{subtotal ?? '$0'} total</p>
                </div>
                <div className="flex flex-col gap-3 p-3">
                  {stage.deals.map((deal) => (
                    <DealCard
                      key={deal.deal_id}
                      deal={deal}
                      accent={accent}
                      expanded={expandedId === deal.deal_id}
                      onToggle={() => setExpandedId((current) => (current === deal.deal_id ? null : deal.deal_id))}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
