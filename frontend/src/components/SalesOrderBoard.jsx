import { useMemo, useState } from 'react'
import { parseFishbowlDate } from '../lib/format.js'

// Canonical left-to-right pipeline order. Only stages actually present in the
// data get a column, but when present they always appear in this sequence.
const STAGE_SEQUENCE = [
  { key: 'Estimate', accent: 'slate' },
  { key: 'Issued', accent: 'sky' },
  { key: 'In Progress', accent: 'amber' },
  { key: 'Picked', accent: 'violet' },
  { key: 'Partial', accent: 'violet' },
  { key: 'Picked Short', accent: 'violet' },
  { key: 'Fulfilled', label: 'Shipped', accent: 'emerald' },
  { key: 'Closed Short', accent: 'rose' },
  { key: 'Void', accent: 'rose' },
]

function stageLabel(key) {
  return STAGE_SEQUENCE.find((stage) => stage.key === key)?.label ?? key
}

const ACCENT = {
  slate: { dot: 'bg-slate-400', border: 'border-t-slate-400', chip: 'text-ink-muted bg-slate-400/10' },
  sky: { dot: 'bg-sky-400', border: 'border-t-sky-400', chip: 'text-sky-700 dark:text-sky-300 bg-sky-400/10' },
  amber: { dot: 'bg-amber-400', border: 'border-t-amber-400', chip: 'text-amber-700 dark:text-amber-300 bg-amber-400/10' },
  violet: { dot: 'bg-violet-400', border: 'border-t-violet-400', chip: 'text-violet-700 dark:text-violet-300 bg-violet-400/10' },
  emerald: { dot: 'bg-emerald-400', border: 'border-t-emerald-400', chip: 'text-emerald-700 dark:text-emerald-300 bg-emerald-400/10' },
  rose: { dot: 'bg-rose-400', border: 'border-t-rose-400', chip: 'text-rose-700 dark:text-rose-300 bg-rose-400/10' },
}

const SORT_OPTIONS = [
  { value: 'issued_desc', label: 'Issued (newest)' },
  { value: 'issued_asc', label: 'Issued (oldest)' },
  { value: 'total_desc', label: 'Total (high → low)' },
  { value: 'total_asc', label: 'Total (low → high)' },
  { value: 'so_asc', label: 'SO # (A → Z)' },
  { value: 'customer_asc', label: 'Customer (A → Z)' },
]

const controlClass =
  'rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-sky-500 focus:outline-none'

