export default function DataTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-subtle">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-3 py-2.5 font-medium ${column.align === 'right' ? 'text-right' : ''} ${column.className ?? ''}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id ?? row.sku ?? row.so_number ?? index}
              className="border-b border-surface-border/60 last:border-b-0 hover:bg-ink/[0.04]"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-3 py-3 text-ink ${column.align === 'right' ? 'text-right tabular-nums' : ''} ${column.cellClassName ?? ''}`}
                >
                  {column.render ? column.render(row[column.key], row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
