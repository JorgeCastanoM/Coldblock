// The CEO report: per person, three sections (Completed / Overdue / This week &
// next 7 days) with the same five columns. Pure functions only — the screen and
// the PDF both render from this model, so they can never disagree.

import { importanceOf, importanceRank } from './taskImportance.js'
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  UNASSIGNED_KEY,
  assigneeLabel,
  creatorOf,
  dueNote,
  formatTaskDate,
  isAutomated,
  matchesScope,
  matchesSource,
  personLabel,
  personScopeKey,
  relatedParts,
} from './tasks.js'
import { parseFishbowlDate } from './format.js'

export const TEAM_KEY = 'team'

// Order follows the layout the report was specified with.
export const REPORT_SECTIONS = [
  { key: 'done', title: 'Completed', dateHeader: 'Completed', accent: 'emerald' },
  { key: 'overdue', title: 'Overdue', dateHeader: 'Due', accent: 'red' },
  // Today through six days out — the rest of this week plus the start of the
  // next, so the name says both rather than implying a calendar week.
  { key: 'due_next_week', title: 'This week & next 7 days', dateHeader: 'Due', accent: 'sky' },
]

export const REPORT_SORTS = [
  { value: 'importance', label: 'Importance, then date' },
  { value: 'date', label: 'Date only' },
]

// The report reads as a weekly review by default: what got done and what fell
// overdue since this day last week. Longer periods stay within what the task
// endpoint loads (completed: 30 days, overdue: 90 days).
export const REPORT_PERIODS = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
]
export const DEFAULT_PERIOD_DAYS = 7

function localMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/**
 * Local-day bounds for a period ending today. `start` is midnight `days` days
 * ago, so a 7-day period on Tuesday Sep 22 runs from Tuesday Sep 15:
 * completed Sep 15 – Sep 22 (today included), overdue = due Sep 15 – Sep 21.
 */
export function periodBounds(days = DEFAULT_PERIOD_DAYS, now = new Date()) {
  const today = localMidnight(now)
  return { days, start: addDays(today, -days), today, nextWeekEnd: addDays(today, 6) }
}

function shortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function span(from, to) {
  return `${shortDate(from)} – ${shortDate(to)}`
}

/** Date span each section covers, e.g. {done: 'Sep 15 – Sep 22', …}, plus `start`. */
export function periodCaptions(bounds) {
  return {
    start: shortDate(bounds.start),
    done: span(bounds.start, bounds.today),
    overdue: span(bounds.start, addDays(bounds.today, -1)),
    due_next_week: span(bounds.today, bounds.nextWeekEnd),
  }
}

export function sectionBlurb(key, bounds) {
  const captions = periodCaptions(bounds)
  if (key === 'done') return `Completed ${captions.done}`
  if (key === 'overdue') return `Due ${captions.overdue} and still open`
  return `Due ${captions.due_next_week}, today included, and still open`
}

export function emptySectionText(key) {
  if (key === 'done') return 'Nothing completed in this period.'
  if (key === 'overdue') return 'Nothing fell overdue in this period.'
  return 'Nothing due this week or in the next 7 days.'
}

/** Whether a task in the done/overdue bucket falls inside the period. */
function inPeriod(task, bucket, bounds) {
  if (bucket === 'due_next_week') return true
  const value = bucket === 'done' ? task.completed_date || task.due_date : task.due_date
  const date = parseFishbowlDate(value)
  return Boolean(date) && date.getTime() >= bounds.start.getTime()
}

function dateOf(task, bucket) {
  const value = bucket === 'done' ? task.completed_date || task.due_date : task.due_date
  return parseFishbowlDate(value)?.getTime() ?? null
}

// Completed reads newest first; open work reads oldest (most urgent) first.
function compareByDate(a, b, bucket) {
  const dateA = dateOf(a, bucket)
  const dateB = dateOf(b, bucket)
  if (dateA == null && dateB == null) return 0
  if (dateA == null) return 1
  if (dateB == null) return -1
  return bucket === 'done' ? dateB - dateA : dateA - dateB
}

function sortTasks(tasks, bucket, sort) {
  return tasks.slice().sort((a, b) => {
    if (sort === 'importance') {
      const delta = importanceRank(b) - importanceRank(a)
      if (delta) return delta
    }
    return compareByDate(a, b, bucket) || String(a.name ?? '').localeCompare(String(b.name ?? ''))
  })
}

/** One display row — everything both renderers need, already formatted. */
export function reportRow(task, bucket, personKey, now = new Date()) {
  const date = bucket === 'done' ? task.completed_date || task.due_date : task.due_date
  return {
    id: task.task_id,
    name: task.name || 'Untitled task',
    description: task.description || null,
    context: relatedParts(task).join(' · '),
    status: STATUS_LABELS[task.status] ?? task.status ?? null,
    assignee: assigneeLabel(task),
    importance: importanceOf(task),
    creator: creatorOf(task),
    // Co-assignees on shared Planner tasks — never the person the report is for.
    sharedWith: (task.assigned_to ?? [])
      .filter((person) => personScopeKey(person) !== personKey)
      .map((person) => personLabel(person)),
    dateLabel: formatTaskDate(date),
    note: bucket === 'done' ? null : dueNote(task, now),
    late: bucket === 'overdue',
    source: task.source,
    automated: isAutomated(task),
  }
}

