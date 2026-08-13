import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import RepWonDealsModal from '../components/RepWonDealsModal.jsx'
import StatCard from '../components/StatCard.jsx'
import TeamRepList from '../components/TeamRepList.jsx'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import { isRevenueStage } from '../lib/deals.js'
import { sumAmountsByCurrency } from '../lib/format.js'

function compactUsd(value) {
  if (value == null) return null
  const amount = Number(value)
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`
  if (amount >= 10_000) return `$${Math.round(amount / 1000)}K`
  if (amount >= 1_000) return `$${(amount / 1000).toFixed(1)}K`
  return `$${Math.round(amount).toLocaleString()}`
}

function compareRows(a, b, sort) {
  switch (sort) {
    case 'won_revenue_desc':
      return b.wonRevenueUsd - a.wonRevenueUsd
    case 'open_pipeline_desc':
      return b.openPipelineUsd - a.openPipelineUsd
    case 'win_rate_desc':
      return (b.winRate ?? -1) - (a.winRate ?? -1)
    case 'name_asc':
      return a.name.localeCompare(b.name)
    default:
      return 0
  }
}

export default function TeamPerformancePage() {
  const { summary, error, loading, refresh } = useDashboardData()
  const deals = summary?.deals ?? []
  const [sort, setSort] = useState('won_revenue_desc')
  const [selectedRep, setSelectedRep] = useState(null)

  const unassignedCount = deals.filter((deal) => !deal.owner).length

  const rows = useMemo(() => {
    const byOwner = new Map()

    for (const deal of deals) {
      const key = deal.owner?.id ?? 'unassigned'
      if (!byOwner.has(key)) {
        byOwner.set(key, {
          id: key,
          name: deal.owner?.name ?? deal.owner?.email ?? (deal.owner ? `Owner ${deal.owner.id}` : 'Unassigned'),
          won: [],
          lost: [],
          open: [],
          revenue: [],
        })
      }
      const bucket = byOwner.get(key)
      if (deal.is_won) bucket.won.push(deal)
      else if (deal.is_closed) bucket.lost.push(deal)
      else bucket.open.push(deal)
      if (isRevenueStage(deal)) bucket.revenue.push(deal)
    }

    return [...byOwner.values()].map((bucket) => {
      const revenueByCurrency = sumAmountsByCurrency(
        bucket.revenue,
        (deal) => deal.amount,
        (deal) => deal.currency,
        'USD',
      )
      const openByCurrency = sumAmountsByCurrency(bucket.open, (deal) => deal.amount, (deal) => deal.currency, 'USD')

      const revenueUsd = bucket.revenue.filter((deal) => deal.currency === 'USD' && deal.amount != null)
      const avgDealSize =
        revenueUsd.length > 0 ? revenueUsd.reduce((sum, deal) => sum + deal.amount, 0) / revenueUsd.length : null

      const closed = bucket.won.length + bucket.lost.length

      return {
        id: bucket.id,
        name: bucket.name,
        wonCount: bucket.won.length,
        lostCount: bucket.lost.length,
        openCount: bucket.open.length,
        closedCount: closed,
        wonDealCount: bucket.revenue.length,
        winRate: closed > 0 ? Math.round((bucket.won.length / closed) * 100) : null,
        avgDealSizeLabel: avgDealSize != null ? `${compactUsd(avgDealSize)} USD` : null,
        revenueByCurrency,
        openByCurrency,
        wonRevenueUsd: revenueByCurrency.USD ?? 0,
        openPipelineUsd: openByCurrency.USD ?? 0,
        revenueDeals: bucket.revenue,
      }
    })
  }, [deals])

  const sortedRows = useMemo(() => {
    const ranked = rows.slice().sort((a, b) => compareRows(a, b, sort))
    if (sort === 'name_asc') return ranked
    const assigned = ranked.filter((row) => row.id !== 'unassigned')
    const unassigned = ranked.filter((row) => row.id === 'unassigned')
    return [...assigned, ...unassigned]
  }, [rows, sort])

  const repCount = rows.filter((row) => row.id !== 'unassigned').length
  const maxWonUsd = Math.max(1, ...rows.map((row) => row.wonRevenueUsd))

  return (
    <div className="min-h-screen px-6 pb-10">
      <AppHeader title="Team Performance" onRefresh={refresh} loading={loading} />

      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-3">
          <StatCard compact label="Reps with Deals" value={repCount} />
          <StatCard
            compact
            label="Unassigned Deals"
            value={unassignedCount}
            tone={unassignedCount > 0 ? 'warn' : 'default'}
          />
        </div>

        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink">Sales by Rep</h2>
          <p className="text-xs text-ink-subtle">
            Won is confirmed-sale stages only (Ready to ship → Completed). Click a row to see those
            deals. Sort from the column headers.
          </p>
        </div>

        <TeamRepList
          rows={sortedRows}
          sort={sort}
          onSort={setSort}
          onSelect={setSelectedRep}
          maxWonUsd={maxWonUsd}
        />
      </div>

      {selectedRep && <RepWonDealsModal rep={selectedRep} onClose={() => setSelectedRep(null)} />}
    </div>
  )
}
