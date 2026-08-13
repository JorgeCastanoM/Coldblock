import { useEffect, useMemo } from 'react'
import { formatCurrency, formatMultiCurrency, parseFishbowlDate, sumAmountsByCurrency } from '../lib/format.js'

function formatCloseDate(value) {
  const date = parseFishbowlDate(value)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function RepWonDealsModal({ rep, onClose }) {
  const deals = useMemo(() => {
    const list = [...(rep?.revenueDeals ?? [])]
    list.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
    return list
  }, [rep])

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

        <div className="min-h-0 flex-1 overflow-y-auto">
          {deals.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-subtle">
              No confirmed-sale deals attributed to this rep yet.
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
            <span className="text-ink-subtle">Total</span>
            <span className="font-semibold tabular-nums text-ink">{totalsLabel ?? '—'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
