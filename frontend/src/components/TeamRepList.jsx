function compactAmount(value, currency = 'USD') {
  if (value == null || Number.isNaN(Number(value))) return null
  const amount = Number(value)
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M ${currency}`
  if (amount >= 10_000) return `$${Math.round(amount / 1000)}K ${currency}`
  if (amount >= 1_000) return `$${(amount / 1000).toFixed(1)}K ${currency}`
  return `$${Math.round(amount).toLocaleString()} ${currency}`
}

function compactByCurrency(byCurrency, primary = 'USD') {
  const primaryAmount = byCurrency[primary]
  const others = Object.entries(byCurrency).filter(([currency]) => currency !== primary)
  return {
    primary: primaryAmount != null ? compactAmount(primaryAmount, primary) : null,
    detail: others.length
      ? others.map(([currency, amount]) => compactAmount(amount, currency)).join(' + ')
      : null,
  }
}

function winRateTone(rate) {
  if (rate == null) return 'bg-ink/[0.12]'
  if (rate >= 70) return 'bg-emerald-400'
  if (rate >= 40) return 'bg-amber-400'
  return 'bg-rose-400'
}

function SortHeader({ id, label, hint, align = 'right', sort, onSort }) {
  const active = sort === id
  return (
    <button
      type="button"
      onClick={() => onSort(id)}
      title={hint}
      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition ${
        align === 'left' ? 'justify-start' : 'ml-auto justify-end'
      } ${active ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted'}`}
    >
      <span>{label}</span>
      <span className={`text-[9px] ${active ? 'text-sky-600 dark:text-sky-300' : 'opacity-40'}`} aria-hidden="true">
        {active ? '▼' : '↕'}
      </span>
    </button>
  )
}

function MoneyBlock({ byCurrency, empty = '—' }) {
  const money = compactByCurrency(byCurrency)
  if (!money.primary && !money.detail) {
    return <p className="text-sm tabular-nums text-ink-subtle">{empty}</p>
  }
  return (
    <div>
      <p className="text-sm font-semibold tabular-nums text-ink">{money.primary ?? empty}</p>
      {money.detail && <p className="mt-0.5 text-[11px] tabular-nums text-ink-subtle">+ {money.detail}</p>}
    </div>
  )
}

export default function TeamRepList({ rows, sort, onSort, onSelect, maxWonUsd = 1 }) {
  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-panel">
      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(7rem,1fr)_minmax(6.5rem,0.7fr)_minmax(7rem,1fr)] gap-4 border-b border-surface-border px-4 py-2.5 sm:grid">
        <SortHeader id="name_asc" label="Rep" hint="Sort by name" align="left" sort={sort} onSort={onSort} />
        <SortHeader
          id="won_revenue_desc"
          label="Won"
          hint="Confirmed-sale revenue (Ready to ship through Completed)"
          sort={sort}
          onSort={onSort}
        />
        <SortHeader
          id="win_rate_desc"
          label="Win rate"
          hint="Won ÷ closed deals (pipeline conversion)"
          sort={sort}
          onSort={onSort}
        />
        <SortHeader
          id="open_pipeline_desc"
          label="Open"
          hint="Value still in an open stage"
          sort={sort}
          onSort={onSort}
        />
      </div>

      <ul>
        {rows.map((row, index) => {
          const share = maxWonUsd > 0 ? Math.max(row.wonRevenueUsd > 0 ? 6 : 0, Math.round((row.wonRevenueUsd / maxWonUsd) * 100)) : 0
          const unassigned = row.id === 'unassigned'

          return (
            <li key={row.id} className="border-b border-surface-border/60 last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(row)}
                className="grid w-full grid-cols-1 gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink/[0.04] focus:outline-none focus-visible:bg-sky-500/10 sm:grid-cols-[minmax(0,1.4fr)_minmax(7rem,1fr)_minmax(6.5rem,0.7fr)_minmax(7rem,1fr)] sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                      unassigned
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
                    }`}
                  >
                    {unassigned ? '—' : index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {row.wonDealCount} won
                      {row.openCount > 0 ? ` · ${row.openCount} open` : ''}
                      {row.lostCount > 0 ? ` · ${row.lostCount} lost` : ''}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-sky-700 dark:text-sky-300 sm:hidden">
                      View won deals →
                    </p>
                  </div>
                </div>

                <div className="min-w-0 sm:text-right">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-subtle sm:hidden">Won</p>
                  <MoneyBlock byCurrency={row.revenueByCurrency} empty="No won revenue" />
                  {row.wonDealCount > 0 && (
                    <div className="mt-1.5 hidden h-1 overflow-hidden rounded-full bg-surface sm:block">
                      <div
                        className="h-full rounded-full bg-sky-400/80"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  )}
                  {row.avgDealSizeLabel && (
                    <p className="mt-1 text-[11px] tabular-nums text-ink-subtle">avg {row.avgDealSizeLabel}</p>
                  )}
                </div>

                <div className="sm:text-right">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-subtle sm:hidden">
                    Win rate
                  </p>
                  {row.winRate != null ? (
                    <>
                      <p className="text-sm font-semibold tabular-nums text-ink">{row.winRate}%</p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                        <div
                          className={`h-full rounded-full ${winRateTone(row.winRate)}`}
                          style={{ width: `${Math.min(100, row.winRate)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-ink-subtle">
                        {row.wonCount} of {row.closedCount} closed
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-ink-subtle">No closed deals</p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 sm:block sm:text-right">
                  <div className="min-w-0">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-subtle sm:hidden">
                      Open
                    </p>
                    <MoneyBlock byCurrency={row.openByCurrency} empty="None open" />
                    {row.openCount > 0 && (
                      <p className="mt-1 text-[11px] text-ink-subtle">
                        {row.openCount} {row.openCount === 1 ? 'deal' : 'deals'}
                      </p>
                    )}
                  </div>
                  <span className="hidden shrink-0 text-ink-subtle sm:inline" aria-hidden="true">
                    →
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
