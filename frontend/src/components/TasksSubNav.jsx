import { NavLink } from 'react-router-dom'

const linkClass = ({ isActive }) =>
  [
    'rounded-md px-3.5 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
      : 'text-ink-muted hover:bg-ink/[0.05] hover:text-ink',
  ].join(' ')

/** Switches between the two views of the Tasks section; they share one fetch. */
export default function TasksSubNav() {
  return (
    <nav
      aria-label="Tasks views"
      className="mb-5 inline-flex items-center gap-0.5 rounded-lg border border-surface-border bg-surface-raised p-1 shadow-panel"
    >
      <NavLink to="/tasks" end className={linkClass}>
        Team board
      </NavLink>
      <NavLink to="/tasks/report" className={linkClass}>
        Report
      </NavLink>
    </nav>
  )
}
