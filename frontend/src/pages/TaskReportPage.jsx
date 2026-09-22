import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import ImportanceIcon from '../components/ImportanceIcon.jsx'
import TaskReportSection from '../components/TaskReportSection.jsx'
import TaskSourceFilter from '../components/TaskSourceFilter.jsx'
import TasksSubNav from '../components/TasksSubNav.jsx'
import { useTasksData } from '../context/TasksDataContext.jsx'
import {
  DEFAULT_PERIOD_DAYS,
  REPORT_PERIODS,
  REPORT_SECTIONS,
  REPORT_SORTS,
  TEAM_KEY,
  buildTeamReport,
  describeFilters,
  emptySectionText,
  initials,
  periodBounds,
  periodCaptions,
  sectionBlurb,
} from '../lib/taskReport.js'
import { UNASSIGNED_KEY } from '../lib/tasks.js'

const controlClass =
  'rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-sky-500 focus:outline-none'

const fieldLabel = 'text-xs font-medium uppercase tracking-wide text-ink-subtle'

// People with anything to report in the period, or an older backlog to flag.
function hasActivity(entry) {
  return entry.total > 0 || entry.noDueDate > 0 || entry.olderOverdue > 0
}

function ReportSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-20 rounded-xl border border-surface-border bg-surface-raised" />
      <div className="h-36 rounded-xl border border-surface-border bg-surface-raised" />
      <div className="h-72 rounded-xl border border-surface-border bg-surface-raised" />
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="shrink-0">
      <path
        d="M8 2.5v7.25M4.75 6.75 8 10l3.25-3.25M3 12.75h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AutomatedSwitch({ checked, count, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={fieldLabel}>Automated</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        title="HubSpot workflow reminders, e.g. “Qualified Opportunity : Task Reminders”"
        className="inline-flex items-center gap-2.5 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink transition hover:bg-ink/[0.03]"
      >
        <span
          className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${
            checked ? 'bg-sky-600' : 'bg-ink/20'
          }`}
          aria-hidden="true"
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
              checked ? 'left-3.5' : 'left-0.5'
            }`}
          />
        </span>
        Workflow reminders
        <span className="tabular-nums text-ink-subtle">{count}</span>
      </button>
    </div>
  )
}

function PriorityLine({ openPriority, compact = false }) {
  const parts = ['urgent', 'high'].filter((level) => openPriority[level] > 0)
  if (parts.length === 0) {
    return <span className="text-ink-subtle">{compact ? '—' : 'No urgent or high-importance open tasks'}</span>
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {parts.map((level) => (
        <span key={level} className="inline-flex items-center gap-1.5">
          <ImportanceIcon level={level} showLabel={false} size={14} />
          <span className="font-medium tabular-nums text-ink">{openPriority[level]}</span>
          <span className="text-ink-muted">{level} open</span>
        </span>
      ))}
    </span>
  )
}

function PersonHeader({ entry, captions, onBack }) {
  const { person, openPriority, hiddenAutomated, noDueDate, olderOverdue } = entry
  const unassigned = person.key === UNASSIGNED_KEY
  return (
    <section className="mb-5 rounded-xl border border-surface-border bg-surface-raised p-4 shadow-panel sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold ${
              unassigned
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
            }`}
            aria-hidden="true"
          >
            {unassigned ? '—' : initials(person.name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight text-ink">{person.name}</h2>
            {person.email && <p className="mt-1 truncate text-sm text-ink-muted">{person.email}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-surface-border px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-ink/[0.03] hover:text-ink"
        >
          Whole team
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
        <PriorityLine openPriority={openPriority} />
        <p className="text-xs text-ink-subtle">
          {[
            olderOverdue > 0 ? `${olderOverdue} overdue from before ${captions.start}` : null,
            hiddenAutomated > 0 ? `${hiddenAutomated} workflow reminders hidden` : null,
            noDueDate > 0 ? `${noDueDate} open with no due date — see Team board` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </section>
  )
}

function StatCell({ label, value, className = 'text-ink' }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface/70 px-2 py-2">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${className}`}>{value}</p>
    </div>
  )
}

