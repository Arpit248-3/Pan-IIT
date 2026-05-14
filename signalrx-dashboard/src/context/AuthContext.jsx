/**
 * AuthContext — global authentication state
 * Provides currentUser, login, logout, refreshUser across all components.
 * Also handles session timeout (inactivity-based auto-logout).
 */
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import api from '../services/api'

const AuthContext = createContext(null)

// Role display map
export const ROLE_LABELS = {
  admin:          '🛡 Administrator',
  user:           'User',
  analyst:        'Analyst',
  reviewer:       'Reviewer',
  safety_officer: 'Safety Officer',
  'Safety Officer': 'Safety Officer',
  'Analyst':       'Analyst',
  'Reviewer':      'Reviewer',
  'Admin':         '🛡 Administrator',
}

export function AuthProvider({ children, onLogout }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const inactivityTimer = useRef(null)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ayuscout_user')
      if (stored) {
        const u = JSON.parse(stored)
        setCurrentUser(u)
      }
    } catch { /* ignore */ }
    setAuthChecked(true)
  }, [])

  // Refresh user profile from backend (keeps role/dept in sync)
  const refreshUser = useCallback(async (userId) => {
    if (!userId) return
    try {
      const data = await api.get(`/api/auth/me?user_id=${userId}`, true)
      if (data?.user) {
        const updated = { ...currentUser, ...data.user }
        setCurrentUser(updated)
        localStorage.setItem('ayuscout_user', JSON.stringify(updated))
      }
    } catch { /* silent — backend may not be available */ }
  }, [currentUser])

  // Session timeout — inactivity-based auto-logout
  const resetInactivityTimer = useCallback((timeoutMs) => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (!timeoutMs) return
    inactivityTimer.current = setTimeout(() => {
      toast.warning('Session expired due to inactivity. Please log in again.')
      handleLogout()
    }, timeoutMs)
  }, []) // eslint-disable-line

  const parseTimeoutMs = (setting) => {
    const map = {
      '15 minutes': 15 * 60 * 1000,
      '30 minutes': 30 * 60 * 1000,
      '1 hour':     60 * 60 * 1000,
      '4 hours':    4  * 60 * 60 * 1000,
    }
    return map[setting] || 30 * 60 * 1000
  }

  // Attach activity listeners once user is logged in
  useEffect(() => {
    if (!currentUser) return
    const sessionTimeout = currentUser.sessionTimeout || '30 minutes'
    const ms = parseTimeoutMs(sessionTimeout)

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    const reset = () => resetInactivityTimer(ms)
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset() // start timer

    return () => {
      events.forEach(e => window.removeEventListener(e, reset))
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    }
  }, [currentUser, resetInactivityTimer])

  const handleLogin = (user) => {
    localStorage.setItem('ayuscout_user', JSON.stringify(user))
    setCurrentUser(user)
  }

  const handleLogout = useCallback(() => {
    localStorage.removeItem('ayuscout_user')
    setCurrentUser(null)
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (onLogout) onLogout()
  }, [onLogout])

  // Expose role label for sidebar
  const roleLabel = currentUser
    ? ROLE_LABELS[currentUser.role] || currentUser.role || 'User'
    : ''

  return (
    <AuthContext.Provider value={{
      currentUser,
      authChecked,
      roleLabel,
      login: handleLogin,
      logout: handleLogout,
      refreshUser,
      isAdmin: currentUser?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext
