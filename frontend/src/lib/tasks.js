import { parseFishbowlDate } from './format.js'

export const STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  waiting: 'Waiting',
  deferred: 'Deferred',
  completed: 'Completed',
}

export const SOURCE_LABELS = {
  hubspot: 'HubSpot',
  planner: 'Planner',
}

export const SOURCE_KEYS = ['hubspot', 'planner']

// One colour per system on every row, card and filter chip, so where a task
// lives — and so where to go to update it — reads at a glance. Each product's
// own brand hue: HubSpot orange, Planner green.
export const SOURCE_STYLES = {
  hubspot: {
    dot: 'bg-orange-500',
    chip: 'bg-orange-500/10 text-orange-700 ring-orange-500/30 dark:text-orange-300',
  },
  planner: {
    dot: 'bg-green-600 dark:bg-green-500',
    chip: 'bg-green-600/10 text-green-700 ring-green-600/30 dark:text-green-300',
  },
}

export function matchesSource(task, source) {
  return source === 'all' || task.source === source
}

export function countBySource(tasks) {
  const counts = { hubspot: 0, planner: 0 }
  for (const task of tasks) {
    if (task.source in counts) counts[task.source] += 1
  }
  return counts
}

export const PRIORITY_LABELS = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: null,
  urgent: 'Urgent',
  important: 'Important',
  medium: 'Medium',
  low: 'Low',
}

export function priorityLabel(priority) {
  if (!priority) return null
  const mapped = PRIORITY_LABELS[priority] ?? PRIORITY_LABELS[String(priority).toUpperCase()]
  if (mapped === null) return null
  return mapped ?? String(priority)
}

export const UNASSIGNED_KEY = 'unassigned'

export const BUCKET_META = {
  overdue: { title: 'Overdue', blurb: 'Past their due date and still open' },
  due_next_week: { title: 'Due next 7 days', blurb: 'Open and coming up — includes anything due today' },
  done: { title: 'Done', blurb: 'Completed recently' },
  no_due_date: {
    title: 'No due date',
    blurb: "Open tasks with no due date — they can't be overdue or upcoming, so they'd otherwise be invisible",
  },
}

export const BUCKET_TABS = [
  { key: 'overdue', title: 'Overdue', short: 'Overdue', tone: 'bad' },
  { key: 'due_next_week', title: 'Due next 7 days', short: 'Next 7 days', tone: 'warn' },
  { key: 'done', title: 'Done recently', short: 'Done', tone: 'default' },
  { key: 'no_due_date', title: 'No due date', short: 'No due date', tone: 'warn', optional: true },
]

export const AGING_BANDS = [
  { key: 'overdue_1_30', label: '1–30d', short: '1–30d', tone: 'default' },
  { key: 'overdue_31_90', label: '31–90d', short: '31–90d', tone: 'warn' },
  { key: 'overdue_90', label: '90d+', short: '90d+', tone: 'bad' },
]

/** Whole days a task is past due. Negative means it's still upcoming. */
export function daysOverdue(task, now = new Date()) {
  const due = parseFishbowlDate(task.due_date)
  if (!due) return null
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  return Math.round((startOfToday - dueDay) / (24 * 60 * 60 * 1000))
}

// Thresholds are deliberately wide. Most of this portal's open tasks are
// months past due, so a 7/30 split would paint nearly every row red and the
// colour would stop meaning anything.
export function overdueSeverity(task, now = new Date()) {
  if (task.is_done) return null
  const days = daysOverdue(task, now)
  if (days == null || days <= 0) return null
  if (days > 90) return 'bad'
  if (days >= 31) return 'warn'
  return null
}

/** 1–30 / 31–90 / 90+ for still-open overdue tasks. 90d+ is strictly over 90. */
export function overdueAgingKey(task, now = new Date()) {
  if (task.is_done) return null
  const days = daysOverdue(task, now)
  if (days == null || days <= 0) return null
  if (days > 90) return 'overdue_90'
  if (days >= 31) return 'overdue_31_90'
  return 'overdue_1_30'
}

export function countAging(tasks, now = new Date()) {
  const counts = { overdue_1_30: 0, overdue_31_90: 0, overdue_90: 0 }
  for (const task of tasks) {
    const key = overdueAgingKey(task, now)
    if (key) counts[key] += 1
  }
  return counts
}

