import { useMemo } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import SalesOrderBoard from '../components/SalesOrderBoard.jsx'
import SalesOrderYearChart from '../components/SalesOrderYearChart.jsx'
import { parseFishbowlDate } from '../lib/format.js'
import { useDashboardData } from '../context/DashboardDataContext.jsx'

function orderYear(order) {
  const date = parseFishbowlDate(order.date_issued) || parseFishbowlDate(order.date_created)
  return date ? date.getFullYear() : null
}

function buildYearlyStats(orders) {
  const byYear = new Map()
  for (const order of orders) {
    const year = orderYear(order)
    if (year == null) continue
    const entry = byYear.get(year) ?? { year, count: 0, total: 0 }
    entry.count += 1
    entry.total += Number(order.total) || 0
    byYear.set(year, entry)
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year)
}

export default function SalesOrdersPage() {
  const { summary, error, loading, refresh } = useDashboardData()
  const orders = summary?.sales_orders ?? []
  const yearlyStats = useMemo(() => buildYearlyStats(orders), [orders])

  return (
    <div className="min-h-screen px-6 pb-10">
      <AppHeader title="Sales Orders" onRefresh={refresh} loading={loading} />

      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <SalesOrderYearChart
          orders={orders}
          totalOrders={orders.length}
          yearlyStats={yearlyStats}
        />

        <SalesOrderBoard orders={orders} />
      </div>
    </div>
  )
}
