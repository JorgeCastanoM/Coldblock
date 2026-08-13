import AppHeader from '../components/AppHeader.jsx'
import DealBoard from '../components/DealBoard.jsx'
import StatCard from '../components/StatCard.jsx'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import { sumAmountsByCurrency } from '../lib/format.js'

function compactAmount(value, currency = 'USD') {
  if (value == null) return null
  const amount = Number(value)
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M ${currency}`
  if (amount >= 10_000) return `$${Math.round(amount / 1000)}K ${currency}`
  if (amount >= 1_000) return `$${(amount / 1000).toFixed(1)}K ${currency}`
  return `$${Math.round(amount).toLocaleString()} ${currency}`
}

export default function DealsPage() {
  const { summary, error, loading, refresh } = useDashboardData()
  const deals = summary?.deals ?? []

  const openDeals = deals.filter((deal) => !deal.is_closed)
  const withCompany = deals.filter((deal) => deal.company).length
  const pipelineByCurrency = sumAmountsByCurrency(
    openDeals,
    (deal) => deal.amount,
    (deal) => deal.currency,
    'USD',
  )
  const pipelinePrimary = compactAmount(pipelineByCurrency.USD, 'USD')
  const pipelineDetail = Object.entries(pipelineByCurrency)
    .filter(([currency]) => currency !== 'USD')
    .map(([currency, amount]) => compactAmount(amount, currency))
    .filter(Boolean)
    .join(' + ')

  return (
    <div className="min-h-screen px-6 pb-10">
      <AppHeader title="Deals" onRefresh={refresh} loading={loading} />

      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-3">
          <StatCard compact label="Total Deals" value={deals.length} />
          <StatCard compact label="Open Deals" value={openDeals.length} />
          <StatCard
            compact
            label="Open Pipeline"
            value={pipelinePrimary ?? '—'}
            detail={pipelineDetail ? `+ ${pipelineDetail}` : undefined}
          />
          <StatCard compact label="With Company" value={`${withCompany}/${deals.length}`} />
        </div>

        <DealBoard deals={deals} />
      </div>
    </div>
  )
}
