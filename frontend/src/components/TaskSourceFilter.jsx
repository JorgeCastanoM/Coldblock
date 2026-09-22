import { SOURCE_KEYS, SOURCE_LABELS, SOURCE_STYLES } from '../lib/tasks.js'

export function filterChipClass(active, padding = 'py-1.5') {
  return `inline-flex items-center gap-1.5 rounded-lg px-3 ${padding} text-xs font-medium ${
    active
      ? 'bg-sky-500/15 text-sky-700 ring-1 ring-inset ring-sky-500/30 dark:text-sky-300'
      : 'border border-surface-border text-ink-muted hover:bg-ink/[0.03]'
  }`
}

export function SourceDot({ source }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${SOURCE_STYLES[source].dot}`} aria-hidden="true" />
}

/** All / HubSpot / Planner chips. `counts` is `{all, hubspot, planner}`. */
export default function TaskSourceFilter({ value, onChange, counts }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Source</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter tasks by source">
        <button
          type="button"
          aria-pressed={value === 'all'}
          onClick={() => onChange('all')}
          className={filterChipClass(value === 'all', 'py-2')}
        >
          All
          <span className="tabular-nums text-ink-subtle">{counts.all}</span>
        </button>
        {SOURCE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={filterChipClass(value === key, 'py-2')}
          >
            <SourceDot source={key} />
            {SOURCE_LABELS[key]}
            <span className="tabular-nums text-ink-subtle">{counts[key]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
