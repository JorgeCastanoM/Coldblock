import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getTasksReport } from '../services/api.js'

const TasksDataContext = createContext(null)

// Shared by the Team board and the Report so switching between them doesn't
// re-run the ~6s HubSpot + Planner fetch. Held in memory for the session only,
// like DashboardDataContext — nothing is persisted. Kept separate from that
// context so a slow or failing Planner can't hold up the sales pages.
export function TasksDataProvider({ children }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [window_, setWindow] = useState('actionable')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReport(await getTasksReport(window_))
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not load the task report')
    } finally {
      setLoading(false)
    }
  }, [window_])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <TasksDataContext.Provider value={{ report, error, loading, window_, setWindow, refresh }}>
      {children}
    </TasksDataContext.Provider>
  )
}

export function useTasksData() {
  const context = useContext(TasksDataContext)
  if (!context) {
    throw new Error('useTasksData must be used within a TasksDataProvider')
  }
  return context
}