function compactDealAmount(amount, currency = 'USD') {
  if (amount == null || Number.isNaN(Number(amount))) return null
  const value = Number(amount)
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M ${currency}`
  if (value >= 1_000) return `$${Math.round(value / 1000)}K ${currency}`
  return `$${Math.round(value)} ${currency}`
}

export function relatedParts(task) {
  const parts = []
  if (task.plan?.name) parts.push(task.plan.name)
  if (task.company?.name) parts.push(task.company.name)
  if (task.contact?.name) parts.push(task.contact.name)
  if (task.deal?.name) {
    const money = compactDealAmount(task.deal.amount, task.deal.currency)
    parts.push(money ? `${task.deal.name} · ${money}` : task.deal.name)
  }
  return parts
}

export function personLabel(person) {
  if (!person) return null
  return person.name || person.email || `Unknown user (${person.id})`
}

export function assigneeLabel(task) {
  const people = task.assigned_to ?? []
  if (people.length === 0) return 'Unassigned'
  const [first, ...rest] = people
  return rest.length > 0 ? `${personLabel(first)} +${rest.length}` : personLabel(first)
}

/**
 * Scope key for the person dropdown. The backend sets `key` so one person with
 * different emails in HubSpot and Planner lands on one row; the email/id
 * fallback only matters for payloads without it.
 */
export function personScopeKey(person) {
  return person.key || (person.email || '').trim().toLowerCase() || `id:${person.id}`
}

export function taskPersonKeys(task) {
  return (task.assigned_to ?? []).map(personScopeKey)
}

export function matchesScope(task, scope) {
  if (scope === 'all') return true
  if (scope === UNASSIGNED_KEY) return (task.assigned_to ?? []).length === 0
  return taskPersonKeys(task).includes(scope)
}

export function matchesTaskQuery(task, query) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = `${task.name ?? ''} ${task.description ?? ''} ${assigneeLabel(task)} ${relatedParts(task).join(' ')}`.toLowerCase()
  return haystack.includes(needle)
}

export function scopeName(scope, peopleBoard) {
  if (scope === 'all') return 'Overall team'
  if (scope === UNASSIGNED_KEY) return 'Unassigned'
  return peopleBoard.find((row) => row.key === scope)?.name ?? scope
}

function emptyPersonRow(key, name, email) {
  return {
    key,
    name,
    email,
    overdue: 0,
    due_next_week: 0,
    done: 0,
    no_due_date: 0,
    overdue_1_30: 0,
    overdue_31_90: 0,
    overdue_90: 0,
  }
}

/** One scoreboard row per assignee from the buckets the meeting actually walks. */
export function buildPeopleBoard(bucketMap) {
  const byKey = new Map()

  const bump = (key, name, email, bucket) => {
    let row = byKey.get(key)
    if (!row) {
      row = emptyPersonRow(key, name, email)
      byKey.set(key, row)
    }
    row[bucket] += 1
  }

  for (const [bucket, tasks] of Object.entries(bucketMap)) {
    for (const task of tasks ?? []) {
      const people = task.assigned_to ?? []
      const aging = bucket === 'overdue' ? overdueAgingKey(task) : null
      if (people.length === 0) {
        bump(UNASSIGNED_KEY, 'Unassigned', null, bucket)
        if (aging) bump(UNASSIGNED_KEY, 'Unassigned', null, aging)
        continue
      }
      for (const person of people) {
        const name = personLabel(person) ?? personScopeKey(person)
        bump(personScopeKey(person), name, person.email ?? null, bucket)
        if (aging) bump(personScopeKey(person), name, person.email ?? null, aging)
      }
    }
  }

  return [...byKey.values()]
}

export function sortPeopleBoard(rows, bucket) {
  const primary = bucket === 'overdue' ? 'overdue_90' : bucket
  return rows.slice().sort((a, b) => {
    const aUn = a.key === UNASSIGNED_KEY
    const bUn = b.key === UNASSIGNED_KEY
    if (aUn !== bUn) return aUn ? 1 : -1
    const delta = (b[primary] ?? 0) - (a[primary] ?? 0)
    if (delta) return delta
    const overdueDelta = (b.overdue ?? 0) - (a.overdue ?? 0)
    if (bucket === 'overdue' && overdueDelta) return overdueDelta
    return String(a.name).localeCompare(String(b.name))
  })
}

export const TASK_SORT_OPTIONS = [
  { value: 'due_asc', label: 'Due date (oldest first)' },
  { value: 'due_desc', label: 'Due date (newest first)' },
  { value: 'name_asc', label: 'Name (A → Z)' },
  { value: 'assignee_asc', label: 'Assignee (A → Z)' },
]

export function compareTasks(a, b, sort) {
  const dueA = parseFishbowlDate(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY
  const dueB = parseFishbowlDate(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY
  switch (sort) {
    case 'due_desc':
      return dueB - dueA
    case 'name_asc':
      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    case 'assignee_asc':
      return assigneeLabel(a).localeCompare(assigneeLabel(b))
    case 'due_asc':
    default:
      return dueA - dueB
  }
}
