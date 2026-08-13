import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import DataTable from '../components/DataTable.jsx'
import StatCard from '../components/StatCard.jsx'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import { isRevenueStage } from '../lib/deals.js'
import { formatCurrency, splitPrimaryCurrency, sumAmountsByCurrency } from '../lib/format.js'

const TEAM_SORT_OPTIONS = [
  { value: 'won_revenue_desc', label: 'Won revenue (high → low)' },
  { value: 'open_pipeline_desc', label: 'Open pipeline (high → low)' },
  { value: 'win_rate_desc', label: 'Win rate (high → low)' },
  { value: 'name_asc', label: 'Name (A → Z)' },
]

const controlClass =
  'rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:border-sky-500 focus:outline-none'

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

  // Win Rate stays on is_won/is_closed (pipeline conversion); $ revenue stays
  // scoped to REVENUE_STAGES — same separation Sales Overview uses, kept
  // consistent here so a rep's numbers on this page don't quietly disagree
  // with the company-wide totals one click away.
  const won = useMemo(() => deals.filter((deal) => deal.is_won), [deals])
  const lost = useMemo(() => deals.filter((deal) => deal.is_closed && !deal.is_won), [deals])
  const open = useMemo(() => deals.filter((deal) => !deal.is_closed), [deals])

  const closedCount = won.length + lost.length
  const companyWinRate = closedCount > 0 ? Math.round((won.length / closedCount) * 100) : null

  const companyOpenPipeline = splitPrimaryCurrency(
    sumAmountsByCurrency(open, (deal) => deal.amount, (deal) => deal.currency, 'USD'),
  )

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
      const wonRevenue = splitPrimaryCurrency(revenueByCurrency)
      const openPipeline = splitPrimaryCurrency(openByCurrency)

      const revenueUsd = bucket.revenue.filter((deal) => deal.currency === 'USD' && deal.amount != null)
      const avgDealSize =
        revenueUsd.length > 0 ? revenueUsd.reduce((sum, deal) => sum + deal.amount, 0) / revenueUsd.length : null

      const closed = bucket.won.length + bucket.lost.length

      return {
        id: bucket.id,
        name: bucket.name,
        dealCount: bucket.won.length + bucket.lost.length + bucket.open.length,
        wonRevenueLabel: wonRevenue.primary,
        wonRevenueDetail: wonRevenue.detail,
        wonRevenueUsd: revenueByCurrency.USD ?? 0,
        wonDealCount: bucket.revenue.length,
        winRate: closed > 0 ? Math.round((bucket.won.length / closed) * 100) : null,
        avgDealSizeLabel: avgDealSize != null ? formatCurrency(avgDealSize, 'USD') : '—',
        openPipelineLabel: openPipeline.primary,
        openPipelineDetail: openPipeline.detail,
        openPipelineUsd: openByCurrency.USD ?? 0,
      }
    })
  }, [deals])

  const sortedRows = useMemo(() => rows.slice().sort((a, b) => compareRows(a, b, sort)), [rows, sort])
  const repCount = rows.filter((row) => row.id !== 'unassigned').length

  const columns = [
    { key: 'name', label: 'Rep', cellClassName: 'font-medium text-ink' },
    { key: 'dealCount', label: 'Deals', align: 'right' },
    {
      key: 'wonRevenueLabel',
      label: 'Won Revenue',
      align: 'right',
      render: (value, row) => (
        <div>
          <p className="font-medium text-ink">{value ?? '—'}</p>
          {row.wonRevenueDetail && <p className="text-xs text-ink-subtle">{row.wonRevenueDetail}</p>}
        </div>
      ),
    },
    { key: 'wonDealCount', label: 'Won Deals', align: 'right' },
    {
      key: 'winRate',
      label: 'Win Rate',
      align: 'right',
      render: (value) => (value != null ? `${value}%` : '—'),
    },
    { key: 'avgDealSizeLabel', label: 'Avg Deal (USD)', align: 'right' },
    {
      key: 'openPipelineLabel',
      label: 'Open Pipeline',
      align: 'right',
      render: (value, row) => (
        <div>
          <p className="font-medium text-ink">{value ?? '—'}</p>
          {row.openPipelineDetail && <p className="text-xs text-ink-subtle">{row.openPipelineDetail}</p>}
        </div>
      ),
    },
  ]

  return (
    <div className="min-h-screen px-6 pb-10">
      <AppHeader title="Team Performance" onRefresh={refresh} loading={loading} />

      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatCard label="Company Win Rate" value={companyWinRate != null ? `${companyWinRate}%` : '—'} />
          <StatCard label="Open Pipeline Value" value={companyOpenPipeline.primary ?? '—'} detail={companyOpenPipeline.detail} />
          <StatCard label="Reps with Deals" value={repCount} />
          <StatCard label="Unassigned Deals" value={unassignedCount} tone={unassignedCount > 0 ? 'warn' : 'default'} />
        </div>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Sales by Rep</h2>
            <p className="text-xs text-ink-subtle">
              Won revenue is scoped to confirmed-sale stages, same as Sales Overview
            </p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className={controlClass}>
              {TEAM_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-panel">
          <DataTable columns={columns} rows={sortedRows} />
        </div>
      </div>
    </div>
  )
}
