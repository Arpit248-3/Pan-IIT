import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Modal from './components/Modal'
import Dashboard from './pages/Dashboard'
import DataExplorer from './pages/DataExplorer'
import TrendAnalysis from './pages/TrendAnalysis'
import Alerts from './pages/Alerts'
import Reports from './pages/Reports'
import Notifications from './pages/Notifications'
import UserManagement from './pages/UserManagement'
import Projects from './pages/Projects'
import Settings from './pages/Settings'
import Login from './pages/Login'
import HelpCenter from './pages/HelpCenter'
import AdminHelpDashboard from './pages/AdminHelpDashboard'
import DifferentiatorsShowcase from './pages/DifferentiatorsShowcase'
import CrawlerPage from './pages/CrawlerPage'
import CommandCenter from './pages/CommandCenter'
import HeroCinematic from './pages/HeroCinematic'
import { SettingsProvider } from './context/SettingsContext'

const titles = {
  dashboard:            'Actionable Insights Dashboard',
  'data-explorer':      'Data Explorer',
  'trend-analysis':     'Trend Analysis',
  alerts:               'Alerts Management',
  reports:              'Reports',
  notifications:        'Notifications',
  'user-management':    'User Management',
  projects:             'Projects',
  settings:             'Settings',
  'help-center':        'Help Center',
  'admin-help':         'Admin Panel — Help Queries',
  differentiators:      'Competitive Differentiators',
  crawler:              'Self-Healing Agentic Crawler',
  'command-center':     'Competitive Differentiators — Command Center',
}

const pages = {
  dashboard:            Dashboard,
  'data-explorer':      DataExplorer,
  'trend-analysis':     TrendAnalysis,
  alerts:               Alerts,
  reports:              Reports,
  notifications:        Notifications,
  'user-management':    UserManagement,
  projects:             Projects,
  settings:             Settings,
  'help-center':        HelpCenter,
  'admin-help':         AdminHelpDashboard,
  differentiators:      DifferentiatorsShowcase,
  crawler:              CrawlerPage,
  'command-center':     CommandCenter,
}

export default function App() {
  const [page, setPage]             = useState('dashboard')
  const [modal, setModal]           = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [heroShown, setHeroShown]   = useState(false)

  const isAdmin = currentUser?.role === 'admin'

  // ── Restore auth from localStorage ──────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ayuscout_user')
      if (stored) {
        const u = JSON.parse(stored)
        setCurrentUser(u)
        if (u?.role === 'admin') setPage('admin-help')
      }
    } catch { /* ignore */ }
    setAuthChecked(true)
  }, [])

  const handleLogin = (user) => {
    localStorage.setItem('ayuscout_user', JSON.stringify(user))
    setCurrentUser(user)
    setPage(user.role === 'admin' ? 'admin-help' : 'dashboard')
  }

  const handleLogout = () => {
    localStorage.removeItem('ayuscout_user')
    setCurrentUser(null)
    setPage('dashboard')
  }

  // Admin can only visit admin-help
  const handleNavigate = (target) => {
    if (isAdmin && target !== 'admin-help') return
    setPage(target)
  }

  if (!authChecked) return null

  // Cinematic intro (first load)
  if (!heroShown) {
    return <HeroCinematic onEnter={() => setHeroShown(true)} />
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />
  }

  const PageComponent = pages[page] || (isAdmin ? AdminHelpDashboard : Dashboard)

  return (
    // SettingsProvider wraps everything so settings are globally available
    <SettingsProvider userId={currentUser?.id}>
      <Sidebar
        activePage={page}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      <main className="main-content">
        <Header title={titles[page] || page} onNavigate={handleNavigate} />
        <div className="page-content" key={page}>
          <div className="fade-in">
            <PageComponent
              openModal={setModal}
              onNavigate={handleNavigate}
              currentUser={currentUser}
            />
          </div>
        </div>
      </main>
      {modal && <Modal {...modal} onClose={() => setModal(null)} />}
    </SettingsProvider>
  )
}
