export default function StatCard({ label, value, detail, tone = 'default' }) {
  const toneClass = tone === 'warn' ? 'text-amber-400' : tone === 'bad' ? 'text-red-400' : 'text-slate-100'

  // Longer formatted values (currency + code, e.g. "$20,163.85 USD") don't fit
  // a fixed text-3xl in a quarter-width tile without wrapping onto 2-3 lines
  // and blowing out the card's height relative to its siblings in the row.
  const length = String(value).length
  const sizeClass = length > 16 ? 'text-xl' : length > 10 ? 'text-2xl' : 'text-3xl'

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-6 transition-colors hover:bg-white/[0.02]">
      <p className="text-sm text-slate-400">{label}</p>
      <p
        className={`mt-2 truncate font-semibold leading-snug tabular-nums ${sizeClass} ${toneClass}`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  )
}
