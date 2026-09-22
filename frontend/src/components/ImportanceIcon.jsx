import { IMPORTANCE_LEVELS } from '../lib/taskImportance.js'

/**
 * Filled circle + white glyph for a task's importance. Renders nothing when
 * there's no level — the column stays blank, as the report asks.
 * The label sits beside the icon unless `showLabel` is off, so meaning never
 * rests on colour alone.
 */
export default function ImportanceIcon({ level, showLabel = true, size = 16, className = '' }) {
  const spec = IMPORTANCE_LEVELS[level]
  if (!spec) return null

  const icon = (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className="shrink-0"
      aria-hidden={showLabel ? 'true' : undefined}
      role={showLabel ? undefined : 'img'}
      aria-label={showLabel ? undefined : `${spec.label} importance`}
    >
      <title>{`${spec.label} importance`}</title>
      <circle cx="8" cy="8" r="8" fill={spec.color} />
      {spec.shapes.map(({ tag: Tag, ...attrs }, index) => (
        <Tag key={index} {...attrs} />
      ))}
    </svg>
  )

  if (!showLabel) return icon

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      {icon}
      <span className="text-xs font-medium text-ink">{spec.label}</span>
    </span>
  )
}
