import { useMemo } from 'react'
import { formatCurrency, parseFishbowlDate } from '../lib/format.js'

function formatCompactUsd(value) {
  const amount = Number(value) || 0
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${Math.round(amount / 1000)}K`
  return `$${Math.round(amount).toLocaleString()}`
}

function dealCloseDate(deal) {
  return parseFishbowlDate(deal.close_date) || parseFishbowlDate(deal.create_date)
}

/** Won USD revenue in `year` on or before the same month/day as `now`. */
function buildSameTimeMarker(deals, now = new Date()) {
  const year = now.getFullYear() - 1
  const cutoff = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999)

  let ytdCount = 0
  let ytdTotal = 0
  let yearCount = 0
  let yearTotal = 0

  for (const deal of deals) {
    const date = dealCloseDate(deal)
    if (!date || date.getFullYear() !== year) continue
    yearCount += 1
    yearTotal += Number(deal.amount) || 0
    if (date <= cutoff) {
      ytdCount += 1
      ytdTotal += Number(deal.amount) || 0
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

function yoyDelta(current, previous) {
  if (previous == null || previous <= 0) return null
  const pct = ((current - previous) / previous) * 100
  return {
    pct,
    label: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`,
    up: pct >= 0,
  }
}

/**
 * Year-over-year won revenue chart for HubSpot deals (USD).
 * Visual language echoes SalesOrderYearChart (bars + share rows + YTD marker)
 * but is tuned for deal counts and YoY deltas rather than order totals.
 */
export default function SalesYearChart({ yearlyStats = [], deals = [], footer = null }) {
  const chartYears = [...yearlyStats].sort((a, b) => a.year - b.year)
  const detailYears = [...chartYears].reverse()
  const grandTotal = chartYears.reduce((sum, row) => sum + row.total, 0)
  const maxTotal = Math.max(...chartYears.map((row) => row.total), 1)
  const sameTime = useMemo(() => buildSameTimeMarker(deals), [deals])

  if (chartYears.length === 0) {
    return (
      <div className="mb-6 rounded-xl border border-surface-border bg-surface-raised p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Won by year</p>
        <p className="mt-6 py-6 text-center text-sm text-slate-500">
          No won deals with a resolvable date yet.
        </p>
        {footer}
      </div>
    )
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
      <div className="border-b border-surface-border px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Won by year</p>
            <h2 className="mt-1 text-base font-semibold text-slate-100">Sales per Year</h2>
            <p className="text-xs text-slate-500">Won deals, by close date, in USD</p>
          </div>
          {sameTime && (
            <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="inline-block h-3 w-0.5 rounded-sm bg-rose-400" />
              This time last year
            </p>
          )}
        </div>
      </div>

      <div className="px-5 py-5 sm:px-6">
        {sameTime && (
          <div className="mb-5 rounded-lg border border-rose-400/25 bg-rose-400/5 px-3 py-2 text-sm text-slate-300">
            <span className="font-medium text-rose-300">By {formatMarkerDate(sameTime.cutoff)}</span>
            <span className="text-slate-500"> · </span>
            <span className="tabular-nums">
              {sameTime.ytdCount} {sameTime.ytdCount === 1 ? 'deal' : 'deals'} ·{' '}
              {formatCurrency(sameTime.ytdTotal, 'USD')}
            </span>
            <span className="text-slate-500">
              {' '}
              ({sameTime.pctOfYear.toFixed(0)}% of {sameTime.year})
            </span>
          </div>
        )}

        <div className="flex h-52 items-end gap-3 sm:gap-5">
          {chartYears.map((row, index) => {
            const height = Math.max(12, Math.round((row.total / maxTotal) * 100))
            const prev = index > 0 ? chartYears[index - 1] : null
            const delta = prev ? yoyDelta(row.total, prev.total) : null
            const showMarker = sameTime && row.year === sameTime.year
            const isLatest = index === chartYears.length - 1

            return (
              <div key={row.year} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="text-center leading-tight">
                  <p className="text-xs font-semibold tabular-nums text-sky-300">
                    {formatCompactUsd(row.total)}
                    <span className="ml-0.5 font-normal text-slate-500">USD</span>
                  </p>
                  {delta && (
                    <p
                      className={`mt-0.5 text-[10px] font-medium tabular-nums ${
                        delta.up ? 'text-emerald-400/90' : 'text-rose-400/90'
                      }`}
                    >
                      {delta.label} YoY
                    </p>
                  )}
                </div>

                <div className="relative flex h-36 w-full items-end justify-center">
                  <div
                    className={`relative w-[72%] max-w-[4.5rem] rounded-t-lg transition duration-200 ${
                      isLatest
                        ? 'bg-gradient-to-t from-sky-600 to-sky-300 group-hover:from-sky-500 group-hover:to-sky-200'
                        : 'bg-gradient-to-t from-sky-800 to-sky-500 group-hover:from-sky-700 group-hover:to-sky-400'
                    }`}
                    style={{ height: `${height}%` }}
                    title={`${row.year}: ${row.count} deals · ${formatCurrency(row.total, 'USD')}`}
                  >
                    {showMarker && (
                      <div
                        className="absolute inset-x-0 z-10"
                        style={{ top: `${100 - sameTime.pctOfYear}%` }}
                        title={`This time last year: ${formatCurrency(sameTime.ytdTotal, 'USD')}`}
                      >
                        <div className="h-0.5 w-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.8)]" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center leading-tight">
                  <p className={`text-sm font-semibold ${isLatest ? 'text-slate-50' : 'text-slate-200'}`}>
                    {row.year}
                  </p>
                  <p className="text-[11px] tabular-nums text-slate-500">
                    {row.count} {row.count === 1 ? 'deal' : 'deals'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <ul className="mt-6 space-y-3.5 border-t border-surface-border pt-4">
          {detailYears.map((row, index) => {
            const share = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0
            const older = detailYears[index + 1]
            const delta = older ? yoyDelta(row.total, older.total) : null
            const showMarker = sameTime && row.year === sameTime.year
            const markerLeft = showMarker ? share * (sameTime.pctOfYear / 100) : null

            return (
              <li key={`detail-${row.year}`}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                  <span className="font-medium text-slate-100">{row.year}</span>
                  <span className="tabular-nums text-slate-400">
                    {row.count} {row.count === 1 ? 'deal' : 'deals'} · {formatCurrency(row.total, 'USD')}
                    <span className="ml-2 text-slate-500">({share.toFixed(0)}%)</span>
                    {delta && (
                      <span
                        className={`ml-2 text-[11px] font-medium ${
                          delta.up ? 'text-emerald-400/90' : 'text-rose-400/90'
                        }`}
                      >
                        {delta.label}
                      </span>
                    )}
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
                      title={`This time last year: ${sameTime.ytdCount} deals · ${formatCurrency(sameTime.ytdTotal, 'USD')}`}
                    >
                      <div className="h-5 w-0.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]" />
                    </div>
                  )}
                </div>
                {showMarker && (
                  <p className="mt-1.5 text-[11px] tabular-nums text-rose-300/90">
                    ▎ This time last year — {sameTime.ytdCount} deals ·{' '}
                    {formatCurrency(sameTime.ytdTotal, 'USD')} ({sameTime.pctOfYear.toFixed(0)}% of{' '}
                    {sameTime.year})
                  </p>
                )}
              </li>
            )
          })}
        </ul>

        {footer}
      </div>
    </div>
  )
}
