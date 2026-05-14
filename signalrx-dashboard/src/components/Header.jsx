import { useState, useEffect } from 'react'
import { MdSearch, MdNotifications, MdHelpOutline, MdClose, MdMenu } from 'react-icons/md'
import { API_BASE } from '../config'

export default function Header({ title, onNavigate }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSearch, setShowSearch] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Toggle sidebar .open class on the sidebar element (mobile)
  useEffect(() => {
    const sidebar = document.querySelector('.sidebar')
    if (!sidebar) return
    if (sidebarOpen) {
      sidebar.classList.add('open')
    } else {
      sidebar.classList.remove('open')
    }
  }, [sidebarOpen])

  // Close sidebar on navigation
  const handleNavigate = (page) => {
    setSidebarOpen(false)
    if (onNavigate) onNavigate(page)
  }

  // Simple global search across pages
  const SEARCH_INDEX = [
    { label: 'Dashboard Overview', page: 'dashboard', keywords: ['dashboard', 'overview', 'kpi', 'signals'] },
    { label: 'Data Explorer — Intake Vault', page: 'data-explorer', keywords: ['data', 'explorer', 'intake', 'vault', 'records', 'posts'] },
    { label: 'Trend Analysis', page: 'trend-analysis', keywords: ['trend', 'analysis', 'causality', 'severity', 'distribution'] },
    { label: 'Alerts Management', page: 'alerts', keywords: ['alerts', 'signals', 'flagged', 'critical', 'high'] },
    { label: 'Reports', page: 'reports', keywords: ['reports', 'e2b', 'export', 'xml', 'icsr'] },
    { label: 'Notifications', page: 'notifications', keywords: ['notifications', 'unread', 'mark'] },
    { label: 'User Management', page: 'user-management', keywords: ['users', 'team', 'roles', 'admin'] },
    { label: 'Projects', page: 'projects', keywords: ['projects', 'monitoring', 'diabetes', 'cardio'] },
    { label: 'Settings', page: 'settings', keywords: ['settings', 'general', 'ai', 'security', 'notifications config'] },
  ]

  const handleSearch = (q) => {
    setSearchQuery(q)
    if (!q.trim()) { setSearchResults([]); return }
    const lower = q.toLowerCase()
    const results = SEARCH_INDEX.filter(item =>
      item.label.toLowerCase().includes(lower) ||
      item.keywords.some(k => k.includes(lower))
    )
    setSearchResults(results)
    setShowSearch(true)
  }

  const goTo = (page) => {
    handleNavigate(page)
    setSearchQuery('')
    setSearchResults([])
    setShowSearch(false)
  }

  return (
    <>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 150,
            background: 'rgba(10,25,47,.45)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      <header className="top-header" style={{ position: 'relative', zIndex: 99 }}>
        <div className="header-left">
          {/* Hamburger — only visible on tablet/mobile via CSS */}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(v => !v)}
            title="Toggle menu"
          >
            <MdMenu size={22} />
          </button>
          <h1 className="page-title">{title}</h1>
        </div>
        <div className="header-right">

          {/* ── GLOBAL SEARCH ── */}
          <div style={{ position: 'relative' }}>
            <div className="search-bar" style={{ width: 280 }}>
              <MdSearch size={18} color="var(--muted)" />
              <input
                placeholder="Search signals, drugs, events..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => searchQuery && setShowSearch(true)}
                onBlur={() => setTimeout(() => setShowSearch(false), 150)}
                style={{ width: '100%' }}
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: 0 }}>
                  <MdClose size={15} />
                </button>
              )}
            </div>
            {showSearch && searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: 4
              }}>
                {searchResults.map(r => (
                  <div key={r.page} onMouseDown={() => goTo(r.page)}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
                      borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <MdSearch size={14} style={{ color: 'var(--muted)' }} />
                    {r.label}
                  </div>
                ))}
              </div>
            )}
            {showSearch && searchResults.length === 0 && searchQuery && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: '12px 14px',
                fontSize: 13, color: 'var(--muted)', marginTop: 4
              }}>
                No results for "{searchQuery}"
              </div>
            )}
          </div>

          {/* ── NOTIFICATION BELL ── */}
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={() => setShowNotifPanel(p => !p)}>
              <MdNotifications size={20} />
              <span className="notif-dot" />
            </button>
            {showNotifPanel && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, width: 320, zIndex: 1000,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', overflow: 'hidden', marginTop: 8
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Notifications</span>
                  <button onClick={() => goTo('notifications')}
                    style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    View all →
                  </button>
                </div>
                {[
                  { icon: '🔴', title: 'Lisinopril — Angioedema signal detected', time: '43m ago', sev: 'Critical' },
                  { icon: '🟠', title: 'Metformin — Nausea signal detected', time: '1h ago', sev: 'High' },
                  { icon: '🔵', title: 'Atorvastatin — Myalgia signal detected', time: '2h ago', sev: 'Medium' },
                ].map((n, i) => (
                  <div key={i} onClick={() => goTo('notifications')} style={{
                    padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13,
                    display: 'flex', gap: 10, alignItems: 'flex-start', transition: 'background 0.15s'
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: 16 }}>{n.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{n.time} · Severity: {n.sev}</div>
                    </div>
                    <div style={{ width: 8, height: 8, background: 'var(--blue)', borderRadius: '50%', marginTop: 4, flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── HELP BUTTON ── */}
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={() => setShowHelp(p => !p)}>
              <MdHelpOutline size={20} />
            </button>
            {showHelp && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, width: 300, zIndex: 1000,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', overflow: 'hidden', marginTop: 8
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
                  📖 AyuScout V2 Help
                </div>
                {[
                  { icon: '🚀', title: 'Run AI Analysis', desc: 'Paste any patient report or social media post in the Dashboard command center.' },
                  { icon: '📡', title: 'Fetch Signals', desc: 'Use Data Explorer to crawl new drug-related posts by keyword.' },
                  { icon: '📄', title: 'Export E2B XML', desc: 'Click the download icon in Reports to export any signal as ICH E2B (R3) XML.' },
                  { icon: '🔔', title: 'Webhook Alerts', desc: 'Critical signals trigger automatic webhook alerts logged in Notifications.' },
                ].map((h, i) => (
                  <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{h.icon} {h.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{h.desc}</div>
                  </div>
                ))}
                <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)' }}>
                  AyuScout V2 · Backend: <code>{API_BASE}</code>
                </div>
              </div>
            )}
          </div>

        </div>
      </header>
    </>
  )
}
