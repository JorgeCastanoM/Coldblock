import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import DataTable from '../components/DataTable.jsx'
import StatCard from '../components/StatCard.jsx'
import { getDashboardSummary } from '../services/api.js'

const inventoryColumns = [
  { key: 'sku', label: 'SKU' },
  { key: 'qty_on_hand', label: 'On Hand' },
  { key: 'qty_demanded', label: 'Demanded' },
  { key: 'net_available', label: 'Net Available' },
]

export default function DashboardPage() {
  const { logout } = useAuth()
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDashboardSummary()
      .then(setSummary)
      .catch(() => setError('Could not load dashboard data'))
  }, [])

  return (
    <div className="min-h-screen p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">ColdBlock Dashboard</h1>
        <button
          onClick={logout}
          className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-300 hover:bg-surface-raised"
        >
          Sign out
        </button>
      </header>

      {error && <p className="text-red-400">{error}</p>}

      {summary && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="SKUs Tracked" value={summary.inventory.length} />
            <StatCard label="Open Manufacture Orders" value={summary.manufacture_orders.length} />
            <StatCard label="Active Deals" value={summary.deals.length} />
          </div>
          <DataTable columns={inventoryColumns} rows={summary.inventory} />
        </>
      )}
    </div>
  )
}
