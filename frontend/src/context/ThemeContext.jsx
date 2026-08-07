import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'coldblock-theme'
const ThemeContext = createContext(null)

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // ignore
  }
  return getSystemTheme()
}

function applyTheme(theme) {
  const root = document.documentElement
  const isDark = theme === 'dark'
  root.classList.toggle('dark', isDark)
  root.style.colorScheme = isDark ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    const initial = getInitialTheme()
    applyTheme(initial)
    return initial
  })

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore
    }
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return
      } catch {
        // ignore
      }
      const next = media.matches ? 'dark' : 'light'
      setThemeState(next)
      applyTheme(next)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next) => {
    setThemeState(next === 'light' ? 'light' : 'dark')
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
