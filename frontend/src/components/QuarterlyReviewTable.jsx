import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { STAGE_BY_KEY, STAGE_TONES, closeDateOf, isPastDue } from '../lib/quarterlyReview.js'
import { sumAmountsByCurrency } from '../lib/format.js'

// Sticky cells need an opaque background (the rows behind would show through
// a translucent one), so the hover tint is mixed into the surface color.
const STICKY_BG =
  'bg-surface-raised group-hover:bg-[color-mix(in_srgb,var(--ink)_3%,var(--surface-raised))]'

const STAGE_ORDER = new Map([...STAGE_BY_KEY.keys()].map((key, index) => [key, index]))

const COLUMNS = [
  {
    key: 'account',
    label: 'Account',
    sortValue: ({ deal }) => deal.name?.toLowerCase() || null,
    sticky: true,
    className: 'sticky left-0 z-10 w-56 min-w-[14rem] border-r border-surface-border pl-4',
    headClassName: 'sticky left-0 z-30 w-56 min-w-[14rem] border-r border-surface-border',
  },
  { key: 'unit', label: 'Unit', sortValue: ({ deal }) => deal.expected_products?.join(', ').toLowerCase() || null },
  { key: 'close', label: 'Close date', sortValue: ({ deal }) => closeDateOf(deal)?.getTime() ?? null },
  { key: 'transaction', label: 'Transaction', sortValue: ({ deal }) => deal.purchase_type?.toLowerCase() || null },
  { key: 'amount', label: 'Approx $', align: 'right', sortValue: ({ deal }) => deal.amount ?? null },
  { key: 'channel', label: 'Channel', sortValue: ({ deal }) => deal.deal_type?.toLowerCase() || null },
  { key: 'country', label: 'Country', sortValue: ({ deal }) => deal.country?.toLowerCase() || null },
  {
    key: 'application',
    label: 'Application',
    sortValue: ({ deal }) => deal.sectors?.join(', ').toLowerCase() || null,
  },
  { key: 'stage', label: 'Stage', sortValue: ({ stageKey }) => STAGE_ORDER.get(stageKey) ?? null },
  {
    key: 'owner',
    label: 'Owner',
    sortValue: ({ deal }) => (deal.owner?.name ?? deal.owner?.email)?.toLowerCase() || null,
  },
  { key: 'next_step', label: 'HubSpot next step', className: 'min-w-[13rem]' },
  {
    key: 'notes',
    label: 'Notes',
    // Pinned right on wide screens so writing a note never means scrolling
    // past ten columns; on a phone two pinned columns would leave no room.
    sticky: true,
    className: 'min-w-[16rem] w-64 lg:sticky lg:right-0 lg:z-10 lg:border-l lg:border-surface-border',
    headClassName: 'min-w-[16rem] w-64 lg:sticky lg:right-0 lg:z-30 lg:border-l lg:border-surface-border',
  },
]

const WRAPPING_COLUMNS = new Set(['account', 'application', 'next_step', 'notes'])

// Blanks always sink to the bottom, whichever way the column is sorted.
export function sortRows(rows, sort) {
  const column = COLUMNS.find((col) => col.key === sort.key)
  if (!column?.sortValue) return rows
  const direction = sort.dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const left = column.sortValue(a)
    const right = column.sortValue(b)
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    if (left < right) return -direction
    if (left > right) return direction
    return 0
  })
}

function wholeDollars(value, currency) {
  if (value == null) return '—'
  const amount = Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })
  return currency && currency !== 'USD' ? `$${amount} ${currency}` : `$${amount}`
}

function compactTotal(byCurrency) {
  // USD leads; a $0 deal in another currency shouldn't add a "+ $0 CAD" tail.
  const entries = Object.entries(byCurrency)
    .filter(([, amount]) => amount)
    .sort(([a], [b]) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)))
  const parts = entries.map(([currency, amount]) => {
    const value =
      amount >= 1_000_000
        ? `$${(amount / 1_000_000).toFixed(2)}M`
        : amount >= 1_000
          ? `$${Math.round(amount / 1000)}K`
          : `$${Math.round(amount)}`
    return `${value} ${currency}`
  })
  return parts.length ? parts.join(' + ') : '$0'
}

function StagePill({ stageKey, label }) {
  const tone = STAGE_TONES[STAGE_BY_KEY.get(stageKey)?.tone]
  return (
    <span
      className={`inline-flex max-w-[11rem] truncate rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone?.pill ?? ''}`}
      title={label}
    >
      {label}
    </span>
  )
}