function Avatar({ person, className = 'h-8 w-8 text-[11px]' }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-sky-500/10 font-semibold text-sky-700 dark:text-sky-300 ${className}`}
      aria-hidden="true"
    >
      {person.key === UNASSIGNED_KEY ? '—' : initials(person.name)}
    </span>
  )
}

/** Phone layout of the team table: one tappable card per person. */
function TeamSummaryCards({ rows, totals, onSelect }) {
  return (
    <ul className="md:hidden">
      {rows.map((entry) => (
        <li key={entry.person.key} className="border-t border-surface-border/60 first:border-t-0">
          <button
            type="button"
            onClick={() => onSelect(entry.person.key)}
            className="w-full px-4 py-3.5 text-left transition-colors active:bg-sky-500/10"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar person={entry.person} />
                <span className="truncate text-sm font-medium text-ink">{entry.person.name}</span>
              </div>
              <span className="shrink-0 text-xs font-medium text-sky-700 dark:text-sky-300">Open →</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              <StatCell label="Done" value={entry.counts.done} className="text-emerald-700 dark:text-emerald-400" />
              <StatCell
                label="Overdue"
                value={entry.counts.overdue}
                className={entry.counts.overdue ? 'text-red-700 dark:text-red-400' : 'text-ink-subtle'}
              />
              <StatCell label="Next 7d" value={entry.counts.due_next_week} />
              <StatCell label="Older" value={entry.olderOverdue} className="text-ink-subtle" />
            </div>
            <div className="mt-2 text-xs">
              <PriorityLine openPriority={entry.openPriority} compact />
            </div>
          </button>
        </li>
      ))}
      <li className="border-t border-surface-border bg-surface/70 px-4 py-3 text-xs text-ink-muted">
        <span className="font-semibold text-ink">Total</span> · {totals.done} done · {totals.overdue} overdue ·{' '}
        {totals.due_next_week} this week &amp; next 7 days · {totals.olderOverdue} older overdue · {totals.urgent} urgent ·{' '}
        {totals.high} high open
      </li>
    </ul>
  )
}

function TeamSummary({ team, captions, onSelect }) {
  const rows = team.people.filter(hasActivity)
  const numberCell = 'px-4 py-3 text-right tabular-nums'
  return (
    <section className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-panel">
      <header className="border-b border-surface-border px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink">Whole team</h2>
        <p className="mt-0.5 text-xs text-ink-subtle">
          Completed {captions.done} · overdue = due {captions.overdue} · this week &amp; next 7 days = due {captions.due_next_week}.
          Pick a person to open their report; the PDF of this view starts each person on a new page.
        </p>
      </header>
      <TeamSummaryCards rows={rows} totals={team.totals} onSelect={onSelect} />
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] table-fixed text-left">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
            <col className="w-[23%]" />
          </colgroup>
          <thead className="bg-surface/70">
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              <th scope="col" className="px-5 py-2.5 font-semibold">
                Person
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                Completed
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                Overdue
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                This week &amp; next 7 days
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold" title={`Still open, due before ${captions.start}`}>
                Older overdue
              </th>
              <th scope="col" className="px-5 py-2.5 font-semibold">
                Urgent / high open
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr
                key={entry.person.key}
                onClick={() => onSelect(entry.person.key)}
                className="cursor-pointer border-t border-surface-border/60 transition-colors first:border-t-0 hover:bg-ink/[0.03]"
              >
                <td className="px-5 py-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(entry.person.key)
                    }}
                    className="flex min-w-0 items-center gap-3 text-left focus:outline-none focus-visible:underline"
                  >
                    <Avatar person={entry.person} />
                    <span className="truncate text-sm font-medium text-ink">{entry.person.name}</span>
                  </button>
                </td>
                <td className={`${numberCell} text-emerald-700 dark:text-emerald-400`}>{entry.counts.done}</td>
                <td className={`${numberCell} ${entry.counts.overdue ? 'font-semibold text-red-700 dark:text-red-400' : 'text-ink-subtle'}`}>
                  {entry.counts.overdue}
                </td>
                <td className={`${numberCell} text-ink`}>{entry.counts.due_next_week}</td>
                <td className={`${numberCell} text-ink-subtle`}>{entry.olderOverdue}</td>
                <td className="px-5 py-3 text-sm">
                  <PriorityLine openPriority={entry.openPriority} compact />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-surface-border bg-surface/70 text-sm font-semibold text-ink">
            <tr>
              <td className="px-5 py-3">Total</td>
              <td className={numberCell}>{team.totals.done}</td>
              <td className={numberCell}>{team.totals.overdue}</td>
              <td className={numberCell}>{team.totals.due_next_week}</td>
              <td className={`${numberCell} text-ink-muted`}>{team.totals.olderOverdue}</td>
              <td className="px-5 py-3 text-xs font-normal text-ink-muted">
                {team.totals.urgent} urgent · {team.totals.high} high open
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

export default function TaskReportPage() {
  const { report, error, loading, refresh } = useTasksData()
  const [personKey, setPersonKey] = useState(TEAM_KEY)
  const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DAYS)
  const [source, setSource] = useState('all')
  const [includeAutomated, setIncludeAutomated] = useState(false)
  const [sort, setSort] = useState('importance')
  const [pdf, setPdf] = useState({ busy: false, error: null })

  const sources = report?.sources ?? {}
  const plannerConnected = sources.planner?.ok === true
  const hubspotFailed = sources.hubspot && sources.hubspot.ok === false

  // One team report per source: the current one drives the page, the others
  // only feed the counts on the source chips.
  // Recomputed with the report so "today" moves when the data is refreshed.
  const bounds = useMemo(() => periodBounds(periodDays), [periodDays, report])
  const captions = periodCaptions(bounds)

  const bySource = useMemo(() => {
    if (!report) return null
    const options = { includeAutomated, sort, periodDays }
    return {
      all: buildTeamReport(report, { ...options, source: 'all' }),
      hubspot: buildTeamReport(report, { ...options, source: 'hubspot' }),
      planner: buildTeamReport(report, { ...options, source: 'planner' }),
    }
  }, [report, includeAutomated, sort, periodDays])

  const team = bySource?.[source] ?? null
  const selected = personKey === TEAM_KEY ? null : (team?.people.find((entry) => entry.person.key === personKey) ?? null)
  const inView = (teamReport) =>
    selected
      ? (teamReport.people.find((entry) => entry.person.key === personKey) ?? { total: 0, automated: 0 })
      : { total: teamReport.totals.done + teamReport.totals.overdue + teamReport.totals.due_next_week, automated: teamReport.people.reduce((sum, entry) => sum + entry.automated, 0) }

  const sourceCounts = bySource
    ? { all: inView(bySource.all).total, hubspot: inView(bySource.hubspot).total, planner: inView(bySource.planner).total }
    : { all: 0, hubspot: 0, planner: 0 }
  const automatedInView = team ? inView(team).automated : 0
  const hiddenAutomated = includeAutomated ? 0 : automatedInView
  const filterLine = report ? describeFilters(report, { source, includeAutomated, sort, periodDays }, hiddenAutomated) : []

  // Unknown key (e.g. the person vanished after a refresh) falls back to the team.
  const view = selected ? 'person' : 'team'

  async function handleDownload() {
    if (!team) return
    setPdf({ busy: true, error: null })
    try {
      const { downloadTaskReportPdf } = await import('../lib/taskReportPdf.js')
      await downloadTaskReportPdf({
        mode: view,
        people: selected ? [selected] : team.people.filter(hasActivity),
        totals: team.totals,
        filters: filterLine,
        captions,
        blurbs: Object.fromEntries(REPORT_SECTIONS.map((section) => [section.key, sectionBlurb(section.key, bounds)])),
        generatedAt: new Date(),
      })
      setPdf({ busy: false, error: null })
    } catch (err) {
      console.error(err)
      setPdf({ busy: false, error: 'The PDF could not be created. Try again, or refresh the data first.' })
    }
  }

  const personOptions = team?.people ?? []

  return (
    <div className="min-h-screen px-6 pb-10">
      <AppHeader title="Task Report" onRefresh={refresh} loading={loading} />

      <div className="mx-auto max-w-6xl">
        <TasksSubNav />

        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {hubspotFailed && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            HubSpot tasks failed to load: {sources.hubspot.reason}
          </div>
        )}

        {loading && !report ? (
          <ReportSkeleton />
        ) : !team ? null : (
          <>
            {/* One column on phones, two on small tablets, a single wrapping row from lg up. */}
            <div className="mb-3 grid grid-cols-1 gap-3 rounded-xl border border-surface-border bg-surface-raised p-4 shadow-panel sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
              <label className="flex flex-col gap-1.5 sm:col-span-2 lg:min-w-56">
                <span className={fieldLabel}>Person</span>
                <select value={view === 'team' ? TEAM_KEY : personKey} onChange={(event) => setPersonKey(event.target.value)} className={controlClass}>
                  <option value={TEAM_KEY}>Whole team</option>
                  {personOptions.map((entry) => (
                    <option key={entry.person.key} value={entry.person.key}>
                      {entry.person.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 lg:min-w-44">
                <span className={fieldLabel}>Period</span>
                <select
                  value={periodDays}
                  onChange={(event) => setPeriodDays(Number(event.target.value))}
                  className={controlClass}
                >
                  {REPORT_PERIODS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 lg:min-w-44">
                <span className={fieldLabel}>Sort</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)} className={controlClass}>
                  {REPORT_SORTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {plannerConnected && (
                <div className="sm:col-span-2 lg:col-span-1">
                  <TaskSourceFilter value={source} onChange={setSource} counts={sourceCounts} />
                </div>
              )}

              <AutomatedSwitch checked={includeAutomated} count={automatedInView} onChange={setIncludeAutomated} />

              <div className="flex flex-col gap-1.5 lg:ml-auto lg:items-end">
                <span className={fieldLabel}>{view === 'team' ? 'Whole-team PDF' : 'PDF'}</span>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={pdf.busy || loading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DownloadIcon />
                  {pdf.busy ? 'Preparing PDF…' : 'Download PDF'}
                </button>
              </div>
            </div>

            <p className="mb-5 px-1 text-xs text-ink-subtle">{filterLine.join(' · ')}</p>

            {pdf.error && (
              <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                {pdf.error}
              </div>
            )}

            {view === 'team' ? (
              <TeamSummary team={team} captions={captions} onSelect={setPersonKey} />
            ) : (
              <>
                <PersonHeader entry={selected} captions={captions} onBack={() => setPersonKey(TEAM_KEY)} />
                <div className="space-y-5">
                  {REPORT_SECTIONS.map((section) => (
                    <TaskReportSection
                      key={`${personKey}-${section.key}`}
                      section={section}
                      blurb={sectionBlurb(section.key, bounds)}
                      rows={selected.sections[section.key]}
                      emptyText={emptySectionText(section.key)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