function formatCurrency(value) {
  if (value == null || value === '') return null
  return Number(value).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function formatDate(value) {
  const date = parseFishbowlDate(value)
  if (!date) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseDate(value) {
  const date = parseFishbowlDate(value)
  return date ? date.getTime() : 0
}

function compareOrders(a, b, sort) {
  switch (sort) {
    case 'issued_asc':
      return parseDate(a.date_issued) - parseDate(b.date_issued)
    case 'issued_desc':
      return parseDate(b.date_issued) - parseDate(a.date_issued)
    case 'total_asc':
      return (Number(a.total) || 0) - (Number(b.total) || 0)
    case 'total_desc':
      return (Number(b.total) || 0) - (Number(a.total) || 0)
    case 'customer_asc':
      return String(a.customer ?? '').localeCompare(String(b.customer ?? ''))
    case 'so_asc':
    default:
      return String(a.so_number ?? '').localeCompare(String(b.so_number ?? ''), undefined, { numeric: true })
  }
}

function formatQty(value) {
  if (value == null || value === '') return '—'
  const num = Number(value)
  if (Number.isNaN(num)) return String(value)
  return Number.isInteger(num) ? String(num) : num.toFixed(2)
}

function OrderCard({ order, accent, expanded, onToggle }) {
  const total = formatCurrency(order.total)
  const issued = formatDate(order.date_issued)
  const items = order.items ?? []

  return (
    <div
      className={`rounded-lg border border-surface-border border-t-2 ${ACCENT[accent].border} bg-surface shadow-sm`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-expanded={expanded}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="font-mono text-xs text-ink-subtle">SO #{order.so_number}</span>
          <div className="flex items-center gap-2">
            {total != null && <span className="text-sm font-semibold text-ink">{total}</span>}
            <span className="text-ink-subtle" aria-hidden="true">
              {expanded ? '▾' : '▸'}
            </span>
          </div>
        </div>
        <p className="mb-1 truncate text-sm font-medium text-ink" title={order.customer ?? ''}>
          {order.customer || 'Unknown customer'}
        </p>
        <div className="flex items-center justify-between gap-2 text-xs text-ink-subtle">
          {issued ? <span>Issued {issued}</span> : <span />}
          <span>
            {items.length} {items.length === 1 ? 'line' : 'lines'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-surface-border px-3 pb-3 pt-2">
          {items.length === 0 ? (
            <p className="px-1 py-2 text-xs text-ink-subtle">No line items on this order.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const remaining = Math.max(
                  0,
                  (Number(item.qty_to_fulfill) || Number(item.qty_ordered) || 0) -
                    (Number(item.qty_fulfilled) || 0),
                )
                return (
                  <li
                    key={`${item.line_number}-${item.sku}`}
                    className="rounded-md border border-surface-border/80 bg-surface-raised px-3 py-2"
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-ink-muted">{item.sku || '—'}</p>
                        <p className="truncate text-sm text-ink" title={item.description ?? ''}>
                          {item.description || 'No description'}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${ACCENT[accent].chip}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-ink-muted">
                      <div>
                        <p className="uppercase tracking-wide text-ink-subtle">Ordered</p>
                        <p className="tabular-nums text-ink">{formatQty(item.qty_ordered)}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide text-ink-subtle">Shipped</p>
                        <p className="tabular-nums text-ink">{formatQty(item.qty_fulfilled)}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide text-ink-subtle">Remaining</p>
                        <p className="tabular-nums text-ink">{formatQty(remaining)}</p>
                      </div>
                    </div>
                    {(Number(item.qty_picked) || 0) > 0 && (
                      <p className="mt-1 text-[11px] text-ink-subtle">
                        Picked {formatQty(item.qty_picked)}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function SalesOrderBoard({ orders }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('issued_desc')
  const [expandedId, setExpandedId] = useState(null)

  const statusOptions = useMemo(() => {
    const present = new Set(orders.map((order) => order.status).filter(Boolean))
    const known = STAGE_SEQUENCE.map((s) => s.key).filter((key) => present.has(key))
    const extras = [...present].filter((status) => !known.includes(status)).sort()
    return [...known, ...extras]
  }, [orders])

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return orders
      .filter((order) => {
        if (statusFilter !== 'all' && order.status !== statusFilter) return false
        if (!needle) return true
        const haystack = `${order.so_number ?? ''} ${order.customer ?? ''}`.toLowerCase()
        return haystack.includes(needle)
      })
      .slice()
      .sort((a, b) => compareOrders(a, b, sort))
  }, [orders, query, statusFilter, sort])

  const stages = STAGE_SEQUENCE.map((stage) => ({
    ...stage,
    orders: filteredOrders.filter((order) => order.status === stage.key),
  })).filter((stage) => stage.orders.length > 0)

  const knownStatuses = new Set(STAGE_SEQUENCE.map((s) => s.key))
  const other = filteredOrders.filter((order) => !knownStatuses.has(order.status))
  if (other.length > 0) {
    stages.push({ key: 'Other', accent: 'slate', orders: other })
  }

  const hasActiveFilters = query.trim() !== '' || statusFilter !== 'all'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-surface-raised p-4">
        <label className="flex min-w-48 flex-1 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="SO # or customer"
            className={controlClass}
          />
        </label>

        <label className="flex min-w-40 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={controlClass}
          >
            <option value="all">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {stageLabel(status)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-44 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className={controlClass}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setStatusFilter('all')
            }}
            className="rounded-lg border border-surface-border px-3 py-2 text-sm text-ink-muted hover:bg-surface"
          >
            Clear filters
          </button>
        )}

        <p className="ml-auto self-center text-sm text-ink-muted">
          Showing {filteredOrders.length} of {orders.length}
        </p>
      </div>

      {stages.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface-raised p-10 text-center text-sm text-ink-muted">
          {orders.length === 0 ? 'No open sales orders.' : 'No orders match the current filters.'}
        </div>
      ) : (
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const subtotal = stage.orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0)
            return (
              <div
                key={stage.key}
                className="flex min-w-72 flex-1 snap-start flex-col rounded-xl border border-surface-border bg-surface-raised"
              >
                <div className="border-b border-surface-border px-4 py-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${ACCENT[stage.accent].dot}`} />
                    <span className="text-sm font-semibold text-ink">
                      {stage.label ?? stage.key}
                    </span>
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${ACCENT[stage.accent].chip}`}
                    >
                      {stage.orders.length}
                    </span>
                  </div>
                  <p className="text-xs text-ink-subtle">{formatCurrency(subtotal) ?? '$0'} total</p>
                </div>
                <div className="flex flex-col gap-3 p-3">
                  {stage.orders.map((order) => (
                    <OrderCard
                      key={order.so_number}
                      order={order}
                      accent={stage.accent}
                      expanded={expandedId === order.so_number}
                      onToggle={() =>
                        setExpandedId((current) => (current === order.so_number ? null : order.so_number))
                      }
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
