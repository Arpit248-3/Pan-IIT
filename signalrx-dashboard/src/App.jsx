import { useState, useEffect } from 'react'
import useAyuStore from './store/useAyuStore'
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
import ProjectDetails from './pages/ProjectDetails'
import Settings from './pages/Settings'
import Login from './pages/Login'
import HelpCenter from './pages/HelpCenter'
import AdminHelpDashboard from './pages/AdminHelpDashboard'
import CrawlerPage from './pages/CrawlerPage'
import HeroCinematic from './pages/HeroCinematic'
import { SettingsProvider } from './context/SettingsContext'
// NOTE: DifferentiatorsShowcase and CommandCenter JSX files are kept on disk
// but removed from routing to clean up prototype-only demo tabs.

const titles = {
  dashboard:            'Actionable Insights Dashboard',
  'data-explorer':      'Data Explorer',
  'trend-analysis':     'Trend Analysis',
  alerts:               'Alerts Management',
  reports:              'Reports',
  notifications:        'Notifications',
  'user-management':    'User Management',
  projects:             'Projects',
  'project-detail':     'Project Details',
  settings:             'Settings',
  'help-center':        'Help Center',
  'admin-help':         'Admin Panel — Help Queries',
  crawler:              'Self-Healing Agentic Crawler',
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
  // project-detail is handled separately via ProjectDetails with projectId param
  settings:             Settings,
  'help-center':        HelpCenter,
  'admin-help':         AdminHelpDashboard,
  crawler:              CrawlerPage,
}

export default function App() {
  const [page, setPage]               = useState('dashboard')
  const [navParams, setNavParams]     = useState({})   // carries projectId etc.
  const [modal, setModal]             = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [heroShown, setHeroShown]     = useState(false)

  const isAdmin = currentUser?.role === 'admin'

  // ── Restore auth from localStorage ──────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ayuscout_user')
      if (stored) {
        const u = JSON.parse(stored)
        setCurrentUser(u)
        if (u?.role === 'admin') setPage('admin-help')
        // Resume background data polling for restored session
        useAyuStore.getState().startAutoRefresh(u?.id)
      }
    } catch { /* ignore */ }
    setAuthChecked(true)
  }, [])

  const handleLogin = (user) => {
    localStorage.setItem('ayuscout_user', JSON.stringify(user))
    setCurrentUser(user)
    setPage(user.role === 'admin' ? 'admin-help' : 'dashboard')
    // Start background 30s auto-poll — keeps ALL tabs live
    useAyuStore.getState().startAutoRefresh(user?.id)
  }

  const handleLogout = () => {
    useAyuStore.getState().stopAutoRefresh()
    localStorage.removeItem('ayuscout_user')
    setCurrentUser(null)
    setPage('dashboard')
  }

  // Admin can only visit admin-help
  const handleNavigate = (target, params = {}) => {
    if (isAdmin && target !== 'admin-help') return
    setPage(target)
    setNavParams(params || {})
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
            {page === 'project-detail' ? (
              <ProjectDetails
                projectId={navParams.projectId}
                currentUser={currentUser}
                onNavigate={handleNavigate}
              />
            ) : (
              <PageComponent
                openModal={setModal}
                onNavigate={handleNavigate}
                currentUser={currentUser}
              />
            )}
          </div>
        </div>
      </main>
      {modal && <Modal {...modal} onClose={() => setModal(null)} />}
    </SettingsProvider>
  )
}
