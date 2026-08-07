import { useMemo } from 'react'
import { formatCurrency, parseFishbowlDate } from '../lib/format.js'

// How many prior years get a "same date" year-to-date comparison against the
// current year. Kept small on purpose — this is a quick sanity check ("are we
// ahead of where we were last year and the year before"), not a full history.
const LOOKBACK_YEARS = 2

function formatCompactUsd(value) {
  const amount = Number(value) || 0
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${Math.round(amount / 1000)}K`
  return `$${Math.round(amount).toLocaleString()}`
}

function dealCloseDate(deal) {
  return parseFishbowlDate(deal.close_date) || parseFishbowlDate(deal.create_date)
}

/** Won USD revenue in `year`, split into "by the same month/day as `now`" vs the full year. */
function buildYearToDate(deals, year, now) {
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

  if (yearCount === 0) return null

  return {
    year,
    cutoff,
    ytdCount,
    ytdTotal,
    yearCount,
    yearTotal,
    pctOfYear: yearTotal > 0 ? Math.min(100, (ytdTotal / yearTotal) * 100) : null,
  }
}

/**
 * Same-date-of-year comparisons for the current year plus the last
 * LOOKBACK_YEARS years — always relative to `now`, so next year this
 * automatically shifts to compare against this year instead of needing to be
 * hand-updated.
 */
function buildYearToDateComparisons(deals, now) {
  const years = [now.getFullYear(), ...Array.from({ length: LOOKBACK_YEARS }, (_, i) => now.getFullYear() - 1 - i)]
  return years.map((year) => buildYearToDate(deals, year, now)).filter(Boolean)
}

function formatMarkerDate(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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

  const now = useMemo(() => new Date(), [])
  const comparisons = useMemo(() => buildYearToDateComparisons(deals, now), [deals, now])
  const currentYearComparison = comparisons.find((c) => c.year === now.getFullYear())
  const priorYearMarkers = comparisons.filter((c) => c.year !== now.getFullYear())
  const markerByYear = useMemo(() => new Map(priorYearMarkers.map((m) => [m.year, m])), [priorYearMarkers])

  if (chartYears.length === 0) {
    return (
      <div className="mb-6 rounded-xl border border-surface-border bg-surface-raised p-5 shadow-panel">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Won by year</p>
        <p className="mt-6 py-6 text-center text-sm text-ink-subtle">
          No won deals with a resolvable date yet.
        </p>
        {footer}
      </div>
    )
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-panel">
      <div className="border-b border-surface-border px-5 py-4 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Won by year</p>
        <h2 className="mt-1 text-base font-semibold text-ink">Sales per Year</h2>
        <p className="text-xs text-ink-subtle">Won deals, by close date, in USD</p>
      </div>

      <div className="px-5 py-5 sm:px-6">
        {comparisons.length > 0 && (
          <div className="mb-5 rounded-lg border border-rose-400/25 bg-rose-400/5 px-3.5 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
              Year-to-date, as of {formatMarkerDate(now)} — always compared against the current year
            </p>
            <ul className="space-y-1.5 text-sm">
              {currentYearComparison && (
                <li className="flex items-center justify-between gap-3">
                  <span className="font-medium text-rose-700 dark:text-rose-300">{currentYearComparison.year} (current)</span>
                  <span className="tabular-nums text-ink">
                    {currentYearComparison.ytdCount} {currentYearComparison.ytdCount === 1 ? 'deal' : 'deals'} ·{' '}
                    {formatCurrency(currentYearComparison.ytdTotal, 'USD')}
                  </span>
                </li>
              )}
              {priorYearMarkers.map((marker) => (
                <li key={marker.year} className="flex items-center justify-between gap-3">
                  <span className="text-ink-muted">{marker.year}</span>
                  <span className="tabular-nums text-ink-muted">
                    {marker.ytdCount} {marker.ytdCount === 1 ? 'deal' : 'deals'} ·{' '}
                    {formatCurrency(marker.ytdTotal, 'USD')}
                    {marker.pctOfYear != null && (
                      <span className="ml-1.5 text-ink-subtle">({marker.pctOfYear.toFixed(0)}% of full year)</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex h-52 items-end gap-3 sm:gap-5">
          {chartYears.map((row, index) => {
            const height = Math.max(12, Math.round((row.total / maxTotal) * 100))
            const prev = index > 0 ? chartYears[index - 1] : null
            const delta = prev ? yoyDelta(row.total, prev.total) : null
            const marker = markerByYear.get(row.year)
            const isLatest = index === chartYears.length - 1

            return (
              <div key={row.year} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="text-center leading-tight">
                  <p className="text-xs font-semibold tabular-nums text-sky-700 dark:text-sky-300">
                    {formatCompactUsd(row.total)}
                    <span className="ml-0.5 font-normal text-ink-subtle">USD</span>
                  </p>
                  {delta && (
                    <p
                      className={`mt-0.5 text-[10px] font-medium tabular-nums ${
                        delta.up
                          ? 'text-emerald-600 dark:text-emerald-400/90'
                          : 'text-rose-600 dark:text-rose-400/90'
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
                    {marker && marker.pctOfYear != null && (
                      <div
                        className="absolute inset-x-0 z-10"
                        style={{ top: `${100 - marker.pctOfYear}%` }}
                        title={`Same date in ${marker.year}: ${formatCurrency(marker.ytdTotal, 'USD')}`}
                      >
                        <div className="h-0.5 w-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.8)]" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center leading-tight">
                  <p className={`text-sm font-semibold ${isLatest ? 'text-ink' : 'text-ink'}`}>
                    {row.year}
                  </p>
                  <p className="text-[11px] tabular-nums text-ink-subtle">
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
            const marker = markerByYear.get(row.year)
            const markerLeft = marker && marker.pctOfYear != null ? share * (marker.pctOfYear / 100) : null

            return (
              <li key={`detail-${row.year}`}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                  <span className="font-medium text-ink">{row.year}</span>
                  <span className="tabular-nums text-ink-muted">
                    {row.count} {row.count === 1 ? 'deal' : 'deals'} · {formatCurrency(row.total, 'USD')}
                    <span className="ml-2 text-ink-subtle">({share.toFixed(0)}%)</span>
                    {delta && (
                      <span
                        className={`ml-2 text-[11px] font-medium ${
                          delta.up
                          ? 'text-emerald-600 dark:text-emerald-400/90'
                          : 'text-rose-600 dark:text-rose-400/90'
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
                  {markerLeft != null && (
                    <div
                      className="pointer-events-none absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${Math.max(markerLeft, 1)}%` }}
                      title={`Same date in ${marker.year}: ${marker.ytdCount} deals · ${formatCurrency(marker.ytdTotal, 'USD')}`}
                    >
                      <div className="h-5 w-0.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]" />
                    </div>
                  )}
                </div>
                {marker && (
                  <p className="mt-1.5 text-[11px] tabular-nums text-rose-700 dark:text-rose-300/90">
                    ▎ Same date in {marker.year} — {marker.ytdCount} deals · {formatCurrency(marker.ytdTotal, 'USD')}
                    {marker.pctOfYear != null && ` (${marker.pctOfYear.toFixed(0)}% of full year)`}
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
