import { useState } from 'react'
import { useAuth } from './AuthContext.jsx'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
    } catch {
      setError('Incorrect username or password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-8 shadow-lg"
      >
        <h1 className="mb-6 text-xl font-semibold text-slate-100">ColdBlock Dashboard</h1>
        <label className="mb-2 block text-sm text-slate-400" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mb-4 w-full rounded-lg border border-surface-border bg-surface px-4 py-3 text-lg text-slate-100 focus:border-sky-500 focus:outline-none"
          autoFocus
        />
        <label className="mb-2 block text-sm text-slate-400" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-4 w-full rounded-lg border border-surface-border bg-surface px-4 py-3 text-lg text-slate-100 focus:border-sky-500 focus:outline-none"
        />
        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !username || !password}
          className="w-full rounded-lg bg-sky-600 px-4 py-3 text-lg font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
