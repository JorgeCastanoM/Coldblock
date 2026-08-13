export default function StatCard({ label, value, detail, tone = 'default', compact = false }) {
  const toneClass =
    tone === 'warn'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : 'text-ink'

  // Longer formatted values (currency + code, e.g. "$20,163.85 USD") don't fit
  // a fixed text-3xl in a quarter-width tile without wrapping onto 2-3 lines
  // and blowing out the card's height relative to its siblings in the row.
  const length = String(value).length
  const sizeClass = compact
    ? 'text-2xl'
    : length > 16
      ? 'text-xl'
      : length > 10
        ? 'text-2xl'
        : 'text-3xl'

  return (
    <div
      className={`rounded-xl border border-surface-border bg-surface-raised shadow-panel transition-colors hover:bg-ink/[0.03] ${
        compact ? 'px-4 py-3' : 'p-6'
      }`}
    >
      <p className={`text-ink-muted ${compact ? 'text-xs' : 'text-sm'}`}>{label}</p>
      <p
        className={`${compact ? 'mt-1' : 'mt-2'} truncate font-semibold leading-snug tabular-nums ${sizeClass} ${toneClass}`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-ink-subtle">{detail}</p>}
    </div>
  )
}
