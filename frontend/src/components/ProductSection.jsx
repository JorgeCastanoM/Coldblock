import { useState } from 'react'
import DataTable from './DataTable.jsx'
import SerialNumbersModal from './SerialNumbersModal.jsx'
import { formatMultiCurrency, sumByCurrency } from '../lib/format.js'

function CostCell({ amount, currency, emphasis }) {
  if (amount == null) return <span className="text-ink-subtle">—</span>
  const formatted = Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={emphasis ? 'text-ink' : 'text-ink-muted'}>${formatted}</span>
      <span className="rounded bg-surface px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
        {currency || 'CAD'}
      </span>
    </span>
  )
}

const columns = [
  {
    key: 'sku',
    label: 'SKU',
    cellClassName: 'font-mono text-[13px] font-medium text-ink',
  },
  {
    key: 'description',
    label: 'Description',
    cellClassName: 'text-ink-muted',
  },
  {
    key: 'qty_on_hand',
    label: 'On Hand',
    align: 'right',
    cellClassName: 'font-medium text-ink',
  },
  {
    key: 'reqd_display',
    label: "Req'd / Unit",
    align: 'right',
    cellClassName: 'text-ink-muted',
  },
  {
    key: 'last_unit_cost',
    label: 'Last Cost',
    align: 'right',
    render: (value, row) => <CostCell amount={value} currency={row.last_currency} />,
  },
  {
    key: 'estimated_cost',
    label: 'Est. Cost',
    align: 'right',
    render: (value, row) => <CostCell amount={value} currency={row.last_currency} emphasis />,
  },
]

function formatRequirements(requirements) {
  if (!requirements || requirements.length === 0) return ''
  const qty = requirements[0]?.req_per_unit
  return qty == null ? '' : String(qty)
}

function StockBadge({ qty, sku }) {
  const stock = qty ?? 0
  const tone =
    stock <= 0
      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20'
      : stock <= 2
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20'
        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20'

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tone}`}
      title={`Finished good ${sku}`}
    >
      <span className="tabular-nums">{stock}</span>
      <span className="opacity-80">in stock</span>
    </span>
  )
}

export default function ProductSection({ name, parts, finishedSku, finishedQtyOnHand }) {
  const [serialsOpen, setSerialsOpen] = useState(false)

  const rows = parts.map((part) => ({
    ...part,
    reqd_display: formatRequirements(part.requirements),
  }))

  const pricedCount = parts.filter((part) => part.estimated_cost != null).length
  const buildCostLabel = formatMultiCurrency(sumByCurrency(parts))
  const hasGaps = pricedCount < parts.length
  const showFinishedStock = finishedSku != null

  return (
    <>
      <details className="group rounded-xl border border-surface-border bg-surface-raised open:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
        <summary className="flex cursor-pointer list-none select-none flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-surface-border bg-surface text-ink-subtle transition group-open:rotate-90 group-open:border-sky-500/30 group-open:text-sky-700 dark:text-sky-300"
              aria-hidden="true"
            >
              ▸
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-semibold text-ink sm:text-lg">{name}</h2>
                {showFinishedStock && <StockBadge qty={finishedQtyOnHand} sku={finishedSku} />}
              </div>
              {showFinishedStock && (
                <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">{finishedSku}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-10 sm:pl-0">
            {showFinishedStock && (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setSerialsOpen(true)
                }}
                className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-xs font-medium text-ink transition hover:border-sky-500/40 hover:text-sky-700 dark:hover:text-sky-300"
              >
                Serials
              </button>
            )}
            {buildCostLabel && (
              <div className="text-right text-sm">
                <p className="font-semibold tabular-nums text-ink">{buildCostLabel}</p>
                <p className="text-xs text-ink-subtle">
                  to build
                  {hasGaps ? ` · ${pricedCount}/${parts.length} priced` : ''}
                </p>
              </div>
            )}
            <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-muted ring-1 ring-inset ring-surface-border">
              {parts.length} {parts.length === 1 ? 'part' : 'parts'}
            </span>
          </div>
        </summary>

        <div className="border-t border-surface-border px-2 pb-3 pt-1 sm:px-4">
          <DataTable columns={columns} rows={rows} />
        </div>
      </details>

      {serialsOpen && showFinishedStock && (
        <SerialNumbersModal
          sku={finishedSku}
          productName={name}
          onClose={() => setSerialsOpen(false)}
        />
      )}
    </>
  )
}
