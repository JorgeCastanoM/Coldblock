import { Link } from 'react-router-dom'
import { formatCurrency, formatMultiCurrency, parseFishbowlDate } from '../lib/format.js'

function compactMoney(value, currency = 'USD') {
  const amount = Number(value) || 0
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M ${currency}`
  if (amount >= 1_000) return `$${Math.round(amount / 1000)}K ${currency}`
  return formatCurrency(amount, currency)
}

function daysUntil(date) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((target - start) / (24 * 60 * 60 * 1000))
}

function formatCloseDate(value) {
  const date = parseFishbowlDate(value)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function urgencyMeta(days) {
  if (days <= 3) {
    return {
      label: days <= 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`,
      chip: 'bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300',
      bar: 'bg-rose-400',
    }
  }
  if (days <= 7) {
    return {
      label: `${days} days`,
      chip: 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300',
      bar: 'bg-amber-400',
    }
  }
  return {
    label: `${days} days`,
    chip: 'bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300',
    bar: 'bg-sky-400',
  }
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
    <div className="flex min-h-[9rem] items-center justify-center rounded-lg border border-dashed border-surface-border bg-surface/60 px-4 py-8 text-center text-sm text-ink-subtle">
      {message}
    </div>
  )
}

function ValueRow({ deal, rank, maxAmount }) {
  const amount = Number(deal.amount) || 0
  const share = maxAmount > 0 ? Math.max(6, Math.round((amount / maxAmount) * 100)) : 0

  return (
    <li className="group rounded-lg px-2.5 py-2.5 transition-colors hover:bg-ink/[0.03]">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-[11px] font-semibold tabular-nums text-sky-700 dark:text-sky-300"
          aria-label={`Rank ${rank}`}
        >
          {rank}
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
              {compactMoney(amount, deal.currency || 'USD')}
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-sky-400/80 transition-[width] duration-300"
                style={{ width: `${share}%` }}
              />
            </div>
            <StagePill stage={deal.stage} />
          </div>
        </div>
      </div>
    </li>
  )
}

function ClosingRow({ deal }) {
  const date = parseFishbowlDate(deal.close_date)
  const days = date ? daysUntil(date) : null
  const urgency = days != null ? urgencyMeta(days) : null

  return (
    <li className="rounded-lg px-2.5 py-2.5 transition-colors hover:bg-ink/[0.03]">
      <div className="flex items-start gap-3">
        {urgency ? (
          <span
            className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${urgency.chip}`}
          >
            {urgency.label}
          </span>
        ) : (
          <span className="mt-0.5 inline-flex shrink-0 rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11px] font-semibold text-ink-subtle">
            —
          </span>
        )}
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
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums text-ink">
                {deal.amount != null ? compactMoney(deal.amount, deal.currency || 'USD') : '—'}
              </p>
              <p className="mt-0.5 text-[11px] tabular-nums text-ink-subtle">{formatCloseDate(deal.close_date)}</p>
            </div>
          </div>
          <div className="mt-2">
            <StagePill stage={deal.stage} />
          </div>
        </div>
      </div>
    </li>
  )
}

/**
 * Action-oriented open-pipeline snapshot: biggest bets vs. soonest closes.
 * Keeps to HubSpot deal fields only — no activity/meeting feed.
 */
export default function KeyOpportunities({ largest = [], closingSoon = [], nonUsdOpenByCurrency = {} }) {
  const maxAmount = Math.max(0, ...largest.map((deal) => Number(deal.amount) || 0))
  const largestTotal = largest.reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0)
  const closingTotal = closingSoon.reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0)
  const urgentCount = closingSoon.filter((deal) => {
    const date = parseFishbowlDate(deal.close_date)
    return date && daysUntil(date) <= 7
  }).length
  const nonUsdLabel = formatMultiCurrency(nonUsdOpenByCurrency)

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Open pipeline</p>
          <h2 className="mt-0.5 text-base font-semibold text-ink">Key Opportunities</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">Biggest open deals and anything closing in the next 30 days</p>
        </div>
        <Link
          to="/deals"
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-sky-700 transition hover:bg-sky-500/10 dark:text-sky-300"
        >
          View all deals →
        </Link>
      </div>

      <div className="grid grid-cols-1 divide-y divide-surface-border md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">By value</h3>
              <p className="text-[11px] text-ink-subtle">Largest open USD deals</p>
            </div>
            {largest.length > 0 && (
              <p className="text-right text-xs tabular-nums text-ink-muted">
                <span className="font-semibold text-ink">{compactMoney(largestTotal, 'USD')}</span>
                <span className="mt-0.5 block text-[11px] text-ink-subtle">top {largest.length}</span>
              </p>
            )}
          </div>

          {largest.length === 0 ? (
            <EmptyState message="No open USD deals yet." />
          ) : (
            <ul className="space-y-0.5">
              {largest.map((deal, index) => (
                <ValueRow key={deal.deal_id} deal={deal} rank={index + 1} maxAmount={maxAmount} />
              ))}
            </ul>
          )}

          {nonUsdLabel && (
            <p className="mt-3 border-t border-surface-border pt-3 text-[11px] text-ink-subtle">
              Also open in other currencies: {nonUsdLabel}
            </p>
          )}
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">Closing soon</h3>
              <p className="text-[11px] text-ink-subtle">Expected close within 30 days</p>
            </div>
            {closingSoon.length > 0 && (
              <p className="text-right text-xs tabular-nums text-ink-muted">
                <span className="font-semibold text-ink">{compactMoney(closingTotal)}</span>
                <span className="mt-0.5 block text-[11px] text-ink-subtle">
                  {closingSoon.length} deal{closingSoon.length === 1 ? '' : 's'}
                  {urgentCount > 0 ? ` · ${urgentCount} this week` : ''}
                </span>
              </p>
            )}
          </div>

          {closingSoon.length === 0 ? (
            <EmptyState message="Nothing scheduled to close in the next 30 days." />
          ) : (
            <ul className="space-y-0.5">
              {closingSoon.map((deal) => (
                <ClosingRow key={deal.deal_id} deal={deal} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
