export default function StatCard({ label, value, tone = 'default' }) {
  const toneClass = tone === 'warn' ? 'text-amber-400' : tone === 'bad' ? 'text-red-400' : 'text-slate-100'

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}
