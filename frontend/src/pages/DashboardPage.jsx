import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import ProductSection from '../components/ProductSection.jsx'
import { useDashboardData } from '../context/DashboardDataContext.jsx'

export default function DashboardPage() {
  const { summary, error, loading, refresh } = useDashboardData()
  const [query, setQuery] = useState('')

  const products = summary?.products ?? []

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return products
    return products
      .map((product) => ({
        ...product,
        parts: product.parts.filter(
          (part) =>
            (part.sku ?? '').toLowerCase().includes(needle) ||
            (part.description ?? '').toLowerCase().includes(needle),
        ),
      }))
      .filter((product) => product.parts.length > 0)
  }, [products, query])

  const needle = query.trim()
  const visiblePartCount = filteredProducts.reduce((sum, product) => sum + product.parts.length, 0)

  return (
    <div className="min-h-screen px-6 pb-10">
      <AppHeader title="Products" onRefresh={refresh} loading={loading} />

      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {!summary && loading && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((key) => (
              <div
                key={key}
                className="h-16 animate-pulse rounded-xl border border-surface-border bg-surface-raised"
              />
            ))}
          </div>
        )}

        {summary && (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[16rem] flex-1">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search SKU or description…"
                  className="w-full rounded-xl border border-surface-border bg-surface-raised py-3 pl-4 pr-10 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/40"
                />
                {needle && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 hover:text-slate-300"
                    aria-label="Clear search"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-500">
                {needle
                  ? `${visiblePartCount} match${visiblePartCount === 1 ? '' : 'es'} in ${filteredProducts.length} section${filteredProducts.length === 1 ? '' : 's'}`
                  : `${products.length} product sections`}
              </p>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised/50 px-6 py-14 text-center">
                <p className="text-base text-slate-300">No parts match “{needle}”.</p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="mt-3 text-sm text-sky-400 hover:text-sky-300"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className={`space-y-3 transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
                {filteredProducts.map((product) => (
                  <ProductSection
                    key={product.name}
                    name={product.name}
                    parts={product.parts}
                    finishedSku={product.finished_sku}
                    finishedQtyOnHand={product.finished_qty_on_hand}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
