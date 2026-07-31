import { useState } from 'react'
import { useAuth } from './AuthContext.jsx'

function PersonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

const inputClass =
  'w-full rounded-lg border border-surface-border bg-surface py-3 pl-10 pr-4 text-lg text-slate-100 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
    } catch (err) {
      if (err.response) {
        setError('Incorrect username or password')
      } else {
        setError('Could not reach the server. Is the backend running?')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.10),_transparent_55%)] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-surface-border bg-surface-raised shadow-2xl shadow-black/40"
      >
        <div className="h-1 bg-gradient-to-r from-sky-500 via-sky-400 to-cyan-300" />

        <div className="p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <img src="/Coldblock_Logo.webp" alt="ColdBlock Technologies" className="mb-4 h-12 w-auto" />
            <h1 className="text-lg font-semibold text-slate-100">Intelligence Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
          </div>

          <div className="space-y-4">
            <label className="block" htmlFor="username">
              <span className="mb-1.5 block text-sm font-medium text-slate-400">Username</span>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <PersonIcon />
                </span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className={inputClass}
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </label>

            <label className="block" htmlFor="password">
              <span className="mb-1.5 block text-sm font-medium text-slate-400">Password</span>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <LockIcon />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${inputClass} pr-12`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-500 hover:text-slate-100 focus:text-slate-100 focus:outline-none"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-3 text-lg font-medium text-white shadow-lg shadow-sky-950/40 transition hover:bg-sky-500 hover:shadow-sky-900/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {submitting && <Spinner />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
