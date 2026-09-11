import { useEffect, useMemo, useRef, useState } from 'react'
import { UNASSIGNED_KEY } from '../lib/tasks.js'

const controlClass =
  'rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-sky-500 focus:outline-none'

function chipClass(active) {
  return [
    'rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-sky-500/15 text-sky-700 ring-1 ring-inset ring-sky-500/30 dark:text-sky-300'
      : 'border border-surface-border bg-surface text-ink-muted hover:bg-ink/[0.04] hover:text-ink',
  ].join(' ')
}

export default function TaskScopePicker({ scope, scopeLabel, people, bucket, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // `people` can be narrowed by the source filter, which may leave out the
  // chosen person — `scopeLabel` keeps their name on the chip regardless.
  const selected = people.find((row) => row.key === scope)
  const selectedName = scopeLabel ?? (scope === UNASSIGNED_KEY ? 'Unassigned' : selected?.name)

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return people
    return people.filter((row) => {
      const haystack = `${row.name ?? ''} ${row.email ?? ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [people, query])

  useEffect(() => {
    function handlePointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  function pick(key) {
    onChange(key)
    setQuery('')
    setOpen(false)
  }

  return (
    // No min-w-0: the picker must keep its content width so the toolbar wraps
    // the controls beside it instead of letting them overlap the search box.
    <div ref={rootRef} className="flex flex-1 flex-wrap items-end gap-3">
      <div className="flex min-w-52 flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Who</span>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => pick('all')} aria-pressed={scope === 'all'} className={chipClass(scope === 'all')}>
            Overall team
          </button>
          {scope !== 'all' && (
            <button type="button" onClick={() => pick('all')} className={chipClass(true)} title="Back to overall team">
              {selectedName ?? scope}
              <span className="ml-2 text-ink-subtle" aria-hidden="true">
                ×
              </span>
            </button>
          )}
        </div>
      </div>

      <label className="relative flex min-w-56 flex-1 flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Find a person</span>
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Name or email"
          className={controlClass}
          aria-expanded={open}
          aria-haspopup="listbox"
        />
        {open && (
          <ul
            role="listbox"
            className="absolute top-[calc(100%+4px)] z-30 max-h-64 w-full overflow-y-auto rounded-lg border border-surface-border bg-surface-raised py-1 shadow-panel"
          >
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-subtle">No matching people</li>
            ) : (
              matches.map((row) => {
                const count = row[bucket] ?? 0
                const active = row.key === scope
                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => pick(row.key)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink/[0.04] ${
                        active ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'text-ink'
                      }`}
                    >
                      <span className="min-w-0 truncate">{row.name}</span>
                      <span className="shrink-0 tabular-nums text-ink-subtle">{count}</span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        )}
      </label>
    </div>
  )
}
