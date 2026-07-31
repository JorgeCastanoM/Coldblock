import { useEffect, useState } from 'react'
import { getSerialNumbers } from '../services/api.js'

export default function SerialNumbersModal({ sku, productName, onClose }) {
  const [serials, setSerials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getSerialNumbers(sku)
      .then((data) => {
        if (!cancelled) setSerials(data.serials ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        const detail = err?.response?.data?.detail
        setError(typeof detail === 'string' ? detail : 'Could not load serial numbers')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [sku])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="serials-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div>
            <h2 id="serials-title" className="text-lg font-semibold text-slate-100">
              Serial numbers
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">
              {productName} · <span className="font-mono text-slate-300">{sku}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-slate-400">Loading serials from Fishbowl…</p>}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}

          {!loading && !error && serials.length === 0 && (
            <p className="text-sm text-slate-400">No serial numbers found for this part.</p>
          )}

          {!loading && !error && serials.length > 0 && (
            <ul className="divide-y divide-surface-border/70 rounded-lg border border-surface-border">
              {serials.map((row) => {
                const inStock = Number(row.qty) > 0
                return (
                  <li
                    key={row.serial_number}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                  >
                    <span className="font-mono text-sm font-medium text-slate-100">{row.serial_number}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${
                          inStock
                            ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
                            : 'bg-slate-500/10 text-slate-400 ring-slate-500/20'
                        }`}
                      >
                        {inStock ? 'In stock' : 'Not in stock'}
                      </span>
                      {row.committed && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300 ring-1 ring-inset ring-amber-500/20">
                          Committed
                        </span>
                      )}
                      <span className="text-slate-500">{row.location || '—'}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {!loading && !error && (
          <div className="border-t border-surface-border px-5 py-3 text-xs text-slate-500">
            {serials.length} serial{serials.length === 1 ? '' : 's'}
            {serials.length > 0 && (
              <>
                {' '}
                · {serials.filter((row) => Number(row.qty) > 0).length} in stock
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
