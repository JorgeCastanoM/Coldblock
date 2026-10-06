import { parseFishbowlDate } from './format.js'

// The Quarterly review mirrors the commercial manager's Q3/Q4 spreadsheet:
// open Active Sales Pipeline deals in the three late stages, optionally plus
// what has already closed won. All four live in that one pipeline (verified
// live — every 2026 deal in these stages is there), so the other pipelines'
// look-alike stages (e.g. Lab Activity's "Closed Won" for samples) stay out.
export const REVIEW_PIPELINE = 'Active Sales Pipeline'

export const REVIEW_STAGES = [
  { key: 'active_dialogue', label: 'Active Dialogue', stage: 'active dialogue', tone: 'violet' },
  {
    key: 'confirmed_interest',
    label: 'Confirmed Interest',
    stage: 'confirmed interest - expect po wi 60 days',
    tone: 'sky',
  },
  { key: 'in_purchasing', label: 'In Purchasing', stage: 'in purchasing - close in 30 days', tone: 'amber' },
  // Every won stage counts here, not just "Closed Won": deals move on to
  // Ready to ship / Shipped / … afterwards, and those are still this year's wins.
  { key: 'closed_won', label: 'Closed / Won', optional: true, tone: 'emerald' },
]

export const DEFAULT_STAGE_KEYS = REVIEW_STAGES.filter((stage) => !stage.optional).map((stage) => stage.key)

export const STAGE_TONES = {
  violet: {
    pill: 'bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300',
    bar: 'bg-violet-400',
  },
  sky: {
    pill: 'bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300',
    bar: 'bg-sky-400',
  },
  amber: {
    pill: 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300',
    bar: 'bg-amber-400',
  },
  emerald: {
    pill: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300',
    bar: 'bg-emerald-400',
  },
}

const STAGE_BY_LABEL = new Map(REVIEW_STAGES.filter((stage) => stage.stage).map((stage) => [stage.stage, stage]))
export const STAGE_BY_KEY = new Map(REVIEW_STAGES.map((stage) => [stage.key, stage]))

export function reviewStageKey(deal) {
  if (deal.pipeline !== REVIEW_PIPELINE) return null
  if (deal.is_won) return 'closed_won'
  return STAGE_BY_LABEL.get((deal.stage || '').toLowerCase())?.key ?? null
}

export const QUARTERS = [
  { key: 1, label: 'Q1', months: 'Jan – Mar' },
  { key: 2, label: 'Q2', months: 'Apr – Jun' },
  { key: 3, label: 'Q3', months: 'Jul – Sep' },
  { key: 4, label: 'Q4', months: 'Oct – Dec' },
]

export function quarterOf(date) {
  return Math.floor(date.getMonth() / 3) + 1
}

// HubSpot's "Close date" is the rep's expected close for an open deal and
// the actual close for a won one — the same field the spreadsheet's
// Date/Delivery column tracked by hand.
export function closeDateOf(deal) {
  return parseFishbowlDate(deal.close_date)
}

export function isPastDue(deal, now = new Date()) {
  if (deal.is_closed) return false
  const close = closeDateOf(deal)
  if (!close) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return close < today
}

// --- Notes -----------------------------------------------------------------
// Notes live in this browser only (no database by design, and the HubSpot
// token is read-only for deals). Each write re-reads storage and changes one
// key, so two open tabs can't overwrite each other's notes with a stale copy.

const NOTES_KEY = 'coldblock_quarterly_notes'

export function loadNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveNote(dealId, text) {
  const notes = loadNotes()
  if (text.trim() === '') {
    delete notes[dealId]
  } else {
    notes[dealId] = { text, updated_at: new Date().toISOString() }
  }
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
    return { notes, saved: true }
  } catch {
    return { notes, saved: false }
  }
}

// --- CSV export ------------------------------------------------------------

function csvCell(value) {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Local calendar date — toISOString would shift late-evening closes to the next day.
function localDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function buildReviewCsv(rows, notes) {
  const header = [
    'Quarter',
    'Account',
    'Company',
    'Unit',
    'Close date',
    'Transaction',
    'Approx $',
    'Currency',
    'Channel',
    'Country',
    'Application',
    'Stage',
    'Owner',
    'HubSpot next step',
    'Notes',
  ]
  const lines = rows.map(({ deal, group }) => {
    const close = closeDateOf(deal)
    return [
      group,
      deal.name,
      deal.company,
      (deal.expected_products ?? []).join(', '),
      close ? localDateKey(close) : '',
      deal.purchase_type,
      deal.amount,
      deal.currency,
      deal.deal_type,
      deal.country,
      (deal.sectors ?? []).join(', '),
      deal.stage,
      deal.owner?.name ?? deal.owner?.email ?? '',
      deal.next_step,
      notes[deal.deal_id]?.text ?? '',
    ]
  })
  // Leading BOM so Excel opens accented names (Perú, Québec) as UTF-8.
  return `\uFEFF${[header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n')}`
}
