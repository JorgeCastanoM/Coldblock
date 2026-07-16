import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import LoginPage from './auth/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'

function Shell() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <DashboardPage /> : <LoginPage />
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
