import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { homePath } from './auth/sections.js'
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
function Allow({ section, children }) {
  const { sections } = useAuth()
  if (!sections.includes(section)) {
    return <Navigate to={homePath(sections)} replace />
  }
  return children
}

function Shell() {
  const { isAuthenticated, sections } = useAuth()
  if (!isAuthenticated) {
    return <LoginPage />
  }
  const home = homePath(sections)

  return (
    <DashboardDataProvider>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/deals" element={<Allow section="deals"><DealsPage /></Allow>} />
        <Route path="/sales-overview" element={<Allow section="overview"><SalesOverviewPage /></Allow>} />
        <Route path="/team-performance" element={<Allow section="team"><TeamPerformancePage /></Allow>} />
        <Route path="/quarterly" element={<Allow section="pipeline"><QuarterlyReviewPage /></Allow>} />
        <Route element={<TasksSection />}>
          <Route path="/tasks" element={<Allow section="tasks"><TasksPage /></Allow>} />
          <Route path="/tasks/report" element={<Allow section="tasks"><TaskReportPage /></Allow>} />
        </Route>
        <Route path="*" element={<Navigate to={home} replace />} />
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
