import { useCallback, useEffect, useRef, useState } from 'react'

function ChevronLeft() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

/**
 * Horizontal board scroller with jump chips, side arrows, and shift+wheel
 * panning. Keeps kanban columns easy to move across on desktop and tablet.
 */
export default function BoardScroller({
  items = [],
  getKey = (item) => item.key,
  getLabel = (item) => item.label ?? item.key,
  getCount = (item) => item.count,
  getAccentClass = () => 'bg-slate-400',
  children,
}) {
  const scrollerRef = useRef(null)
  const columnRefs = useRef(new Map())
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [activeKey, setActiveKey] = useState(null)

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < max - 4)

    // Highlight the chip for the leftmost mostly-visible column.
    let current = null
    for (const item of items) {
      const key = getKey(item)
      const col = columnRefs.current.get(key)
      if (!col) continue
      const left = col.offsetLeft - el.scrollLeft
      if (left <= el.clientWidth * 0.45) current = key
    }
    setActiveKey(current ?? (items[0] ? getKey(items[0]) : null))
  }, [items, getKey])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      observer.disconnect()
    }
  }, [updateScrollState, items.length])

  function scrollByPage(direction) {
    const el = scrollerRef.current
    if (!el) return
    const amount = Math.max(280, Math.round(el.clientWidth * 0.75))
    el.scrollBy({ left: direction * amount, behavior: 'smooth' })
  }

  function scrollToKey(key) {
    const el = scrollerRef.current
    const col = columnRefs.current.get(key)
    if (!el || !col) return
    el.scrollTo({ left: Math.max(0, col.offsetLeft - 8), behavior: 'smooth' })
  }

  function handleWheel(event) {
    const el = scrollerRef.current
    if (!el) return
    // Trackpads already emit deltaX; shift+wheel turns vertical into horizontal
    // so desktop mice can pan the board without a horizontal scrollbar hunt.
    if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }
  }

  if (items.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {items.map((item) => {
            const key = getKey(item)
            const count = getCount(item)
            const active = activeKey === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => scrollToKey(key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? 'border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                    : 'border-surface-border bg-surface-raised text-ink-muted hover:bg-ink/[0.04] hover:text-ink'
                }`}
                title={`Jump to ${getLabel(item)}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${getAccentClass(item)}`} />
                <span className="max-w-[10rem] truncate">{getLabel(item)}</span>
                {count != null && <span className="tabular-nums text-ink-subtle">{count}</span>}
              </button>
            )
          })}
        </div>

        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            disabled={!canScrollLeft}
            aria-label="Scroll board left"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-surface-border bg-surface-raised text-ink-muted transition hover:bg-ink/[0.04] hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={!canScrollRight}
            aria-label="Scroll board right"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-surface-border bg-surface-raised text-ink-muted transition hover:bg-ink/[0.04] hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <div className="relative">
        {canScrollLeft && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[var(--surface)] to-transparent" />
        )}
        {canScrollRight && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[var(--surface)] to-transparent" />
        )}

        <div
          ref={scrollerRef}
          onWheel={handleWheel}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]"
        >
          {typeof children === 'function'
            ? items.map((item, index) =>
                children({
                  item,
                  index,
                  setColumnRef: (node) => {
                    const key = getKey(item)
                    if (node) columnRefs.current.set(key, node)
                    else columnRefs.current.delete(key)
                  },
                }),
              )
            : children}
        </div>
      </div>
    </div>
  )
}
