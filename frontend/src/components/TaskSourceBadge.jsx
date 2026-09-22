import { SOURCE_LABELS, SOURCE_STYLES } from '../lib/tasks.js'

/** Orange HubSpot / green Planner pill — where to go to update the task. */
export default function TaskSourceBadge({ source }) {
  const style = SOURCE_STYLES[source]
  if (!style) return null
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {SOURCE_LABELS[source]}
    </span>
  )
}
