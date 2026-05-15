/**
 * ProjectDetails.jsx — Full project details page
 * Sections: Overview · Live Progress · Scraper Activity · Keyword Visualization
 */
import { useState, useEffect, useCallback } from 'react'
import {
  MdArrowBack, MdEdit, MdDelete, MdRefresh, MdPlayArrow, MdPause,
  MdCheckCircle, MdBolt, MdOpenInNew, MdInfoOutline,
} from 'react-icons/md'
import { SiTwitter } from 'react-icons/si'
import { API_BASE } from '../config'

const STATUS_CONFIG = {
  Active:     { color: '#10B981', bg: 'rgba(16,185,129,.12)' },
  Monitoring: { color: '#3B82F6', bg: 'rgba(59,130,246,.12)' },
  Paused:     { color: '#F59E0B', bg: 'rgba(245,158,11,.12)' },
  Completed:  { color: '#8B5CF6', bg: 'rgba(139,92,246,.12)' },
  Failed:     { color: '#EF4444', bg: 'rgba(239,68,68,.12)'  },
}
const STATUS_OPTIONS = ['Active', 'Monitoring', 'Paused', 'Completed', 'Failed']

function stColor(s) { return (STATUS_CONFIG[s] || STATUS_CONFIG.Active).color }
function stBg(s)    { return (STATUS_CONFIG[s] || STATUS_CONFIG.Active).bg }

function ProgressBar({ value, status }) {
  const c = stColor(status)
  return (
    <div style={{ height: 10, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.min(value ?? 0, 100)}%`,
        background: `linear-gradient(90deg, ${c}, ${c}bb)`,
        borderRadius: 99, transition: 'width .7s cubic-bezier(.4,0,.2,1)',
        boxShadow: `0 0 10px ${c}55`,
      }} />
    </div>
  )
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 100,
    }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--text)' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function KeywordBadge({ keyword, color, active, matched, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={() => onClick(keyword)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${color}`,
        background: active || hov ? `${color}22` : 'transparent',
        color: color, cursor: 'pointer', fontSize: 12, fontWeight: 700,
        transition: 'all .15s', boxShadow: active ? `0 0 8px ${color}44` : 'none',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
      }} />
      {keyword}
      {matched > 0 && (
        <span style={{
          marginLeft: 2, background: color, color: '#fff', borderRadius: 99,
          fontSize: 9, fontWeight: 800, padding: '1px 5px',
        }}>{matched}</span>
      )}
    </button>
  )
}

