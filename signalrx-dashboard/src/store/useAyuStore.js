/**
 * AyuScout V2 — Centralized Zustand Store
 * =========================================
 * Single source of truth for all AI analysis data.
 * ALL tabs subscribe to this store — no local state duplication.
 *
 * Architecture:
 *   Dashboard → setLatestAnalysis() → store updates → all tabs re-render
 *   Any tab → reads from store → always up to date
 *
 * This eliminates:
 *   - Stale closures from unmounted tab components
 *   - Race conditions from independent fetch cycles
 *   - Cache inconsistency between tabs
 *   - Manual refresh requirements
 */
import { create } from 'zustand'
import { API_BASE } from '../config'
import { getFDAReportLabel } from '../utils/fdaStatus'

// ── Canonical schema normalizer ──────────────────────────────────────────────
// Ensures every piece of data coming from the backend is normalized into
// a consistent shape before being stored. No tab ever parses raw API responses.
export function normalizeIntelligenceRecord(r) {
  if (!r || typeof r !== 'object') return null
  return {
    id:              r.id || null,
    drug:            r.drug || r.drug_keyword || 'Unknown',
    event:           r.event || r.adverse_event || 'Unknown',
    meddra_term:     r.meddra_term || r.event || 'Unknown',
    causality:       r.causality || 'Unassessable',
    confidence:      r.confidence || '0%',
    severity:        r.severity || 'Unknown',
    sentiment:       r.sentiment || 'Unknown',
    emotion:         r.emotion || '',
    reasoning:       r.reasoning || '',
    pubmed_link:     r.pubmed_link || r.pubmed_search_link || '',
    who_umc_details: r.who_umc_details || {},
    ddi_risk_level:  r.ddi_risk_level || 'None',
    alt_cause:       r.alternative_cause_likely || false,
    intake_id:       r.intake_id || null,
    created_at:      r.created_at || null,
    e2b_available:   r.e2b_available || false,
    // ── FDA Evidence (null-safe) ──────────────────────────────
    fdaAnalysis:     r.fdaAnalysis || null,
  }
}

export function normalizeIntakeRecord(r) {
  if (!r || typeof r !== 'object') return null
  return {
    id:                  r.id || null,
    content:             r.content || r.raw_text || '',
    platform:            r.platform || 'Unknown',
    drug_keyword:        r.drug_keyword || 'Unknown',
    drug:                r.drug || r.drug_keyword || 'Unknown',
    event:               r.event || '',
    sentiment:           r.sentiment || 'Unknown',
    emotion:             r.emotion || '',
    status:              r.status || 'pending',
    has_analysis:        r.has_analysis || r.status === 'analyzed',
    pii_masked:          r.pii_masked || false,
    pii_types_detected:  r.pii_types_detected || [],
    intelligence_id:     r.intelligence_id || null,
    e2b_available:       r.e2b_available || false,
    created_at:          r.created_at || null,
    // ── FDA Evidence (null-safe) ──────────────────────────────
    fdaAnalysis:         r.fdaAnalysis || null,
  }
}

export function normalizeNotification(n) {
  if (!n || typeof n !== 'object') return null
  return {
    id:         n.id || null,
    title:      n.title || '',
    desc:       n.desc || '',
    icon:       n.icon || 'info',
    type:       n.type || 'info',
    category:   n.category || '',
    priority:   n.priority || 'normal',
    unread:     n.unread !== false,
    created_at: n.created_at || null,
  }
}

export function normalizeReport(r) {
  if (!r || typeof r !== 'object') return null
  return {
    id:          r.id || null,
    record_id:   r.record_id || null,
    title:       r.title || 'Untitled',
    type:        r.type || 'Signal',
    drug:        r.drug || 'Unknown',
    event:       r.event || 'Unknown',
    severity:    r.severity || 'Unknown',
    causality:   r.causality || 'Unassessable',
    confidence:  r.confidence || '0%',
    sentiment:   r.sentiment || 'Unknown',
    emotion:     r.emotion || '',
    pii_masked:  r.pii_masked || false,
    pii_types:   r.pii_types_detected || [],
    status:      r.status || 'pending',
    statusColor: r.statusColor || 'neutral',
    author:      r.author || 'AyuScout V2 AI',
    e2b_available: r.e2b_available || false,
    created_at:  r.created_at || null,
    // ── FDA Evidence ─────────────────────────────────────────────
    fdaAnalysis: r.fdaAnalysis || null,   // full FDA result object (or null)
    // fdaLabel is ALWAYS derived from fdaAnalysis using canonical logic.
    // Never use the raw backend fdaLabel directly — it may be stale or wrong.
    fdaLabel:    getFDAReportLabel(r.fdaAnalysis || null),
  }
}

// ── Debug logger ─────────────────────────────────────────────────────────────
const DEBUG = import.meta.env.DEV
function log(action, data) {
  if (!DEBUG) return
  const ts = new Date().toISOString().split('T')[1].split('.')[0]
  console.group(`[AyuStore ${ts}] ${action}`)
  if (data) console.log(data)
  console.groupEnd()
}

