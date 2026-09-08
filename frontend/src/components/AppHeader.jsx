import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import ThemeToggle from './ThemeToggle.jsx'

const linkClass = ({ isActive }) =>
  [
    'rounded-md px-3.5 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
      : 'text-ink-muted hover:bg-ink/[0.05] hover:text-ink',
  ].join(' ')

function NavGroup({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{label}</span>
      <nav className="flex items-center gap-0.5 rounded-lg border border-surface-border bg-surface-raised p-1">
        {children}
      </nav>
    </div>
  )
}

export default function AppHeader({ title, onRefresh, loading }) {
  const { logout } = useAuth()

  return (
    <header className="sticky top-0 z-20 -mx-6 mb-8 border-b border-surface-border/80 bg-surface-raised/90 px-6 py-4 shadow-panel backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-end gap-5">
          <div className="flex min-w-0 items-center gap-4 pb-1.5">
            <img
              src="/Coldblock_Logo.webp"
              alt="ColdBlock Technologies"
              className="h-9 w-auto shrink-0 rounded-md bg-slate-950 px-1.5 py-0.5 dark:bg-transparent dark:px-0 dark:py-0"
            />
            <div className="w-56 shrink-0 border-l border-surface-border pl-4">
              <h1 className="truncate text-xl font-semibold tracking-tight text-ink">{title}</h1>
            </div>
          </div>

          {/* Manufacture (Fishbowl) nav is hidden for now — this build is deployed
              publicly and the backend has no Tailscale route to Fishbowl there
              (see ENABLE_FISHBOWL in core/config.py). Re-add this NavGroup once
              Fishbowl is reachable from wherever the backend runs. */}

          <NavGroup label="Sales">
            <NavLink to="/sales-overview" className={linkClass}>
              Overview
            </NavLink>
            <NavLink to="/deals" className={linkClass}>
              Deals
            </NavLink>
            <NavLink to="/team-performance" className={linkClass}>
              Team
            </NavLink>
          </NavGroup>

          <nav className="flex items-center gap-0.5 rounded-lg border border-surface-border bg-surface-raised p-1">
            <NavLink to="/tasks" className={linkClass}>
              Tasks
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          <ThemeToggle />
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Updating…' : 'Refresh Data'}
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            className="rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:bg-ink/[0.05] hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
