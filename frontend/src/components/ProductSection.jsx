import DataTable from './DataTable.jsx'

const columns = [
  { key: 'sku', label: 'SKU' },
  { key: 'description', label: 'Description' },
  { key: 'qty_on_hand', label: 'On Hand' },
  { key: 'qty_demanded', label: 'Demanded' },
  { key: 'net_available', label: 'Net Available' },
  { key: 'reqd_display', label: "Req'd / Unit" },
]

function formatRequirements(requirements) {
  if (!requirements || requirements.length === 0) return ''
  return requirements
    .map((req) => {
      const qty = req.req_per_unit ?? '—'
      return req.variant ? `${qty} (${req.variant})` : `${qty}`
    })
    .join('; ')
}

export default function ProductSection({ name, parts }) {
  const rows = parts.map((part) => ({
    ...part,
    reqd_display: formatRequirements(part.requirements),
  }))

  return (
    <details open className="mb-4 rounded-xl border border-surface-border bg-surface-raised">
      <summary className="flex cursor-pointer select-none items-center justify-between px-6 py-4">
        <span className="text-lg font-semibold text-slate-100">{name}</span>
        <span className="rounded-full bg-surface px-3 py-1 text-sm text-slate-400">
          {parts.length} {parts.length === 1 ? 'part' : 'parts'}
        </span>
      </summary>
      <div className="px-4 pb-4">
        <DataTable columns={columns} rows={rows} />
      </div>
    </details>
  )
}
