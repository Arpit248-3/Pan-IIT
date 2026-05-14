import { useState } from 'react'
import { useSettings } from '../context/SettingsContext'
import { API_BASE } from '../config'
import { toast } from 'sonner'
import userService from '../services/userService'

// ── Skeleton loader ────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 6, borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 11, width: '60%', borderRadius: 4 }} />
      </div>
      <div className="skeleton" style={{ width: 44, height: 24, borderRadius: 12 }} />
    </div>
  )
}

// ── Controlled Toggle ──────────────────────────────────────────
const Toggle = ({ checked, onChange, disabled }) => (
  <label className="toggle" style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
    <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
    <span className="toggle-slider" />
  </label>
)

// ── Unsaved indicator ──────────────────────────────────────────
function UnsavedBadge({ show }) {
  if (!show) return null
  return (
    <span style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 4 }}>
      ● Unsaved changes
    </span>
  )
}

export default function Settings({ currentUser }) {
  const {
    settings, loading, saveLoading, dirty,
    updateSetting, updateSettings, saveSettings, resetSettings
  } = useSettings()

  const [tab, setTab] = useState('general')

  // ── Password change state ──────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwLoading, setPwLoading]             = useState(false)

  const tabs = [
    { id: 'general',       label: '⚙️ General'         },
    { id: 'notifications', label: '🔔 Notifications'   },
    { id: 'ai',            label: '🧠 AI Configuration' },
    { id: 'security',      label: '🔒 Security'         },
  ]

  const handleSave = () => saveSettings()

  const handleReset = () => {
    if (!window.confirm('Reset all settings on this tab to saved values?')) return
    resetSettings()
  }

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword !== confirmPassword)
      return toast.error('Passwords do not match')
    if (newPassword.length < 8)
      return toast.error('Password must be at least 8 characters')
    if (!currentUser?.id)
      return toast.error('Not logged in')

    setPwLoading(true)
    try {
      await userService.changePassword({
        user_id: currentUser.id,
        current_password: currentPassword,
        new_password: newPassword,
      })
      toast.success('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      // Error already toasted by api.js
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <>
      {/* ── Tab Navigation ── */}
      <div className="tabs settings-tabs">
        {tabs.map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      {/* ── GENERAL ── */}
      {tab === 'general' && (
        <div className="card"><div className="card-body">
          <h3 className="settings-section-title">Organization Profile</h3>
          {loading ? (
            <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Organization Name</label>
                <input className="form-input" value={settings.org_name}
                  onChange={e => updateSetting('org_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Email</label>
                <input className="form-input" type="email" value={settings.contact_email}
                  onChange={e => updateSetting('contact_email', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Timezone</label>
                <select className="form-input" value={settings.timezone}
                  onChange={e => updateSetting('timezone', e.target.value)}>
                  <option>Asia/Kolkata (UTC+5:30)</option>
                  <option>America/New_York (UTC-5)</option>
                  <option>Europe/London (UTC+0)</option>
                  <option>Asia/Tokyo (UTC+9)</option>
                </select>
              </div>

              <h3 className="settings-section-title" style={{ marginTop: 24 }}>Display Preferences</h3>
              {[
                { key: 'dark_mode',      label: 'Dark Mode',        desc: 'Enable dark theme across the dashboard' },
                { key: 'compact_tables', label: 'Compact Tables',   desc: 'Reduce row padding in data tables' },
                { key: 'show_kpi_trends',label: 'Show KPI Trends',  desc: 'Display trend arrows on KPI cards' },
              ].map(row => (
                <div className="settings-row" key={row.key}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{row.desc}</div>
                  </div>
                  <Toggle checked={settings[row.key]}
                    onChange={e => updateSetting(row.key, e.target.checked)} />
                </div>
              ))}

              <div className="settings-actions">
                <UnsavedBadge show={dirty} />
                <button className="btn btn-ghost" onClick={handleReset}>Reset</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saveLoading}>
                  {saveLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </>
          )}
        </div></div>
      )}

      {/* ── NOTIFICATIONS ── */}
      {tab === 'notifications' && (
        <div className="card"><div className="card-body">
          <h3 className="settings-section-title">Email Notifications</h3>
          {loading ? (
            <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
          ) : (
            <>
              {[
                { key: 'notif_critical_alerts',  label: 'Critical Alerts',   desc: 'Immediate email for critical signals' },
                { key: 'notif_daily_digest',     label: 'Daily Digest',      desc: 'Summary of daily activity' },
                { key: 'notif_report_reminders', label: 'Report Reminders',  desc: 'Notify before report deadlines' },
                { key: 'notif_sentiment_spike',  label: 'Sentiment Spike',   desc: 'Alert on unusual sentiment changes' },
                { key: 'notif_weekly_summary',   label: 'Weekly Summary',    desc: 'Weekly pharmacovigilance digest' },
              ].map(row => (
                <div className="settings-row" key={row.key}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{row.desc}</div>
                  </div>
                  <Toggle checked={settings[row.key]}
                    onChange={e => updateSetting(row.key, e.target.checked)} />
                </div>
              ))}

              <h3 className="settings-section-title" style={{ marginTop: 24 }}>Webhook Configuration</h3>
              <div className="form-group">
                <label className="form-label">Webhook URL (for critical alerts)</label>
                <input className="form-input" placeholder="https://hooks.slack.com/services/..."
                  value={settings.webhook_url}
                  onChange={e => updateSetting('webhook_url', e.target.value)} />
              </div>

              <div className="settings-actions">
                <UnsavedBadge show={dirty} />
                <button className="btn btn-primary" onClick={handleSave} disabled={saveLoading}>
                  {saveLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div></div>
      )}

      {/* ── AI CONFIGURATION ── */}
      {tab === 'ai' && (
        <div className="card"><div className="card-body">
          <h3 className="settings-section-title">AI Model Settings</h3>
          {loading ? (
            <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">LLM Model</label>
                <select className="form-input" value={settings.llm_model}
                  onChange={e => updateSetting('llm_model', e.target.value)}>
                  <option value="llama3.2:1b">llama3.2:1b (Fast — CPU inference)</option>
                  <option value="llama3.2:3b">llama3.2:3b (Balanced)</option>
                  <option value="phi3">phi3 (Gatekeeper)</option>
                </select>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Current: <code>{settings.llm_model}</code> via Ollama · API: {API_BASE}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Detection Sensitivity</label>
                <select className="form-input" value={settings.sensitivity}
                  onChange={e => updateSetting('sensitivity', e.target.value)}>
                  <option>High</option>
                  <option>Medium (Balanced)</option>
                  <option>Low</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">PRR Threshold</label>
                  <input className="form-input" type="number" value={settings.prr_threshold}
                    step="0.1" min="1" max="10"
                    onChange={e => updateSetting('prr_threshold', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Min Case Count</label>
                  <input className="form-input" type="number" value={settings.min_case_count}
                    min="1" max="50"
                    onChange={e => updateSetting('min_case_count', Number(e.target.value))} />
                </div>
              </div>
              {[
                { key: 'auto_signal',     label: 'Auto-Signal Detection', desc: 'Automatically flag new signals' },
                { key: 'sentiment_ai',    label: 'Sentiment Analysis',    desc: 'AI-powered sentiment classification' },
                { key: 'duplicate_detect',label: 'Duplicate Detection',   desc: 'Vector-based duplicate post detection' },
              ].map(row => (
                <div className="settings-row" key={row.key}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{row.desc}</div>
                  </div>
                  <Toggle checked={settings[row.key]}
                    onChange={e => updateSetting(row.key, e.target.checked)} />
                </div>
              ))}
              <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 12,
                fontSize: 12, color: 'var(--text2)', marginTop: 16 }}>
                🧠 AI Pipeline: Guard → Generator → Critic → Doctor (LangGraph + Ollama)<br />
                PRR threshold: <strong>{settings.prr_threshold}</strong> · Min cases: <strong>{settings.min_case_count}</strong> · Sensitivity: <strong>{settings.sensitivity}</strong>
              </div>
              <div className="settings-actions">
                <UnsavedBadge show={dirty} />
                <button className="btn btn-primary" onClick={handleSave} disabled={saveLoading}>
                  {saveLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div></div>
      )}

      {/* ── SECURITY ── */}
      {tab === 'security' && (
        <div className="card"><div className="card-body">
          <h3 className="settings-section-title">Security Settings</h3>
          {loading ? (
            <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
          ) : (
            <>
              {[
                { key: 'two_fa',           label: 'Two-Factor Auth',  desc: 'Require 2FA for all users' },
                { key: 'audit_log_enabled',label: 'Audit Logging',    desc: 'Log all user actions to audit trail' },
                { key: 'ip_whitelist',     label: 'IP Whitelisting',  desc: 'Restrict dashboard access by IP' },
              ].map(row => (
                <div className="settings-row" key={row.key}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{row.desc}</div>
                  </div>
                  <Toggle checked={settings[row.key]}
                    onChange={e => updateSetting(row.key, e.target.checked)} />
                </div>
              ))}
              <div className="settings-row">
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>Session Timeout</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Auto-logout after inactivity</div>
                </div>
                <select className="filter-select" value={settings.session_timeout}
                  onChange={e => updateSetting('session_timeout', e.target.value)}>
                  <option>15 minutes</option>
                  <option>30 minutes</option>
                  <option>1 hour</option>
                  <option>4 hours</option>
                </select>
              </div>

              <div className="settings-actions">
                <UnsavedBadge show={dirty} />
                <button className="btn btn-primary" onClick={handleSave} disabled={saveLoading}>
                  {saveLoading ? 'Saving...' : 'Save Security Settings'}
                </button>
              </div>

              <h3 className="settings-section-title" style={{ marginTop: 28 }}>Change Password</h3>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input className="form-input" type="password" placeholder="Enter current password"
                  value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-input" type="password" placeholder="Minimum 8 characters"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input className="form-input" type="password" placeholder="Re-enter new password"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>❌ Passwords do not match</div>
              )}
              {newPassword && confirmPassword && newPassword === confirmPassword && newPassword.length >= 8 && (
                <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 8 }}>✅ Passwords match</div>
              )}
              <div className="settings-actions">
                <button className="btn btn-primary" onClick={handlePasswordChange} disabled={pwLoading}>
                  {pwLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </>
          )}
        </div></div>
      )}
    </>
  )
}
