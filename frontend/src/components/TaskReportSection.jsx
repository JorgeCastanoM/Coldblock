import { useState } from 'react'
import { IMPORTANCE_LEVELS } from '../lib/taskImportance.js'
import { SOURCE_LABELS } from '../lib/tasks.js'
import ImportanceIcon from './ImportanceIcon.jsx'
import TaskSourceBadge from './TaskSourceBadge.jsx'

// A few hundred rows is possible (a busy rep with reminders included); show a
// readable first page and let the reader open the rest. The PDF prints all.
const FIRST_PAGE = 25

const ACCENTS = {
  emerald: { bar: 'bg-emerald-500', count: 'text-emerald-700 dark:text-emerald-400' },
  red: { bar: 'bg-red-500', count: 'text-red-700 dark:text-red-400' },
  sky: { bar: 'bg-sky-500', count: 'text-sky-700 dark:text-sky-400' },
}

function CreatorCell({ row }) {
  const { creator, sharedWith } = row
  return (
    <div className="min-w-0">
      {!creator ? (
        <p className="text-sm text-ink-subtle">—</p>
      ) : creator.kind === 'person' ? (
        <p className="truncate text-sm text-ink" title={creator.label}>
          {creator.label}
        </p>
      ) : (
        <div className="min-w-0">
          <span className="inline-flex items-center rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-500/25 dark:text-violet-300">
            {creator.label}
          </span>
          {creator.detail && (
            <p className="mt-0.5 truncate text-xs text-ink-subtle" title={creator.detail}>
              {creator.detail}
            </p>
          )}
        </div>
      )}
      {sharedWith.length > 0 && (
        <p className="mt-0.5 truncate text-xs text-ink-subtle" title={`Shared with ${sharedWith.join(', ')}`}>
          Shared with {sharedWith.join(', ')}
        </p>
      )}
    </div>
  )
}

function DetailField({ label, children }) {
  if (!children) return null
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</p>
      <div className="mt-0.5 text-sm text-ink">{children}</div>
    </div>
  )
}

function TaskDetail({ row, dateHeader }) {
  const importance = IMPORTANCE_LEVELS[row.importance]
  return (
    <div className="grid gap-4 border-t border-surface-border/60 bg-sky-500/[0.04] px-4 py-4 sm:grid-cols-2 sm:px-5">
      <div className="space-y-3 sm:col-span-2">
        <DetailField label="Task">
          <p className="whitespace-pre-wrap font-medium">{row.name}</p>
        </DetailField>
        <DetailField label="Description">
          {row.description ? (
            <p className="whitespace-pre-wrap text-ink-muted">{row.description}</p>
          ) : (
            <p className="text-ink-subtle">No description</p>
          )}
        </DetailField>
        {row.context && (
          <DetailField label="Company / contact / deal">
            <p className="whitespace-pre-wrap">{row.context}</p>
          </DetailField>
        )}
      </div>
      <DetailField label="Status">{row.status}</DetailField>
      <DetailField label="Importance">{importance?.label ?? '—'}</DetailField>
      <DetailField label="Assigned to">{row.assignee}</DetailField>
      <DetailField label="Assigned by">
        <CreatorCell row={row} />
      </DetailField>
      <DetailField label={dateHeader}>
        <p>
          {row.dateLabel}
          {row.note ? ` · ${row.note}` : ''}
        </p>
      </DetailField>
      <DetailField label="Source">{SOURCE_LABELS[row.source] ?? row.source}</DetailField>
    </div>
  )
}

function TaskReportRow({ row, dateHeader, expanded, onToggle }) {
  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
        className={`group cursor-pointer border-t border-surface-border/60 align-top transition-colors first:border-t-0 ${
          expanded ? 'bg-sky-500/[0.06]' : 'hover:bg-sky-500/10'
        }`}
      >
        <td className="px-5 py-3">
          <p
            className={`text-sm font-medium text-ink underline-offset-2 group-hover:text-sky-800 group-hover:underline dark:group-hover:text-sky-300 ${
              expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
            }`}
            title={`${row.name} — click to ${expanded ? 'close' : 'view details'}`}
          >
            {row.name}
          </p>
          {row.context && (
            <p className="mt-0.5 truncate text-xs text-ink-subtle" title={row.context}>
              {row.context}
            </p>
          )}
          <p
            className={`mt-1 text-[11px] font-medium text-sky-700 dark:text-sky-300 ${
              expanded ? '' : 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'
            }`}
          >
            {expanded ? 'Hide details' : 'View details'}
          </p>
        </td>
        <td className="px-3 py-3">
          <ImportanceIcon level={row.importance} />
        </td>
        <td className="px-3 py-3">
          <CreatorCell row={row} />
        </td>
        <td className="px-3 py-3 tabular-nums">
          <p className="whitespace-nowrap text-sm text-ink">{row.dateLabel}</p>
          {row.note && (
            <p
              className={`mt-0.5 text-xs ${
                row.late ? 'font-medium text-red-600 dark:text-red-400' : 'text-ink-subtle'
              }`}
            >
              {row.note}
            </p>
          )}
        </td>
        <td className="px-5 py-3">
          <TaskSourceBadge source={row.source} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-surface-border/40">
          <td colSpan={5} className="p-0">
            <TaskDetail row={row} dateHeader={dateHeader} />
          </td>
        </tr>
      )}
    </>
  )
}

