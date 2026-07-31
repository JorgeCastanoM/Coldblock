// USD and CAD both use the "$" symbol, so a bare "$X" is ambiguous once prices
// mix currencies (Fishbowl's USD exchange rate here is stuck at 1.0, so we show
// each price in its real source currency rather than guess a conversion).
export function formatCurrency(value, currency) {
  if (value == null) return '—'
  const amount = Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `$${amount} ${currency || 'CAD'}`
}

export function sumAmountsByCurrency(items, getAmount, getCurrency, defaultCurrency = 'CAD') {
  const totals = {}
  for (const item of items) {
    const amount = getAmount(item)
    if (amount == null) continue
    const currency = getCurrency(item) || defaultCurrency
    totals[currency] = (totals[currency] || 0) + amount
  }
  return totals
}

export function sumByCurrency(parts) {
  return sumAmountsByCurrency(
    parts,
    (part) => part.estimated_cost,
    (part) => part.last_currency,
    'CAD',
  )
}

export function formatMultiCurrency(byCurrency) {
  const entries = Object.entries(byCurrency).filter(([, amount]) => amount != null)
  if (entries.length === 0) return null
  return entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(' + ')
}

// For a StatCard-style tile: the primary currency's amount stays big and
// alone (never wraps across several lines the way a joined multi-currency
// string does), with any other currencies demoted to a small detail line —
// still fully shown, just not blended into the headline number.
export function splitPrimaryCurrency(byCurrency, primaryCurrency = 'USD') {
  const primaryAmount = byCurrency[primaryCurrency]
  const others = Object.fromEntries(Object.entries(byCurrency).filter(([currency]) => currency !== primaryCurrency))
  const otherLabel = formatMultiCurrency(others)
  return {
    primary: primaryAmount != null ? formatCurrency(primaryAmount, primaryCurrency) : null,
    detail: otherLabel ? `+ ${otherLabel}` : null,
  }
}

// Fishbowl timestamps often look like "2026-07-21T12:33:16.646-04" (hour-only
// offset). JS Date requires "-04:00", so pad before parsing. Requires a real
// "THH:MM:SS" time component before the offset — a bare date like "2026-07-01"
// ends in "-01" too and must not be mistaken for one (matches the backend fix
// in api/fishbowl.py's _SHORT_TZ_OFFSET).
const SHORT_TZ_OFFSET = /T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2})$/

export function parseFishbowlDate(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : value
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date
  }
  let text = String(value).trim()
  if (/^\d+$/.test(text)) return parseFishbowlDate(Number(text))
  if (SHORT_TZ_OFFSET.test(text)) text = `${text}:00`
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

// Monday-anchored week bucket, used to group weekly trend data consistently
// across the sales trajectory, lead-gen, and pipeline-movement charts.
export function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function toDateKey(date) {
  // Local-date key (not toISOString, which shifts to UTC and can roll the day back).
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function weekKey(date) {
  return toDateKey(startOfWeek(date))
}

export function formatWeekLabel(weekKeyStr) {
  const date = new Date(`${weekKeyStr}T00:00:00`)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Last `count` week-start keys, oldest first, ending with the week containing
// `today` — lets callers zero-fill weeks with no activity instead of omitting them.
export function lastNWeekKeys(count, today = new Date()) {
  const currentWeekStart = startOfWeek(today)
  const keys = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() - i * 7)
    keys.push(toDateKey(d))
  }
  return keys
}
