import { Link } from 'react-router-dom'
import { daysInCurrentStage, stageAgingSeverity } from '../lib/deals.js'
import { formatCurrency } from '../lib/format.js'
import StatCard from './StatCard.jsx'

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

function AgingList({ deals }) {
  if (deals.length === 0) return <EmptyState message="Nothing stalled here." />
  return (
    <ul className="space-y-0.5">
      {deals.map((deal) => (
        <AgingRow key={deal.deal_id} deal={deal} />
      ))}
    </ul>
  )
}

/**
 * Executive "what needs attention" view of open deals sitting longer than
 * expected in their current stage — company-wide worst offenders, plus the
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
  return (
    <div className="mb-6">
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Stalled Deals" value={stalledCount} tone={stalledCount > 0 ? 'warn' : 'default'} />
        <StatCard label="Severely Stalled" value={severeCount} tone={severeCount > 0 ? 'bad' : 'default'} />
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
          <h3 className="mb-2 text-sm font-semibold text-ink">Worst Offenders</h3>
          <AgingList deals={worstOffenders} />
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