// ── Store ────────────────────────────────────────────────────────────────────
const useAyuStore = create((set, get) => ({

  // ── Latest AI analysis result ──────────────────────────────────────────────
  latestAnalysis:   null,   // { ...normalizedResult, raw_api_response }
  analysisTs:       null,   // timestamp to detect race conditions
  analysisLoading:  false,

  // ── Vault data shared across all tabs ─────────────────────────────────────
  intakeRecords:         [],  // DataExplorer
  intelligenceRecords:   [],  // Alerts
  notifications:         [],  // Notifications
  reports:               [],  // Reports
  stats:                 null, // Dashboard + TrendAnalysis

  // ── Loading per section ────────────────────────────────────────────────────
  vaultLoading:   false,
  statsLoading:   false,
  notifsLoading:  false,

  // ── Last refresh timestamps ────────────────────────────────────────────────
  lastRefreshTs:  null,

  // ── Error state ───────────────────────────────────────────────────────────
  lastError: null,

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Called by Dashboard after successful analysis. */
  setLatestAnalysis: (apiResponse) => {
    if (!apiResponse) return
    const ts = Date.now()
    log('setLatestAnalysis', { drug: apiResponse.clinical_data?.suspect_drug, ts })
    set({ latestAnalysis: apiResponse, analysisTs: ts })
  },

  setAnalysisLoading: (v) => set({ analysisLoading: v }),

  // ── Fetch intake vault (DataExplorer) ─────────────────────────────────────
  refreshIntake: async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/intake-vault`)
      const data = await res.json()
      if (data.status === 'success') {
        const records = (data.records || []).map(normalizeIntakeRecord).filter(Boolean)
        log('refreshIntake', { count: records.length })
        set({ intakeRecords: records })
      }
    } catch (e) {
      log('refreshIntake ERROR', e.message)
      set({ lastError: e.message })
    }
  },

  // ── Fetch intelligence vault (Alerts) ─────────────────────────────────────
  refreshIntelligence: async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/alerts-feed`)
      const data = await res.json()
      if (data.status === 'success') {
        const records = (data.records || []).map(normalizeIntelligenceRecord).filter(Boolean)
        log('refreshIntelligence', { count: records.length })
        set({ intelligenceRecords: records })
      }
    } catch (e) {
      log('refreshIntelligence ERROR', e.message)
    }
  },

  // ── Fetch notifications ────────────────────────────────────────────────────
  refreshNotifications: async (userId) => {
    set({ notifsLoading: true })
    try {
      const url = userId
        ? `${API_BASE}/api/notifications?user_id=${userId}`
        : `${API_BASE}/api/notifications`
      const res  = await fetch(url)
      const data = await res.json()
      const notifs = (data.notifications || []).map(normalizeNotification).filter(Boolean)
      log('refreshNotifications', { count: notifs.length })
      set({ notifications: notifs })
    } catch (e) {
      log('refreshNotifications ERROR', e.message)
    } finally {
      set({ notifsLoading: false })
    }
  },

  // ── Fetch reports ─────────────────────────────────────────────────────────
  refreshReports: async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/reports`)
      const data = await res.json()
      if (data.status === 'success') {
        const records = (data.reports || []).map(normalizeReport).filter(Boolean)
        log('refreshReports', { count: records.length })
        set({ reports: records })
      }
    } catch (e) {
      log('refreshReports ERROR', e.message)
    }
  },

  // ── Fetch dashboard stats ─────────────────────────────────────────────────
  refreshStats: async () => {
    set({ statsLoading: true })
    try {
      const res  = await fetch(`${API_BASE}/api/dashboard-stats`)
      const data = await res.json()
      if (data.status === 'success') {
        log('refreshStats', { total: data.total_records })
        set({ stats: data })
      }
    } catch (e) {
      log('refreshStats ERROR', e.message)
    } finally {
      set({ statsLoading: false })
    }
  },

  // ── Refresh EVERYTHING in parallel ────────────────────────────────────────
  // Called after every analysis to ensure ALL tabs are instantly up to date.
  refreshAll: async (userId) => {
    const ts = Date.now()
    log('refreshAll START', { userId, ts })
    set({ vaultLoading: true, lastRefreshTs: ts })
    const store = get()
    await Promise.allSettled([
      store.refreshIntake(),
      store.refreshIntelligence(),
      store.refreshNotifications(userId),
      store.refreshReports(),
      store.refreshStats(),
    ])
    set({ vaultLoading: false })
    log('refreshAll COMPLETE', { ms: Date.now() - ts })
  },

  // ── Optimistic notification mark-read ─────────────────────────────────────
  markNotificationRead: (id) => {
    set(state => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, unread: false } : n
      )
    }))
  },

  markAllNotificationsRead: () => {
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, unread: false }))
    }))
  },

  // ── Background auto-poll (30s) ────────────────────────────────────────────
  // Call startAutoRefresh(userId) once from App root to keep all tabs live.
  _pollTimer: null,

  startAutoRefresh: (userId) => {
    const store = get()
    if (store._pollTimer) return          // already running
    store.refreshAll(userId)              // immediate first fetch
    const timer = setInterval(() => {
      get().refreshAll(userId)
    }, 30_000)
    set({ _pollTimer: timer })
    log('startAutoRefresh', { interval: '30s', userId })
  },

  stopAutoRefresh: () => {
    const { _pollTimer } = get()
    if (_pollTimer) {
      clearInterval(_pollTimer)
      set({ _pollTimer: null })
      log('stopAutoRefresh', {})
    }
  },

}))

export default useAyuStore
