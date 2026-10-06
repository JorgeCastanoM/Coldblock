import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import LoginPage from './auth/LoginPage.jsx'
import { DashboardDataProvider } from './context/DashboardDataContext.jsx'
import { TasksDataProvider } from './context/TasksDataContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import DealsPage from './pages/DealsPage.jsx'
import QuarterlyReviewPage from './pages/QuarterlyReviewPage.jsx'
import SalesOverviewPage from './pages/SalesOverviewPage.jsx'
import TaskReportPage from './pages/TaskReportPage.jsx'
import TasksPage from './pages/TasksPage.jsx'
import TeamPerformancePage from './pages/TeamPerformancePage.jsx'

// Both task pages read one fetch, so moving between them is instant.
function TasksSection() {
  return (
    <TasksDataProvider>
      <Outlet />
    </TasksDataProvider>
  )
}

// Fishbowl-backed pages (Products, Sales Orders, Purchase Orders) are routed
// away for now — this build is deployed publicly and the backend has no
// Tailscale route to Fishbowl there (see ENABLE_FISHBOWL in core/config.py).
// Their routes/components are untouched; only reachability is disabled.
function Shell() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <DashboardDataProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/sales-overview" replace />} />
        <Route path="/deals" element={<DealsPage />} />
        <Route path="/sales-overview" element={<SalesOverviewPage />} />
        <Route path="/team-performance" element={<TeamPerformancePage />} />
        <Route path="/quarterly" element={<QuarterlyReviewPage />} />
        <Route element={<TasksSection />}>
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/report" element={<TaskReportPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/sales-overview" replace />} />
      </Routes>
    </DashboardDataProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Shell />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