function bucketsOf(report) {
  return {
    done: report?.buckets?.done ?? [],
    overdue: report?.buckets?.overdue ?? [],
    due_next_week: report?.buckets?.due_next_week ?? [],
    no_due_date: report?.no_due_date ?? [],
  }
}

/**
 * The report for one person (or UNASSIGNED_KEY).
 * `automated` counts workflow reminders in scope whether or not they're shown,
 * so the page can say how many the switch is hiding. `olderOverdue` counts
 * open tasks that fell overdue before the period — outside the weekly view,
 * but stated so the backlog isn't invisible.
 */
export function buildPersonReport(
  report,
  person,
  { source = 'all', includeAutomated = false, sort = 'importance', periodDays = DEFAULT_PERIOD_DAYS } = {},
  now = new Date(),
) {
  const buckets = bucketsOf(report)
  const bounds = periodBounds(periodDays, now)
  const inScope = (task) => matchesScope(task, person.key) && matchesSource(task, source)
  const shown = (task) => includeAutomated || !isAutomated(task)

  const sections = {}
  const counts = {}
  let automated = 0
  const openPriority = { urgent: 0, high: 0 }
  const olderOverdue = buckets.overdue.filter(
    (task) => inScope(task) && shown(task) && !inPeriod(task, 'overdue', bounds),
  ).length

  for (const { key } of REPORT_SECTIONS) {
    const scoped = buckets[key].filter((task) => inScope(task) && inPeriod(task, key, bounds))
    automated += scoped.filter(isAutomated).length
    const visible = sortTasks(scoped.filter(shown), key, sort)
    sections[key] = visible.map((task) => reportRow(task, key, person.key, now))
    counts[key] = visible.length
    if (key !== 'done') {
      for (const task of visible) {
        const level = importanceOf(task)
        if (level === 'urgent' || level === 'high') openPriority[level] += 1
      }
    }
  }

  return {
    person,
    sections,
    counts,
    total: counts.done + counts.overdue + counts.due_next_week,
    openPriority,
    automated,
    hiddenAutomated: includeAutomated ? 0 : automated,
    olderOverdue,
    // Open tasks with no due date fit none of the three sections — counted so
    // the omission is stated rather than silent.
    noDueDate: buckets.no_due_date.filter((task) => inScope(task) && shown(task)).length,
  }
}

/** Everyone on the roster, alphabetical, with Unassigned last when it has work. */
export function buildTeamReport(report, options = {}, now = new Date()) {
  const roster = (report?.people ?? [])
    .map((person) => ({
      key: person.key,
      name: personLabel({ ...person, id: person.key }),
      email: person.email,
      sources: person.sources ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const people = roster.map((person) => buildPersonReport(report, person, options, now))
  const unassigned = buildPersonReport(
    report,
    { key: UNASSIGNED_KEY, name: 'Unassigned', email: null, sources: [] },
    options,
    now,
  )
  if (unassigned.total > 0 || unassigned.automated > 0) people.push(unassigned)

  const totals = {
    done: 0,
    overdue: 0,
    due_next_week: 0,
    urgent: 0,
    high: 0,
    hiddenAutomated: 0,
    noDueDate: 0,
    olderOverdue: 0,
  }
  // Shared Planner tasks appear under each assignee, so these add up rows in
  // the packet rather than distinct tasks.
  for (const entry of people) {
    totals.done += entry.counts.done
    totals.overdue += entry.counts.overdue
    totals.due_next_week += entry.counts.due_next_week
    totals.urgent += entry.openPriority.urgent
    totals.high += entry.openPriority.high
    totals.hiddenAutomated += entry.hiddenAutomated
    totals.noDueDate += entry.noDueDate
    totals.olderOverdue += entry.olderOverdue
  }
  return { people, totals }
}

/**
 * The filters as plain sentences, shown under the page heading and printed on
 * every PDF so a forwarded report says exactly what it contains.
 */
export function describeFilters(
  report,
  { source = 'all', includeAutomated = false, sort = 'importance', periodDays = DEFAULT_PERIOD_DAYS },
  hiddenAutomated = 0,
  now = new Date(),
) {
  const captions = periodCaptions(periodBounds(periodDays, now))
  const period = REPORT_PERIODS.find((option) => option.value === periodDays)?.label ?? `Last ${periodDays} days`
  const parts = [
    `Period: ${period.toLowerCase()} (${captions.done})`,
    source === 'all' ? 'Source: HubSpot + Planner' : `Source: ${SOURCE_LABELS[source]} only`,
    includeAutomated
      ? 'Automated HubSpot reminders included'
      : `Automated HubSpot reminders excluded${hiddenAutomated ? ` (${hiddenAutomated})` : ''}`,
    `Sorted by ${REPORT_SORTS.find((option) => option.value === sort)?.label.toLowerCase() ?? 'importance'}`,
  ]
  const planner = report?.sources?.planner
  if (planner && planner.ok === false) {
    parts.push(planner.reason === 'disabled' ? 'Planner not connected' : `Planner unavailable: ${planner.reason}`)
  }
  return parts
}

export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}
