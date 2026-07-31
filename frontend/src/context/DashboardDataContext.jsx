import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getDashboardSummary } from '../services/api.js'

const DashboardDataContext = createContext(null)

// Fetched once per app session (and on manual "Update from Fishbowl"), then shared
// across every page. This is what makes a single Fishbowl login cover everything —
// navigating between Parts and Sales Orders no longer triggers its own re-fetch.
export function DashboardDataProvider({ children }) {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getDashboardSummary()
      setSummary(data)
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <DashboardDataContext.Provider value={{ summary, error, loading, refresh }}>
      {children}
    </DashboardDataContext.Provider>
  )
}

export function useDashboardData() {
  const context = useContext(DashboardDataContext)
  if (!context) {
    throw new Error('useDashboardData must be used within a DashboardDataProvider')
  }
  return context
}
