import { useState } from 'react'
import { API_BASE } from '../config'


// ── Controlled Toggle ────────────────────────────────────────
const Toggle = ({ checked, onChange }) => (
  <label className="toggle" style={{ cursor: 'pointer' }}>
    <input type="checkbox" checked={checked} onChange={onChange} />
    <span className="toggle-slider" />
  </label>
)

// ── Saved indicator ──────────────────────────────────────────
function SavedBadge({ show }) {
  if (!show) return null
  return (
    <span style={{
      fontSize: 12, color: 'var(--success)', fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 4, animation: 'fadeIn 0.3s'
    }}>
      ✅ Saved successfully!
    </span>
  )
}

export default function Settings() {
  const [tab, setTab] = useState('general')
  const [saved, setSaved] = useState(false)

  // ── General Settings State ───────────────────────────────────
  const [orgName, setOrgName] = useState('SignalRx Pharma Ltd.')
  const [contactEmail, setContactEmail] = useState('admin@signalrx.ai')
  const [timezone, setTimezone] = useState('Asia/Kolkata (UTC+5:30)')
  const [darkMode, setDarkMode] = useState(false)
  const [compactTables, setCompactTables] = useState(true)
  const [showKpiTrends, setShowKpiTrends] = useState(true)

  // ── Notification Settings State ──────────────────────────────
  const [criticalAlerts, setCriticalAlerts] = useState(true)
  const [dailyDigest, setDailyDigest] = useState(true)
  const [reportReminders, setReportReminders] = useState(true)
  const [sentimentSpike, setSentimentSpike] = useState(true)
  const [weeklySummary, setWeeklySummary] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')

  // ── AI Settings State ────────────────────────────────────────
  const [sensitivity, setSensitivity] = useState('High')
  const [prrThreshold, setPrrThreshold] = useState(2.0)
  const [minCaseCount, setMinCaseCount] = useState(3)
  const [autoSignal, setAutoSignal] = useState(true)
  const [sentimentAI, setSentimentAI] = useState(true)
  const [duplicateDetect, setDuplicateDetect] = useState(true)
  const [llmModel, setLlmModel] = useState('llama3.2:1b')

  // ── Security Settings State ──────────────────────────────────
  const [twoFA, setTwoFA] = useState(true)
  const [sessionTimeout, setSessionTimeout] = useState('30 minutes')
  const [auditLog, setAuditLog] = useState(true)
  const [ipWhitelist, setIpWhitelist] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const tabs = [
    { id: 'general',       label: '⚙️ General'         },
    { id: 'notifications', label: '🔔 Notifications'   },
    { id: 'ai',            label: '🧠 AI Configuration' },
    { id: 'security',      label: '🔒 Security'         },
  ]

  const handleSave = (extraFn) => {
    if (extraFn) extraFn()
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleReset = () => {
    if (!window.confirm('Reset all settings on this tab to defaults?')) return
    setSaved(false)
  }

  return (
    <>
      <div className="tabs">
        {tabs.map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => { setTab(t.id); setSaved(false) }}>{t.label}</div>
        ))}
      </div>

      {/* ── GENERAL ── */}
      {tab === 'general' && (
        <div className="card"><div className="card-body">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            Organization Profile
          </h3>
          <div className="form-group">
            <label className="form-label">Organization Name</label>
            <input className="form-input" value={orgName} onChange={e => setOrgName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Contact Email</label>
            <input className="form-input" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Timezone</label>
            <select className="form-input" value={timezone} onChange={e => setTimezone(e.target.value)}>
              <option>Asia/Kolkata (UTC+5:30)</option>
              <option>America/New_York (UTC-5)</option>
              <option>Europe/London (UTC+0)</option>
              <option>Asia/Tokyo (UTC+9)</option>
            </select>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '24px 0 16px', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            Display Preferences
          </h3>
          <div className="settings-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Dark Mode</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Enable dark theme across the dashboard</div>
            </div>
            <Toggle checked={darkMode} onChange={e => setDarkMode(e.target.checked)} />
          </div>
          <div className="settings-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Compact Tables</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Reduce row padding in data tables</div>
            </div>
            <Toggle checked={compactTables} onChange={e => setCompactTables(e.target.checked)} />
          </div>
          <div className="settings-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Show KPI Trends</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Display trend arrows on KPI cards</div>
            </div>
            <Toggle checked={showKpiTrends} onChange={e => setShowKpiTrends(e.target.checked)} />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24, alignItems: 'center' }}>
            <SavedBadge show={saved} />
            <button className="btn btn-ghost" onClick={() => {
              setOrgName('SignalRx Pharma Ltd.')
              setContactEmail('admin@signalrx.ai')
              setTimezone('Asia/Kolkata (UTC+5:30)')
              setDarkMode(false)
              setCompactTables(true)
              setShowKpiTrends(true)
              setSaved(false)
            }}>Reset</button>
            <button className="btn btn-primary" onClick={() => handleSave()}>Save Changes</button>
          </div>
        </div></div>
      )}

      {/* ── NOTIFICATIONS ── */}
      {tab === 'notifications' && (
        <div className="card"><div className="card-body">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            Email Notifications
          </h3>
          {[
            { label: 'Critical Alerts',     desc: 'Immediate email for critical signals',        val: criticalAlerts,   set: setCriticalAlerts  },
            { label: 'Daily Digest',        desc: 'Summary of daily activity',                   val: dailyDigest,      set: setDailyDigest     },
            { label: 'Report Reminders',    desc: 'Notify before report deadlines',              val: reportReminders,  set: setReportReminders },
            { label: 'Sentiment Spike',     desc: 'Alert on unusual sentiment changes',          val: sentimentSpike,   set: setSentimentSpike  },
            { label: 'Weekly Summary',      desc: 'Weekly pharmacovigilance digest',             val: weeklySummary,    set: setWeeklySummary   },
          ].map(row => (
            <div className="settings-row" key={row.label}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{row.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{row.desc}</div>
              </div>
              <Toggle checked={row.val} onChange={e => row.set(e.target.checked)} />
            </div>
          ))}

          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '24px 0 16px', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            Webhook Configuration
          </h3>
          <div className="form-group">
            <label className="form-label">Webhook URL (for critical alerts)</label>
            <input className="form-input" placeholder="https://hooks.slack.com/services/..." value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, alignItems: 'center' }}>
            <SavedBadge show={saved} />
            <button className="btn btn-primary" onClick={() => handleSave()}>Save</button>
          </div>
        </div></div>
      )}

      {/* ── AI CONFIGURATION ── */}
      {tab === 'ai' && (
        <div className="card"><div className="card-body">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            AI Model Settings
          </h3>
          <div className="form-group">
            <label className="form-label">LLM Model</label>
            <select className="form-input" value={llmModel} onChange={e => setLlmModel(e.target.value)}>
              <option value="llama3.2:1b">llama3.2:1b (Fast — CPU inference)</option>
              <option value="llama3.2:3b">llama3.2:3b (Balanced)</option>
              <option value="phi3">phi3 (Gatekeeper)</option>
            </select>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Current: <code>{llmModel}</code> via Ollama · API: {API_BASE}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Detection Sensitivity</label>
            <select className="form-input" value={sensitivity} onChange={e => setSensitivity(e.target.value)}>
              <option>High</option>
              <option>Medium (Balanced)</option>
              <option>Low</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">PRR Threshold</label>
              <input className="form-input" type="number" value={prrThreshold} step="0.1" min="1" max="10"
                onChange={e => setPrrThreshold(Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Min Case Count</label>
              <input className="form-input" type="number" value={minCaseCount} min="1" max="50"
                onChange={e => setMinCaseCount(Number(e.target.value))} />
            </div>
          </div>
          {[
            { label: 'Auto-Signal Detection',  desc: 'Automatically flag new signals',               val: autoSignal,      set: setAutoSignal     },
            { label: 'Sentiment Analysis',     desc: 'AI-powered sentiment classification',           val: sentimentAI,     set: setSentimentAI    },
            { label: 'Duplicate Detection',    desc: 'Vector-based duplicate post detection',         val: duplicateDetect, set: setDuplicateDetect },
          ].map(row => (
            <div className="settings-row" key={row.label}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{row.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{row.desc}</div>
              </div>
              <Toggle checked={row.val} onChange={e => row.set(e.target.checked)} />
            </div>
          ))}
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text2)', marginTop: 16 }}>
            🧠 AI Pipeline: Guard → Generator → Critic → Doctor (LangGraph + Ollama)<br />
            PRR threshold: <strong>{prrThreshold}</strong> · Min cases: <strong>{minCaseCount}</strong> · Sensitivity: <strong>{sensitivity}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, alignItems: 'center' }}>
            <SavedBadge show={saved} />
            <button className="btn btn-primary" onClick={() => handleSave()}>Save</button>
          </div>
        </div></div>
      )}

      {/* ── SECURITY ── */}
      {tab === 'security' && (
        <div className="card"><div className="card-body">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            Security Settings
          </h3>
          {[
            { label: 'Two-Factor Auth',   desc: 'Require 2FA for all users',         val: twoFA,       set: setTwoFA      },
            { label: 'Audit Logging',     desc: 'Log all user actions',              val: auditLog,    set: setAuditLog   },
            { label: 'IP Whitelisting',   desc: 'Restrict dashboard access by IP',  val: ipWhitelist, set: setIpWhitelist},
          ].map(row => (
            <div className="settings-row" key={row.label}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{row.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{row.desc}</div>
              </div>
              <Toggle checked={row.val} onChange={e => row.set(e.target.checked)} />
            </div>
          ))}
          <div className="settings-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Session Timeout</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Auto-logout after inactivity</div>
            </div>
            <select className="filter-select" value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)}>
              <option>15 minutes</option>
              <option>30 minutes</option>
              <option>1 hour</option>
              <option>4 hours</option>
            </select>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '24px 0 16px', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            Change Password
          </h3>
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

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, alignItems: 'center' }}>
            <SavedBadge show={saved} />
            <button className="btn btn-primary" onClick={() => {
              if (newPassword && newPassword !== confirmPassword) return alert('Passwords do not match')
              if (newPassword && newPassword.length < 8) return alert('Password must be at least 8 characters')
              handleSave(() => {
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
              })
            }}>Save</button>
          </div>
        </div></div>
      )}
    </>
  )
}