function ProductChips({ products }) {
  if (!products?.length) return <span className="text-ink-subtle">—</span>
  const shown = products.slice(0, 2)
  const rest = products.length - shown.length
  return (
    <div className="flex flex-wrap gap-1" title={products.join(', ')}>
      {shown.map((product) => (
        <span key={product} className="rounded bg-ink/[0.05] px-1.5 py-0.5 text-xs font-medium text-ink-muted">
          {product}
        </span>
      ))}
      {rest > 0 && <span className="px-0.5 py-0.5 text-xs text-ink-subtle">+{rest}</span>}
    </div>
  )
}

function CloseDateCell({ deal, year }) {
  const close = closeDateOf(deal)
  if (!close) return <span className="text-ink-subtle">—</span>
  const label = close.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(close.getFullYear() !== year ? { year: 'numeric' } : {}),
  })
  if (!isPastDue(deal)) return <span className="tabular-nums">{label}</span>
  return (
    <span className="flex flex-col leading-tight" title="Still open after its close date — update it in HubSpot">
      <span className="tabular-nums text-amber-700 dark:text-amber-400">{label}</span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-amber-700/80 dark:text-amber-400/80">
        Past due
      </span>
    </span>
  )
}

function NoteCell({ dealId, note, onSave }) {
  const [draft, setDraft] = useState(note?.text ?? '')
  const [status, setStatus] = useState(null) // null | 'saving' | 'saved' | 'error'
  const textareaRef = useRef(null)
  const timerRef = useRef(null)
  const pendingRef = useRef(null)

  // Grow with the text instead of scrolling inside a two-line box.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  const flush = () => {
    clearTimeout(timerRef.current)
    if (pendingRef.current == null) return
    const text = pendingRef.current
    pendingRef.current = null
    setStatus(onSave(dealId, text) ? 'saved' : 'error')
  }

  // Save whatever is still pending if the row unmounts (filter change, page leave).
  useEffect(() => flush, [])

  const handleChange = (event) => {
    setDraft(event.target.value)
    pendingRef.current = event.target.value
    setStatus('saving')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, 500)
  }

  const editedAt = note?.updated_at ? new Date(note.updated_at) : null

  return (
    <div>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={handleChange}
        onBlur={flush}
        rows={1}
        placeholder="Add a note…"
        aria-label="Note"
        className="block min-h-[2.25rem] w-full resize-none overflow-hidden rounded-md border border-transparent bg-ink/[0.03] px-2 py-1.5 text-sm text-ink placeholder:text-ink-subtle hover:border-surface-border focus:border-sky-500 focus:bg-surface-raised focus:outline-none"
      />
      <p className="mt-0.5 h-4 px-2 text-[11px] text-ink-subtle">
        {status === 'saving' && 'Saving…'}
        {status === 'error' && <span className="text-rose-600 dark:text-rose-400">Couldn’t save on this device</span>}
        {(status === 'saved' || status == null) &&
          editedAt &&
          `Edited ${editedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
      </p>
    </div>
  )
}

function SortHeader({ column, sort, onSort }) {
  if (!column.sortValue) return column.label
  const active = sort.key === column.key
  const arrow = active ? (sort.dir === 'asc' ? '↑' : '↓') : ''
  return (
    <button
      type="button"
      onClick={() => onSort(column.key)}
      className={`inline-flex items-center gap-1 rounded uppercase tracking-wide hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        active ? 'text-ink' : ''
      } ${column.align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      {column.label}
      <span className="w-2 text-[10px]">{arrow}</span>
    </button>
  )
}

function GroupHeader({ group }) {
  const total = sumAmountsByCurrency(
    group.rows.map((row) => row.deal),
    (deal) => deal.amount,
    (deal) => deal.currency,
    'USD',
  )
  const warn = group.tone === 'warn'
  return (
    <tr>
      <td
        colSpan={COLUMNS.length}
        className={`border-b border-surface-border p-0 ${warn ? 'bg-amber-500/[0.08]' : 'bg-surface'}`}
      >
        <div className="sticky left-0 flex w-max flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2.5">
          <span className={`text-sm font-semibold ${warn ? 'text-amber-800 dark:text-amber-300' : 'text-ink'}`}>
            {group.title}
          </span>
          {group.subtitle && <span className="text-xs text-ink-subtle">{group.subtitle}</span>}
          {group.current && (
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
              Current quarter
            </span>
          )}
          <span className="text-xs text-ink-muted">
            {group.rows.length} {group.rows.length === 1 ? 'deal' : 'deals'}
            {group.rows.length > 0 && <> · <span className="font-semibold tabular-nums">{compactTotal(total)}</span></>}
          </span>
        </div>
      </td>
    </tr>
  )
}