export default function ProjectDetails({ projectId, currentUser, onNavigate }) {
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeKw, setActiveKw] = useState(null)
  const [editingStatus, setEditingStatus] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchProject = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}`)
      const data = await res.json()
      if (data.status === 'success') setProject(data.project)
    } catch (e) { console.error('[ProjectDetails]', e) }
    finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchProject() }, [fetchProject])

  // Auto-refresh every 20s
  useEffect(() => {
    const t = setInterval(fetchProject, 20_000)
    return () => clearInterval(t)
  }, [fetchProject])

  const isOwner = !project?.owner_id || project?.owner_id === currentUser?.id

  const handleStatusUpdate = async () => {
    if (!newStatus || !project) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        setProject(data.project)
        setEditingStatus(false)
      }
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!project) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_BASE}/api/projects/${project.id}`, { method: 'DELETE' })
      if (res.ok) onNavigate?.('projects')
    } finally { setDeleting(false) }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <span className="login-spinner" style={{ width: 28, height: 28 }} />
      </div>
    )
  }

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <p style={{ color: 'var(--muted)' }}>Project not found.</p>
        <button className="btn btn-ghost" style={{ marginTop: 16 }}
          onClick={() => onNavigate?.('projects')}>← Back to Projects</button>
      </div>
    )
  }

  const kws = project.keywords ?? []
  const colors = project.keyword_colors ?? []
  const p = project.progress ?? 0

  // Progress explanation
  const progressWhy = () => {
    const t = project.total_targets ?? 0
    const pr = project.processed_targets ?? 0
    const m = project.matched_posts ?? 0
    const f = project.failed_fetches ?? 0
    const r = project.remaining ?? 0
    if (t === 0) return 'No Twitter posts have been fetched for this project yet.'
    return `${pr} of ${t} Twitter posts scanned · ${m} matched keywords · ${f} failed · ${r} remaining`
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Back nav */}
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 20, gap: 6, display: 'inline-flex', alignItems: 'center' }}
        onClick={() => onNavigate?.('projects')}>
        <MdArrowBack size={16} /> Back to Projects
      </button>

      {/* ── SECTION A: PROJECT OVERVIEW ─────────────────────────── */}
      <div className="card" style={{ marginBottom: 20, borderRadius: 14 }}>
        <div className="card-header" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{project.name}</h2>
            {project.agentic_enabled && (
              <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                background: 'rgba(139,92,246,.12)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,.25)',
                display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <MdBolt size={10} /> AI Agent
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button className="btn btn-ghost btn-sm" onClick={fetchProject} title="Refresh"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <MdRefresh size={14} />
            </button>
            {isOwner && (
              <button className="btn btn-ghost btn-sm" title="Delete"
                onClick={() => setConfirmDelete(true)}
                style={{ display: 'inline-flex', alignItems: 'center', color: '#EF4444' }}>
                <MdDelete size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="card-body" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Source</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                <SiTwitter style={{ color: '#1DA1F2' }} /> Twitter
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
              {editingStatus && isOwner ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select className="form-input" style={{ fontSize: 12, padding: '3px 8px', height: 28 }}
                    value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={handleStatusUpdate} disabled={saving}>
                    {saving ? '…' : '✓'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingStatus(false)}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    color: stColor(project.status), background: stBg(project.status),
                  }}>{project.status}</span>
                  {isOwner && (
                    <button className="btn btn-ghost btn-sm" style={{ padding: 2 }}
                      onClick={() => { setNewStatus(project.status); setEditingStatus(true) }}>
                      <MdEdit size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Scraper</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{project.scraper_status || 'Idle'}</span>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>AI Agent</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{project.ai_agent_status || 'Standby'}</span>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Schedule</div>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{project.schedule_interval || 'Daily'}</span>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Created</div>
              <span style={{ fontSize: 12 }}>
                {project.created_at ? new Date(project.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Owner</div>
          <div style={{ fontSize: 13 }}>
            {project.owner_id
              ? (project.owner_id === currentUser?.id ? `${currentUser?.name} (You)` : `User #${project.owner_id}`)
              : 'All team members'}
          </div>
        </div>
      </div>

      {/* ── SECTION B: LIVE PROGRESS ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20, borderRadius: 14 }}>
        <div className="card-header"><span className="card-title">Live Progress</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: p === 100 ? '#8B5CF6' : 'var(--text)' }}>{p}%</span>
        </div>
        <div className="card-body">
          <div style={{ marginBottom: 12 }}>
            <ProgressBar value={p} status={project.status} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px',
            background: 'rgba(59,130,246,.05)', border: '1px solid rgba(59,130,246,.15)',
            borderRadius: 8, marginBottom: 16,
          }}>
            <MdInfoOutline size={15} style={{ color: '#3B82F6', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{progressWhy()}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <MetricCard label="Total Detected" value={project.total_targets ?? 0} sub="posts fetched" />
            <MetricCard label="Scanned" value={project.processed_targets ?? 0} sub="AI analyzed" color="#10B981" />
            <MetricCard label="Remaining" value={project.remaining ?? 0} sub="in queue" color="#F59E0B" />
            <MetricCard label="Matched" value={project.matched_posts ?? 0} sub="keyword hits" color="#3B82F6" />
            <MetricCard label="Failed" value={project.failed_fetches ?? 0} sub="fetch errors" color="#EF4444" />
            <MetricCard label="Success Rate" value={`${project.success_rate ?? 0}%`} sub="of processed" color="#8B5CF6" />
          </div>
        </div>
      </div>

      {/* ── SECTION C: SCRAPER ACTIVITY ──────────────────────────── */}
      <div className="card" style={{ marginBottom: 20, borderRadius: 14 }}>
        <div className="card-header"><span className="card-title">Scraper Activity</span></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 6,
                textTransform: 'uppercase' }}>Scraper Status</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{project.scraper_status || 'Idle'}</div>
            </div>
            <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 6,
                textTransform: 'uppercase' }}>Last Fetched</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {project.last_fetched_at
                  ? new Date(project.last_fetched_at).toLocaleString('en-IN')
                  : 'Never'}
              </div>
            </div>
          </div>
          <div style={{
            padding: '12px 16px', background: '#181825', borderRadius: 8,
            fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 12, color: '#cdd6f4',
          }}>
            {project.total_targets > 0 ? (
              <>
                <div style={{ color: '#89b4fa' }}>[MONITOR] Watching {kws.join(', ')} on Twitter</div>
                <div style={{ color: '#a6e3a1', marginTop: 4 }}>
                  [SUCCESS] {project.processed_targets}/{project.total_targets} posts processed
                </div>
                {project.failed_fetches > 0 && (
                  <div style={{ color: '#f38ba8', marginTop: 4 }}>
                    [WARN] {project.failed_fetches} fetch error{project.failed_fetches !== 1 ? 's' : ''}
                  </div>
                )}
                <div style={{ color: '#89dceb', marginTop: 4 }}>
                  [INFO] Schedule: {project.schedule_interval}
                </div>
              </>
            ) : (
              <div style={{ color: '#585b70' }}>
                [IDLE] No posts fetched yet. Run Twitter crawler to start monitoring.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION D: KEYWORD VISUALIZATION ────────────────────── */}
      <div className="card" style={{ borderRadius: 14 }}>
        <div className="card-header">
          <span className="card-title">Keyword Indicators</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{kws.length} keyword{kws.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="card-body">
          {kws.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>No keywords defined for this project.</p>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
                Click a keyword to filter — each indicator represents one monitored entity in the Twitter feed.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                {kws.map((kw, i) => (
                  <KeywordBadge
                    key={kw}
                    keyword={kw}
                    color={colors[i] || '#3B82F6'}
                    active={activeKw === kw}
                    matched={project.matched_posts ?? 0}
                    onClick={kw => setActiveKw(prev => prev === kw ? null : kw)}
                  />
                ))}
              </div>
              {activeKw && (
                <div style={{
                  padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 10,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                    Stats for: <span style={{ color: colors[kws.indexOf(activeKw)] }}>{activeKw}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
                    <span><strong style={{ color: 'var(--text)' }}>{project.matched_posts ?? 0}</strong> matched posts</span>
                    <span><strong style={{ color: 'var(--text)' }}>{project.total_targets ?? 0}</strong> total scanned</span>
                    <span><strong style={{ color: 'var(--text)' }}>{project.success_rate ?? 0}%</strong> success rate</span>
                    <span>Schedule: <strong style={{ color: 'var(--text)' }}>{project.schedule_interval}</strong></span>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
                    onClick={() => setActiveKw(null)}>
                    Clear filter
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 14, padding: 32,
            maxWidth: 420, width: '90%', border: '1px solid var(--border)',
            boxShadow: '0 24px 60px rgba(0,0,0,.4)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Delete Project?</div>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24, lineHeight: 1.6 }}>
              Permanently delete <strong>{project.name}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</button>
              <button className="btn btn-primary" style={{ background: '#EF4444', gap: 6 }}
                disabled={deleting} onClick={handleDelete}>
                {deleting ? <span className="login-spinner" style={{ width: 14, height: 14 }} /> : <MdDelete size={14} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
