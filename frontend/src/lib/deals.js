import { parseFishbowlDate } from './format.js'

// Revenue reporting (Total Won Revenue, Sales per Year, Avg Deal Size, Top
// Customers, Team Performance) is scoped to deals that have reached one of
// these stages — every kind of sale (including trials/demos) counts once
// it's confirmed here, per how this business actually recognizes an order.
// Win Rate is a separate, broader pipeline-conversion metric and is
// unaffected by this list.
export const REVENUE_STAGES = new Set(
  [
    'Ready to ship',
    'Shipped',
    'Customer Received',
    'Installation/Technical Follow up',
    '2 week follow up',
    'Monthly Followup',
    'Completed',
  ].map((stage) => stage.toLowerCase()),
)

export function isRevenueStage(deal) {
  return REVENUE_STAGES.has((deal.stage || '').toLowerCase())
}

// How long a deal has sat in its *current* stage. stage_history is
// chronological (oldest first), so the last entry's changed_at is when the
// deal entered whatever stage it's in now. A deal that has never changed
// stage has no history entries — fall back to when it was created.
export function daysInCurrentStage(deal, now = new Date()) {
  const history = deal.stage_history ?? []
  const since = history.length > 0 ? parseFishbowlDate(history[history.length - 1].changed_at) : parseFishbowlDate(deal.create_date)
  if (!since) return null
  return Math.max(0, Math.floor((now - since) / (24 * 60 * 60 * 1000)))
}

// Two stages state their own expected turnaround right in the label
// ("expect PO wi 60 days", "close in 30 days") — use those as the threshold.
// Everything else, including "Active Dialogue", gets a generic default with
// the same warn/bad (1x/2x) shape.
const STAGE_AGING_THRESHOLDS = new Map(
  [
    ['confirmed interest - expect po wi 60 days', { warnAt: 60, badAt: 120 }],
    ['in purchasing - close in 30 days', { warnAt: 30, badAt: 60 }],
  ].map(([stage, threshold]) => [stage, threshold]),
)
const DEFAULT_STAGE_AGING_THRESHOLD = { warnAt: 30, badAt: 60 }

export function stageAgingThreshold(stageLabel) {
  return STAGE_AGING_THRESHOLDS.get((stageLabel || '').toLowerCase()) ?? DEFAULT_STAGE_AGING_THRESHOLD
}

// A deal that's already closed isn't "stalled" — it's settled, however long
// it took to get there.
export function stageAgingSeverity(deal, now = new Date()) {
  if (deal.is_closed) return null
  const days = daysInCurrentStage(deal, now)
  if (days == null) return null
  const { warnAt, badAt } = stageAgingThreshold(deal.stage)
  if (days >= badAt) return 'bad'
  if (days >= warnAt) return 'warn'
  return null
}
