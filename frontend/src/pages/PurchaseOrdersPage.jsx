import AppHeader from '../components/AppHeader.jsx'
import PurchaseOrderBoard from '../components/PurchaseOrderBoard.jsx'
import StatCard from '../components/StatCard.jsx'
import { useDashboardData } from '../context/DashboardDataContext.jsx'

const OPEN_STATUSES = new Set([
  'Bid Request',
  'Pending Approval',
  'Issued',
  'Picking',
  'Partial',
  'Picked',
  'Shipped',
])

export default function PurchaseOrdersPage() {
  const { summary, error, loading, refresh } = useDashboardData()
  const orders = summary?.purchase_orders ?? []

  const openOrders = orders.filter((order) => OPEN_STATUSES.has(order.status))
  const fulfilledCount = orders.filter((order) => order.status === 'Fulfilled').length
  const pipelineValue = openOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0)

  return (
    <div className="min-h-screen px-6 pb-10">
      <AppHeader title="Purchase Orders" onRefresh={refresh} loading={loading} />

      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total Orders" value={orders.length} />
          <StatCard
            label="Open Pipeline Value"
            value={pipelineValue.toLocaleString(undefined, {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            })}
          />
          <StatCard label="Fulfilled" value={fulfilledCount} />
        </div>

        <PurchaseOrderBoard orders={orders} />
      </div>
    </div>
  )
}
