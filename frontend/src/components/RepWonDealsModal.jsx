import { useEffect, useMemo, useState } from 'react'
import { formatCurrency, formatMultiCurrency, parseFishbowlDate, sumAmountsByCurrency } from '../lib/format.js'

const controlClass =
  'rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink focus:border-sky-500 focus:outline-none'

function dealYear(deal) {
  const date = parseFishbowlDate(deal.close_date) || parseFishbowlDate(deal.create_date)
  return date ? date.getFullYear() : null
}

function formatCloseDate(value) {
  const date = parseFishbowlDate(value)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function compareDeals(a, b, sort) {
  const yearA = dealYear(a) ?? 0
  const yearB = dealYear(b) ?? 0
  switch (sort) {
    case 'year_desc':
      return yearB - yearA || (Number(b.amount) || 0) - (Number(a.amount) || 0)
    case 'year_asc':
      return yearA - yearB || (Number(b.amount) || 0) - (Number(a.amount) || 0)
    case 'amount_asc':
      return (Number(a.amount) || 0) - (Number(b.amount) || 0)
    case 'amount_desc':
    default:
      return (Number(b.amount) || 0) - (Number(a.amount) || 0)
  }
}

export default function RepWonDealsModal({ rep, onClose }) {
  const [yearFilter, setYearFilter] = useState('all')
  const [sort, setSort] = useState('year_desc')

  useEffect(() => {
    setYearFilter('all')
    setSort('year_desc')
  }, [rep?.id])

  const allDeals = rep?.revenueDeals ?? []

  const years = useMemo(() => {
    const set = new Set()
    for (const deal of allDeals) {
      const year = dealYear(deal)
      if (year != null) set.add(year)
    }
    return [...set].sort((a, b) => b - a)
  }, [allDeals])

  const deals = useMemo(() => {
    const selectedYear = yearFilter === 'all' ? null : Number(yearFilter)
    return allDeals
      .filter((deal) => selectedYear == null || dealYear(deal) === selectedYear)
      .slice()
      .sort((a, b) => compareDeals(a, b, sort))
  }, [allDeals, yearFilter, sort])

  const totalsByCurrency = useMemo(
    () => sumAmountsByCurrency(deals, (deal) => deal.amount, (deal) => deal.currency, 'USD'),
    [deals],
  )
  const totalsLabel = formatMultiCurrency(totalsByCurrency)

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!rep) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rep-won-deals-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Won deals</p>
            <h2 id="rep-won-deals-title" className="mt-0.5 truncate text-lg font-semibold text-ink">
              {rep.name}
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {deals.length} {deals.length === 1 ? 'deal' : 'deals'}
              {yearFilter !== 'all' ? ` in ${yearFilter}` : ''}
              {totalsLabel ? ` · ${totalsLabel}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-ink-muted hover:bg-ink/[0.05] hover:text-ink"
          >
            Close
          </button>
        </div>

        {allDeals.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 border-b border-surface-border px-5 py-3">
            <label className="flex min-w-32 flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">Year</span>
              <select
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
                className={controlClass}
              >
                <option value="all">All years</option>
                {years.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-40 flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">Sort</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)} className={controlClass}>
                <option value="year_desc">Year (newest first)</option>
                <option value="year_asc">Year (oldest first)</option>
                <option value="amount_desc">Amount (high → low)</option>
                <option value="amount_asc">Amount (low → high)</option>
              </select>
            </label>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {allDeals.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-subtle">
              No confirmed-sale deals attributed to this rep yet.
            </p>
          ) : deals.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-subtle">
              No won deals in {yearFilter}.
            </p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {deals.map((deal) => (
                <li key={deal.deal_id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink" title={deal.name || 'Untitled deal'}>
                      {deal.name || 'Untitled deal'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-subtle">
                      {deal.company || 'No company linked'}
                      {deal.stage ? ` · ${deal.stage}` : ''}
                    </p>
                    <p className="mt-1 text-[11px] tabular-nums text-ink-subtle">
                      Closed {formatCloseDate(deal.close_date)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                    {deal.amount != null ? formatCurrency(deal.amount, deal.currency) : '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {deals.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-surface-border px-5 py-3 text-sm">
            <span className="text-ink-subtle">{yearFilter === 'all' ? 'Total' : `${yearFilter} total`}</span>
            <span className="font-semibold tabular-nums text-ink">{totalsLabel ?? '—'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
