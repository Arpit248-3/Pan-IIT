import { useState, useEffect } from 'react'
import { MdWarning, MdShowChart, MdAssignmentTurnedIn, MdNotificationsActive, MdRefresh, MdDoneAll } from 'react-icons/md'

import { API_BASE } from '../config';


const iconMap = {
  critical: { icon: MdWarning,               bg: 'var(--danger-bg)', color: 'var(--danger)' },
  warning:  { icon: MdShowChart,             bg: 'var(--warn-bg)',   color: 'var(--warn)'   },
  info:     { icon: MdAssignmentTurnedIn,    bg: 'var(--info-bg)',   color: 'var(--info)'   },
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('All')

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/notifications`)
      const data = await res.json()
      if (data.status === 'success') setNotifications(data.notifications || [])
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchNotifications() }, [])

  // ── Mark All Read ─────────────────────────────────────────────
  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })))
  }

  // ── Mark single read ──────────────────────────────────────────
  const handleMarkRead = (index) => {
    setNotifications(prev => prev.map((n, i) => i === index ? { ...n, unread: false } : n))
  }

  // ── Delete notification ──────────────────────────────────────
  const handleDelete = (index) => {
    setNotifications(prev => prev.filter((_, i) => i !== index))
  }

  const unreadCount = notifications.filter(n => n.unread).length
  const tabs = ['All', `Unread (${unreadCount})`, 'Signals', 'Alerts']

  const filtered = notifications.filter(n => {
    if (tab === 'All') return true
    if (tab.startsWith('Unread')) return n.unread
    if (tab === 'Signals') return n.type === 'signal'
    if (tab === 'Alerts') return n.type === 'alert'
    return true
  })

  return (
    <>
      <div className="filter-bar" style={{ justifyContent: 'space-between' }}>
        <div className="tabs" style={{ border: 'none', margin: 0 }}>
          {tabs.map(t => (
            <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Unread count badge */}
          {unreadCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--muted)', padding: '2px 8px', background: 'var(--bg)', borderRadius: 99, border: '1px solid var(--border)' }}>
              {unreadCount} unread
            </span>
          )}
          {/* Reload */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={fetchNotifications}
            disabled={loading}
            title="Reload notifications"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <MdRefresh size={16} className={loading ? 'spin' : ''} />
            {loading ? 'Loading...' : 'Reload'}
          </button>
          {/* Mark All Read */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            title="Mark all as read"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <MdDoneAll size={16} />
            Mark All Read
          </button>
        </div>
      </div>

      <div className="card">
        {/* Summary strip */}
        {!loading && notifications.length > 0 && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 20 }}>
            <span>🔴 Critical: <strong>{notifications.filter(n => n.icon === 'critical').length}</strong></span>
            <span>🟠 Warnings: <strong>{notifications.filter(n => n.icon === 'warning').length}</strong></span>
            <span>🔵 Info: <strong>{notifications.filter(n => n.icon === 'info').length}</strong></span>
            <span style={{ marginLeft: 'auto' }}>Total: <strong>{notifications.length}</strong></span>
          </div>
        )}

        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              <MdRefresh size={24} className="spin" style={{ marginBottom: 8 }} />
              <div>Loading notifications...</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              {tab.startsWith('Unread') && unreadCount === 0
                ? '✅ All notifications are marked as read.'
                : 'No notifications yet. Run AI analysis to generate signals.'}
            </div>
          ) : (
            filtered.map((n, i) => {
              const iconInfo = iconMap[n.icon] || iconMap.info
              const IconComp = iconInfo.icon
              const originalIndex = notifications.indexOf(n)
              return (
                <div key={i} className={`notif-item ${n.unread ? 'unread' : ''}`}
                  style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                  onClick={() => handleMarkRead(originalIndex)}>
                  <div className="notif-icon" style={{ background: iconInfo.bg, color: iconInfo.color }}>
                    <IconComp size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: n.unread ? 700 : 500, marginBottom: 2 }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>{n.desc}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{n.time}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    {n.unread && <div style={{ width: 8, height: 8, background: 'var(--blue)', borderRadius: '50%' }} />}
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Dismiss"
                      style={{ fontSize: 11, padding: '2px 6px', opacity: 0.5 }}
                      onClick={e => { e.stopPropagation(); handleDelete(originalIndex) }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