function DealRow({ row, year, note, onSaveNote }) {
  const { deal, stageKey } = row
  const bar = STAGE_TONES[STAGE_BY_KEY.get(stageKey)?.tone]?.bar ?? ''
  const cells = {
    account: (
      <div>
        {/* Stage color down the row's edge, like the spreadsheet's row fills. */}
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
        <p className="line-clamp-2 font-medium text-ink" title={deal.name ?? ''}>
          {deal.name || 'Untitled deal'}
        </p>
        {deal.company && deal.company !== deal.name && (
          <p className="mt-0.5 truncate text-xs text-ink-subtle" title={deal.company}>
            {deal.company}
          </p>
        )}
      </div>
    ),
    unit: <ProductChips products={deal.expected_products} />,
    close: <CloseDateCell deal={deal} year={year} />,
    transaction: deal.purchase_type ?? <span className="text-ink-subtle">—</span>,
    amount: <span className="font-medium">{wholeDollars(deal.amount, deal.currency)}</span>,
    channel: deal.deal_type ?? <span className="text-ink-subtle">—</span>,
    country: deal.country ?? <span className="text-ink-subtle">—</span>,
    application: deal.sectors?.length ? deal.sectors.join(', ') : <span className="text-ink-subtle">—</span>,
    stage: <StagePill stageKey={stageKey} label={deal.stage} />,
    owner: deal.owner?.name ?? deal.owner?.email ?? <span className="text-ink-subtle">Unassigned</span>,
    next_step: deal.next_step ? (
      <p className="line-clamp-3 whitespace-pre-line text-xs text-ink-muted" title={deal.next_step}>
        {deal.next_step}
      </p>
    ) : (
      <span className="text-ink-subtle">—</span>
    ),
    notes: <NoteCell dealId={deal.deal_id} note={note} onSave={onSaveNote} />,
  }

  return (
    <tr className="group align-top">
      {COLUMNS.map((column) => (
        <td
          key={column.key}
          className={`border-b border-surface-border/60 px-3 py-2.5 text-sm text-ink ${
            column.sticky ? STICKY_BG : 'group-hover:bg-ink/[0.03]'
          } ${column.align === 'right' ? 'text-right tabular-nums' : ''} ${
            WRAPPING_COLUMNS.has(column.key) ? '' : 'whitespace-nowrap'
          } ${column.className ?? ''}`}
        >
          {cells[column.key]}
        </td>
      ))}
    </tr>
  )
}

export default function QuarterlyReviewTable({ groups, year, sort, onSort, notes, onSaveNote }) {
  return (
    <div className="max-h-[calc(100vh-12rem)] min-h-[16rem] overflow-auto rounded-xl border border-surface-border bg-surface-raised shadow-panel">
      <table className="w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-ink-subtle">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  sort.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                }
                className={`sticky top-0 z-20 whitespace-nowrap border-b border-surface-border bg-surface-raised px-3 py-2.5 font-medium ${
                  column.align === 'right' ? 'text-right' : ''
                } ${column.headClassName ?? ''}`}
              >
                <SortHeader column={column} sort={sort} onSort={onSort} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupRows key={group.key} group={group} year={year} notes={notes} onSaveNote={onSaveNote} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({ group, year, notes, onSaveNote }) {
  return (
    <>
      <GroupHeader group={group} />
      {group.rows.length === 0 ? (
        <tr>
          <td colSpan={COLUMNS.length} className="border-b border-surface-border/60 p-0">
            <p className="sticky left-0 w-max px-3 py-3 text-sm text-ink-subtle">No deals here with these filters.</p>
          </td>
        </tr>
      ) : (
        group.rows.map((row) => (
          <DealRow
            key={row.deal.deal_id}
            row={row}
            year={year}
            note={notes[row.deal.deal_id]}
            onSaveNote={onSaveNote}
          />
        ))
      )}
    </>
  )
}

export { compactTotal }
