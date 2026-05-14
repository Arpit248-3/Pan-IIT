import {
  MdBiotech, MdDashboard, MdManageSearch, MdTrendingUp,
  MdNotificationsActive, MdAssessment, MdMarkEmailUnread,
  MdGroup, MdFolderOpen, MdSettings, MdHelpOutline,
  MdShield, MdLogout, MdEmojiEvents, MdTravelExplore, MdAutoFixHigh
} from 'react-icons/md'

export default function Sidebar({ activePage, onNavigate, currentUser, onLogout }) {
  const isAdmin = currentUser?.role === 'admin'

  // ── Admin view: only the Admin Panel ──────────────────────────
  const adminNav = [
    {
      label: 'ADMIN PANEL',
      items: [
        { id: 'admin-help', icon: MdShield, label: 'Help Queries', adminOnly: true },
      ]
    }
  ]

  // ── Regular user view: full nav ────────────────────────────────
  const userNav = [
    {
      label: 'MAIN', items: [
        { id: 'dashboard',       icon: MdDashboard,          label: 'Overview' },
        { id: 'data-explorer',   icon: MdManageSearch,       label: 'Data Explorer' },
        { id: 'trend-analysis',  icon: MdTrendingUp,         label: 'Trend Analysis' },
        { id: 'help-center',     icon: MdHelpOutline,        label: 'Help Center' },
        { id: 'differentiators', icon: MdEmojiEvents,        label: 'Differentiators' },
        { id: 'command-center',  icon: MdAutoFixHigh,        label: 'Command Center' },
        { id: 'crawler',         icon: MdTravelExplore,      label: 'Self-Heal Crawler' },
      ]
    },
    {
      label: 'MANAGEMENT', items: [
        { id: 'alerts',          icon: MdNotificationsActive, label: 'Alerts',         badge: 12 },
        { id: 'reports',         icon: MdAssessment,          label: 'Reports' },
        { id: 'notifications',   icon: MdMarkEmailUnread,     label: 'Notifications',  badge: 5 },
      ]
    },
    {
      label: 'ADMINISTRATION', items: [
        { id: 'user-management', icon: MdGroup,       label: 'User Management' },
        { id: 'projects',        icon: MdFolderOpen,  label: 'Projects' },
        { id: 'settings',        icon: MdSettings,    label: 'Settings' },
      ]
    },
  ]

  const navSections = isAdmin ? adminNav : userNav

  // Generate initials from name
  const initials = currentUser?.name
    ? currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '??'

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-icon"><MdBiotech /></div>
          <div className="logo-text">
            <span className="logo-title">AyuScout</span>
            <span className="logo-subtitle">AI Intelligence</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navSections.map(section => (
          <div className="nav-section" key={section.label}>
            <span className="nav-section-label">{section.label}</span>
            {section.items.map(item => (
              <div
                key={item.id}
                className={`nav-item ${activePage === item.id ? 'active' : ''} ${item.adminOnly ? 'nav-item-admin' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <item.icon size={20} />
                <span>{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
                {item.adminOnly && <span className="nav-admin-tag">Admin</span>}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <span className="user-name">{currentUser?.name || 'User'}</span>
            <span className="user-role">{currentUser?.role === 'admin' ? '🛡 Administrator' : 'Safety Officer'}</span>
          </div>
          <button
            title="Sign out"
            onClick={onLogout}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,.4)', display: 'flex', padding: 4, borderRadius: 4,
              transition: 'color .2s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,.4)'}
          >
            <MdLogout size={18} />
          </button>
        </div>
      </div>
    </aside>
  )
}

