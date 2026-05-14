/**
 * SettingsContext — global persistent settings state
 * Loads from backend on mount, propagates changes to body classes (dark mode, compact tables).
 * All components can read settings without prop drilling.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import settingsService from '../services/settingsService'

const SettingsContext = createContext(null)

// Default settings (mirrors AppSettings model defaults)
const DEFAULTS = {
  org_name:               'AyuScout Pharma',
  contact_email:          'admin@ayuscout.ai',
  timezone:               'Asia/Kolkata (UTC+5:30)',
  dark_mode:              false,
  compact_tables:         true,
  show_kpi_trends:        true,
  notif_critical_alerts:  true,
  notif_daily_digest:     true,
  notif_report_reminders: true,
  notif_sentiment_spike:  true,
  notif_weekly_summary:   false,
  webhook_url:            '',
  llm_model:              'llama3.2:1b',
  sensitivity:            'High',
  prr_threshold:          2.0,
  min_case_count:         3,
  auto_signal:            true,
  sentiment_ai:           true,
  duplicate_detect:       true,
  two_fa:                 true,
  session_timeout:        '30 minutes',
  audit_log_enabled:      true,
  ip_whitelist:           false,
}

// Apply global CSS effects based on settings
function applyBodyClasses(settings) {
  document.body.classList.toggle('dark-mode', !!settings.dark_mode)
  document.body.classList.toggle('compact-tables', !!settings.compact_tables)
  document.body.classList.toggle('hide-kpi-trends', !settings.show_kpi_trends)
}

export function SettingsProvider({ children, userId }) {
  const [settings, setSettings]     = useState(DEFAULTS)
  const [loading, setLoading]       = useState(false)
  const [dirty, setDirty]           = useState(false)  // unsaved changes flag
  const [saveLoading, setSaveLoading] = useState(false)

  // Load from backend on mount (or when userId changes)
  useEffect(() => {
    if (!userId) return
    setLoading(true)
    settingsService.get(userId)
      .then(data => {
        if (data?.settings) {
          setSettings({ ...DEFAULTS, ...data.settings })
          applyBodyClasses({ ...DEFAULTS, ...data.settings })
        }
      })
      .catch(() => {
        // Backend unavailable — use defaults, still functional
        applyBodyClasses(DEFAULTS)
      })
      .finally(() => setLoading(false))
  }, [userId])

  // Update a single setting locally (with immediate effect for display-related ones)
  const updateSetting = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      applyBodyClasses(next)
      return next
    })
    setDirty(true)
  }, [])

  // Batch update settings (for form resets)
  const updateSettings = useCallback((partialSettings) => {
    setSettings(prev => {
      const next = { ...prev, ...partialSettings }
      applyBodyClasses(next)
      return next
    })
    setDirty(true)
  }, [])

  // Save to backend
  const saveSettings = useCallback(async (overrideSettings) => {
    if (!userId) return
    setSaveLoading(true)
    try {
      const toSave = overrideSettings || settings
      const data = await settingsService.save(userId, toSave)
      if (data?.settings) {
        setSettings({ ...DEFAULTS, ...data.settings })
        applyBodyClasses({ ...DEFAULTS, ...data.settings })
      }
      setDirty(false)
      toast.success('Settings saved successfully')
      return true
    } catch {
      toast.error('Failed to save settings')
      return false
    } finally {
      setSaveLoading(false)
    }
  }, [userId, settings])

  // Reset to server-saved values
  const resetSettings = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const data = await settingsService.get(userId)
      if (data?.settings) {
        setSettings({ ...DEFAULTS, ...data.settings })
        applyBodyClasses({ ...DEFAULTS, ...data.settings })
        setDirty(false)
        toast.info('Settings reset to saved values')
      }
    } catch {
      toast.error('Failed to reset settings')
    } finally {
      setLoading(false)
    }
  }, [userId])

  return (
    <SettingsContext.Provider value={{
      settings,
      loading,
      saveLoading,
      dirty,
      updateSetting,
      updateSettings,
      saveSettings,
      resetSettings,
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}

export default SettingsContext
