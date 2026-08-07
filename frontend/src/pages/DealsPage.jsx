import AppHeader from '../components/AppHeader.jsx'
import DealBoard from '../components/DealBoard.jsx'
import StatCard from '../components/StatCard.jsx'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import { splitPrimaryCurrency, sumAmountsByCurrency } from '../lib/format.js'

export default function DealsPage() {
  const { summary, error, loading, refresh } = useDashboardData()
  const deals = summary?.deals ?? []

  const openDeals = deals.filter((deal) => !deal.is_closed)
  const withCompany = deals.filter((deal) => deal.company).length
  const pipelineValue = splitPrimaryCurrency(
    sumAmountsByCurrency(
      openDeals,
      (deal) => deal.amount,
      (deal) => deal.currency,
      'USD',
    ),
  )

  return (
    <div className="min-h-screen px-6 pb-10">
      <AppHeader title="Deals" onRefresh={refresh} loading={loading} />

      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatCard label="Total Deals" value={deals.length} />
          <StatCard label="Open Deals" value={openDeals.length} />
          <StatCard label="Open Pipeline Value" value={pipelineValue.primary ?? '—'} detail={pipelineValue.detail} />
          <StatCard label="Deals with Company Linked" value={`${withCompany}/${deals.length}`} />
        </div>

        <DealBoard deals={deals} />
      </div>
    </div>
  )
}
