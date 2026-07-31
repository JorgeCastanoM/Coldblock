import { useMemo } from 'react'
import { formatCurrency, parseFishbowlDate } from '../lib/format.js'

function formatCompactCad(value) {
  const amount = Number(value) || 0
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`
  }
  if (amount >= 10_000) {
    return `$${Math.round(amount / 1000)}k`
  }
  return `$${Math.round(amount).toLocaleString()}`
}

function orderDate(order) {
  return parseFishbowlDate(order.date_issued) || parseFishbowlDate(order.date_created)
}

/** Orders in `year` on or before the same month/day as `now` (that year). */
function buildSameTimeMarker(orders, now = new Date()) {
  const year = now.getFullYear() - 1
  const cutoff = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999)

  let ytdCount = 0
  let ytdTotal = 0
  let yearCount = 0
  let yearTotal = 0

  for (const order of orders) {
    const date = orderDate(order)
    if (!date || date.getFullYear() !== year) continue
    yearCount += 1
    yearTotal += Number(order.total) || 0
    if (date <= cutoff) {
      ytdCount += 1
      ytdTotal += Number(order.total) || 0
    }
  }

  if (yearCount === 0 || yearTotal <= 0) return null

  return {
    year,
    cutoff,
    ytdCount,
    ytdTotal,
    yearCount,
    yearTotal,
    pctOfYear: Math.min(100, (ytdTotal / yearTotal) * 100),
  }
}

function formatMarkerDate(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SalesOrderYearChart({ orders = [], totalOrders, yearlyStats }) {
  const chartYears = [...yearlyStats].sort((a, b) => a.year - b.year)
  const detailYears = [...chartYears].reverse()
  const grandTotal = chartYears.reduce((sum, row) => sum + row.total, 0)
  const maxTotal = Math.max(...chartYears.map((row) => row.total), 1)
  const sameTime = useMemo(() => buildSameTimeMarker(orders), [orders])

  if (chartYears.length === 0) {
    return (
      <div className="mb-6 rounded-xl border border-surface-border bg-surface-raised p-6">
        <p className="text-sm text-slate-400">Total Orders</p>
        <p className="mt-2 text-3xl font-semibold text-slate-100">{totalOrders}</p>
      </div>
    )
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
      <div className="grid grid-cols-1 divide-y divide-surface-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Orders</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-100">{totalOrders}</p>
          <p className="mt-1 text-sm text-slate-500">
            across {chartYears.length} {chartYears.length === 1 ? 'year' : 'years'}
          </p>
        </div>
        <div className="p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Value</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-100">
            {formatCurrency(grandTotal, 'CAD')}
          </p>
          <p className="mt-1 text-sm text-slate-500">sum of order totals</p>
        </div>
      </div>

      <div className="border-t border-surface-border px-5 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Revenue by year
          </p>
          {sameTime && (
            <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="inline-block h-3 w-0.5 rounded-sm bg-rose-400" />
              This time last year
            </p>
          )}
        </div>

        {sameTime && (
          <div className="mb-4 rounded-lg border border-rose-400/25 bg-rose-400/5 px-3 py-2 text-sm text-slate-300">
            <span className="font-medium text-rose-300">By {formatMarkerDate(sameTime.cutoff)}</span>
            <span className="text-slate-500"> · </span>
            <span className="tabular-nums">
              {sameTime.ytdCount} {sameTime.ytdCount === 1 ? 'order' : 'orders'} ·{' '}
              {formatCurrency(sameTime.ytdTotal, 'CAD')}
            </span>
            <span className="text-slate-500">
              {' '}
              ({sameTime.pctOfYear.toFixed(0)}% of {sameTime.year})
            </span>
          </div>
        )}

        <div className="flex h-48 items-end gap-3 sm:gap-6">
          {chartYears.map((row) => {
            const height = Math.max(10, Math.round((row.total / maxTotal) * 100))
            const showMarker = sameTime && row.year === sameTime.year
            return (
              <div key={row.year} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
                <p className="text-xs font-medium tabular-nums text-sky-300/90">
                  {formatCompactCad(row.total)}
                  <span className="ml-0.5 text-slate-500">CAD</span>
                </p>
                <div className="relative flex h-32 w-full items-end justify-center">
                  <div
                    className="relative w-[70%] max-w-[4rem] rounded-t-lg bg-gradient-to-t from-sky-700 to-sky-400 transition duration-200 group-hover:from-sky-600 group-hover:to-sky-300"
                    style={{ height: `${height}%` }}
                    title={`${row.year}: ${row.count} orders · ${formatCurrency(row.total, 'CAD')}`}
                  >
                    {showMarker && (
                      <div
                        className="absolute inset-x-0 top-0 z-10"
                        style={{ top: `${100 - sameTime.pctOfYear}%` }}
                        title={`This time last year: ${formatCurrency(sameTime.ytdTotal, 'CAD')}`}
                      >
                        <div className="h-0.5 w-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.8)]" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-center leading-tight">
                  <p className="text-sm font-semibold text-slate-100">{row.year}</p>
                  <p className="text-[11px] tabular-nums text-slate-500">
                    {row.count} {row.count === 1 ? 'order' : 'orders'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <ul className="mt-6 space-y-3 border-t border-surface-border pt-4">
          {detailYears.map((row) => {
            const share = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0
            const showMarker = sameTime && row.year === sameTime.year
            // Marker sits along the filled share bar at YTD / full-year.
            const markerLeft = showMarker ? share * (sameTime.pctOfYear / 100) : null
            return (
              <li key={`detail-${row.year}`}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                  <span className="font-medium text-slate-100">{row.year}</span>
                  <span className="tabular-nums text-slate-400">
                    {row.count} orders · {formatCurrency(row.total, 'CAD')}
                    <span className="ml-2 text-slate-500">({share.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="relative h-2.5 overflow-visible rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-sky-400/75 transition-[width] duration-300"
                    style={{ width: `${Math.max(share, 3)}%` }}
                  />
                  {showMarker && markerLeft != null && (
                    <div
                      className="pointer-events-none absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${Math.max(markerLeft, 1)}%` }}
                      title={`This time last year: ${sameTime.ytdCount} orders · ${formatCurrency(sameTime.ytdTotal, 'CAD')}`}
                    >
                      <div className="h-5 w-0.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]" />
                    </div>
                  )}
                </div>
                {showMarker && (
                  <p className="mt-1.5 text-[11px] tabular-nums text-rose-300/90">
                    ▎ This time last year — {sameTime.ytdCount} orders ·{' '}
                    {formatCurrency(sameTime.ytdTotal, 'CAD')} ({sameTime.pctOfYear.toFixed(0)}% of{' '}
                    {sameTime.year})
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
