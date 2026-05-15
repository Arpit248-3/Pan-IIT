import { useState, useEffect, useCallback } from 'react'
import { MdWarning, MdShowChart, MdAssignmentTurnedIn, MdRefresh, MdDoneAll } from 'react-icons/md'
import { toast } from 'sonner'
import notificationService from '../services/notificationService'
import { useDataRefresh } from '../utils/dataEvents'
import useAyuStore from '../store/useAyuStore'

const iconMap = {
  critical: { icon: MdWarning,            bg: 'var(--danger-bg)', color: 'var(--danger)' },
  warning:  { icon: MdShowChart,          bg: 'var(--warn-bg)',   color: 'var(--warn)'   },
  info:     { icon: MdAssignmentTurnedIn, bg: 'var(--info-bg)',   color: 'var(--info)'   },
}

export default function Notifications({ currentUser }) {
  const [tab, setTab]                   = useState('All')
  const [actionLoading, setActionLoading] = useState(null)
  const userId = currentUser?.id

  // ── Zustand store ──────────────────────────────────────────
  const notifications        = useAyuStore(s => s.notifications)
  const notifsLoading        = useAyuStore(s => s.notifsLoading)
  const refreshNotifications = useAyuStore(s => s.refreshNotifications)
  const markReadInStore      = useAyuStore(s => s.markNotificationRead)
  const markAllReadInStore   = useAyuStore(s => s.markAllNotificationsRead)
  const loading              = notifsLoading  // alias for JSX compatibility

  const doRefresh = useCallback(() => refreshNotifications(userId), [refreshNotifications, userId])

  useEffect(() => {
    const store = useAyuStore.getState()
    if (store.notifications.length === 0) doRefresh()
  }, [doRefresh])
  useDataRefresh(doRefresh)  // Safety net: legacy event bus

  // ── Mark single read → persisted in DB ───────────────────
  const handleMarkRead = useCallback(async (notif) => {
    if (!notif.unread) return
    setActionLoading(notif.id)
    try {
      await notificationService.markRead(notif.id)
      markReadInStore(notif.id)  // Optimistic update in store
    } catch {
      toast.error('Failed to mark as read')
    } finally {
      setActionLoading(null)
    }
  }, [markReadInStore])

  // ── Mark all read → persisted in DB ──────────────────────
  const handleMarkAllRead = useCallback(async () => {
    try {
      await notificationService.markAllRead(userId)
      markAllReadInStore()  // Optimistic update in store
      toast.success('All notifications marked as read')
    } catch {
      toast.error('Failed to mark all as read')
    }
  }, [userId, markAllReadInStore])



  // ── Delete → persisted in DB ─────────────────────────────
  const handleDelete = useCallback(async (notif, e) => {
    e.stopPropagation()
    setActionLoading(notif.id)
    try {
      await notificationService.remove(notif.id)
      doRefresh()  // Re-fetch from store after delete
    } catch {
      toast.error('Failed to delete notification')
    } finally {
      setActionLoading(null)
    }
  }, [doRefresh])

  const unreadCount = notifications.filter(n => n.unread).length
  const tabs = ['All', `Unread (${unreadCount})`, 'Signals', 'Alerts']

  const filtered = notifications.filter(n => {
    if (tab === 'All') return true
    if (tab.startsWith('Unread')) return n.unread
    if (tab === 'Signals') return n.type === 'signal'
    if (tab === 'Alerts')  return n.type === 'alert'
    return true
  })

  return (
    <>
      <div className="filter-bar" style={{ justifyContent: 'space-between' }}>
        <div className="tabs" style={{ border: 'none', margin: 0 }}>
          {tabs.map(t => (
            <div key={t} className={`tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}>{t}</div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {unreadCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--muted)', padding: '2px 8px',
              background: 'var(--bg)', borderRadius: 99, border: '1px solid var(--border)' }}>
              {unreadCount} unread
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={doRefresh}
            disabled={loading} title="Reload notifications"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MdRefresh size={16} className={loading ? 'spin' : ''} />
            {loading ? 'Loading...' : 'Reload'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleMarkAllRead}
            disabled={unreadCount === 0} title="Mark all as read"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MdDoneAll size={16} />
            Mark All Read
          </button>
        </div>
      </div>

      <div className="card">
        {/* ── Summary strip ── */}
        {!loading && notifications.length > 0 && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)',
            fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 20 }}>
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
            filtered.map(n => {
              const iconInfo = iconMap[n.icon] || iconMap.info
              const IconComp = iconInfo.icon
              const isActioning = actionLoading === n.id
              return (
                <div key={n.id} className={`notif-item ${n.unread ? 'unread' : ''}`}
                  style={{ cursor: 'pointer', transition: 'background 0.15s',
                    opacity: isActioning ? 0.6 : 1 }}
                  onClick={() => handleMarkRead(n)}>
                  <div className="notif-icon" style={{ background: iconInfo.bg, color: iconInfo.color }}>
                    <IconComp size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: n.unread ? 700 : 500, marginBottom: 2 }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>{n.desc}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      {n.time || n.created_at}
                      {n.category && (
                        <span style={{ marginLeft: 8, padding: '1px 6px',
                          background: 'var(--bg)', borderRadius: 6,
                          border: '1px solid var(--border)' }}>
                          {n.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    {n.unread && (
                      <div style={{ width: 8, height: 8, background: 'var(--blue)', borderRadius: '50%' }} />
                    )}
                    <button className="btn btn-ghost btn-sm" title="Dismiss"
                      style={{ fontSize: 11, padding: '2px 6px', opacity: 0.5 }}
                      onClick={e => handleDelete(n, e)}>
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
