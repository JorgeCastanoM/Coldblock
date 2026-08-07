import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import LoginPage from './auth/LoginPage.jsx'
import { DashboardDataProvider } from './context/DashboardDataContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import DealsPage from './pages/DealsPage.jsx'
import SalesOverviewPage from './pages/SalesOverviewPage.jsx'

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