function creatorText(creator) {
  if (!creator) return '—'
  return creator.detail ? `${creator.label} · ${creator.detail}` : creator.label
}

/**
 * Phone layout for one task: the same five fields as the table row, stacked,
 * so nothing needs a sideways scroll. Tap opens the same detail panel.
 */
function TaskReportCard({ row, dateHeader, expanded, onToggle }) {
  return (
    <li className="border-t border-surface-border/60 first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={`w-full px-4 py-3.5 text-left transition-colors ${
          expanded ? 'bg-sky-500/[0.06]' : 'active:bg-sky-500/10'
        }`}
      >
        <p className={`text-sm font-medium text-ink ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-3'}`}>{row.name}</p>
        {row.context && <p className="mt-0.5 truncate text-xs text-ink-subtle">{row.context}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          {row.importance && <ImportanceIcon level={row.importance} />}
          <span className="text-xs tabular-nums text-ink">
            <span className="text-ink-subtle">{dateHeader} </span>
            {row.dateLabel}
            {row.note && (
              <span className={row.late ? 'font-medium text-red-600 dark:text-red-400' : 'text-ink-subtle'}>
                {' · '}
                {row.note}
              </span>
            )}
          </span>
          <TaskSourceBadge source={row.source} />
        </div>

        <p className="mt-2 text-xs text-ink-muted">
          <span className="text-ink-subtle">Assigned by </span>
          {creatorText(row.creator)}
        </p>
        {row.sharedWith.length > 0 && (
          <p className="mt-0.5 text-xs text-ink-subtle">Shared with {row.sharedWith.join(', ')}</p>
        )}
        <p className="mt-1.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
          {expanded ? 'Hide details' : 'View details'}
        </p>
      </button>
      {expanded && <TaskDetail row={row} dateHeader={dateHeader} />}
    </li>
  )
}

function Chevron({ open }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-5 w-5 shrink-0 text-ink-subtle transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
        open ? 'rotate-180' : ''
      }`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export default function TaskReportSection({ section, blurb, rows, emptyText }) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const accent = ACCENTS[section.accent] ?? ACCENTS.sky
  const shown = showAll ? rows : rows.slice(0, FIRST_PAGE)
  const toggleRow = (id) => setSelectedId((current) => (current === id ? null : id))

  return (
    <section className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-panel">
      <header>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-ink/[0.03] sm:gap-4 sm:px-5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className={`h-8 w-1 shrink-0 rounded-full ${accent.bar}`} aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink">{section.title}</h2>
              <p className="mt-0.5 text-xs text-ink-subtle">{blurb}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <p className={`text-2xl font-semibold tabular-nums ${accent.count}`}>{rows.length}</p>
            <Chevron open={open} />
          </div>
        </button>
      </header>

      <div
        className={`grid motion-reduce:transition-none ${
          open
            ? 'grid-rows-[1fr] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'
            : 'grid-rows-[0fr] duration-200 ease-[cubic-bezier(0.4,0,1,1)]'
        } transition-[grid-template-rows]`}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            aria-hidden={!open}
            inert={open ? undefined : ''}
            className={`border-t border-surface-border transition-[opacity,transform] motion-reduce:transition-none ${
              open
                ? 'translate-y-0 opacity-100 duration-300 ease-out'
                : '-translate-y-1 opacity-0 duration-150 ease-in'
            }`}
          >
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-subtle sm:px-5">{emptyText}</p>
            ) : (
              <>
                {/* Phones get stacked cards; the five-column table needs tablet width. */}
                <ul className="md:hidden">
                  {shown.map((row) => (
                    <TaskReportCard
                      key={row.id}
                      row={row}
                      dateHeader={section.dateHeader}
                      expanded={selectedId === row.id}
                      onToggle={() => toggleRow(row.id)}
                    />
                  ))}
                </ul>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[660px] table-fixed text-left">
                    <colgroup>
                      <col className="w-[40%]" />
                      <col className="w-[13%]" />
                      <col className="w-[20%]" />
                      <col className="w-[14%]" />
                      <col className="w-[13%]" />
                    </colgroup>
                    <thead className="bg-surface/70">
                      <tr className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                        <th scope="col" className="px-5 py-2.5 font-semibold">
                          Task
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          Importance
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          Assigned by
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          {section.dateHeader}
                        </th>
                        <th scope="col" className="px-5 py-2.5 font-semibold">
                          Source
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((row) => (
                        <TaskReportRow
                          key={row.id}
                          row={row}
                          dateHeader={section.dateHeader}
                          expanded={selectedId === row.id}
                          onToggle={() => toggleRow(row.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > FIRST_PAGE && (
                  <div className="border-t border-surface-border px-4 py-3 sm:px-5">
                    <button
                      type="button"
                      onClick={() => setShowAll((current) => !current)}
                      className="py-1 text-sm font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                    >
                      {showAll ? `Show first ${FIRST_PAGE}` : `Show all ${rows.length}`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
