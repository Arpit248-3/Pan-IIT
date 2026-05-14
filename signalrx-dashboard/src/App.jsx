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
  const [heroShown, setHeroShown]   = useState(false)   // always show intro on fresh load

  const isAdmin = currentUser?.role === 'admin'

  // On mount: restore user from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ayuscout_user')
      if (stored) {
        const u = JSON.parse(stored)
        setCurrentUser(u)
        // Force admin to their dedicated panel immediately
        if (u?.role === 'admin') setPage('admin-help')
      }
    } catch { /* ignore */ }
    setAuthChecked(true)
  }, [])

  const handleLogin = (user) => {
    localStorage.setItem('ayuscout_user', JSON.stringify(user))
    setCurrentUser(user)
    // Admin always lands on — and stays on — the Admin Panel
    setPage(user.role === 'admin' ? 'admin-help' : 'dashboard')
  }

  const handleLogout = () => {
    localStorage.removeItem('ayuscout_user')
    setCurrentUser(null)
    setPage('dashboard')
  }

  // Guard: admin can only navigate to admin-help
  const handleNavigate = (target) => {
    if (isAdmin && target !== 'admin-help') return   // silently block
    setPage(target)
  }

  // Don't render anything until we've checked localStorage
  if (!authChecked) return null

  // Show hero cinematic first (8-second auto-play intro)
  if (!heroShown) {
    return (
      <HeroCinematic
        onEnter={() => setHeroShown(true)}
      />
    )
  }

  // Show login page if not authenticated
  if (!currentUser) {
    return <Login onLogin={handleLogin} />
  }

  const PageComponent = pages[page] || (isAdmin ? AdminHelpDashboard : Dashboard)

  return (
    <>
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
            <PageComponent openModal={setModal} onNavigate={handleNavigate} />
          </div>
        </div>
      </main>
      {modal && <Modal {...modal} onClose={() => setModal(null)} />}
    </>
  )
}
