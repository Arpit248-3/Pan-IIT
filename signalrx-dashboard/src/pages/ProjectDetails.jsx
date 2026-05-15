import { useState, useEffect, useCallback } from 'react'
import { MdArrowBack, MdEdit, MdDelete, MdRefresh, MdCheckCircle, MdBolt, MdInfoOutline, MdShield, MdOpenInNew } from 'react-icons/md'
import SourceIcon from '../components/SourceIcon'
import { API_BASE } from '../config'

const STATUS_CFG = {
  Active:     { c: '#10B981', bg: 'rgba(16,185,129,.12)' },
  Monitoring: { c: '#3B82F6', bg: 'rgba(59,130,246,.12)' },
  Paused:     { c: '#F59E0B', bg: 'rgba(245,158,11,.12)'  },
  Completed:  { c: '#8B5CF6', bg: 'rgba(139,92,246,.12)'  },
  Failed:     { c: '#EF4444', bg: 'rgba(239,68,68,.12)'   },
  Processing: { c: '#06B6D4', bg: 'rgba(6,182,212,.12)'   },
  Idle:       { c: '#6B7280', bg: 'rgba(107,114,128,.12)' },
}
const sc = s => STATUS_CFG[s] || STATUS_CFG.Idle

function ProgressBar({ value, status }) {
  const c = sc(status).c
  return (
    <div style={{ height: 10, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(value ?? 0, 100)}%`, borderRadius: 99,
        background: `linear-gradient(90deg,${c},${c}bb)`, transition: 'width .7s ease',
        boxShadow: `0 0 10px ${c}55` }} />
    </div>
  )
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '12px 16px', flex: 1, minWidth: 90 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--text)' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function ItemCard({ item, kwColors, keywords }) {
  const [expanded, setExpanded] = useState(false)
  const kwIdx = keywords.indexOf(item.keyword_matched)
  const kwColor = kwColors[kwIdx] || '#3B82F6'
  const sentColor = item.sentiment === 'positive' ? '#10B981' : item.sentiment === 'negative' ? '#EF4444' : '#6B7280'
  const statusColor = item.status === 'analyzed' ? '#10B981' : item.status === 'failed' ? '#EF4444' : '#F59E0B'

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '14px 16px', marginBottom: 10, transition: 'border-color .15s' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <SourceIcon source={item.platform} size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: 'var(--text)',
            overflow: expanded ? 'visible' : 'hidden',
            display: expanded ? 'block' : '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' }}>
            {item.content || <em style={{ color: 'var(--muted)' }}>No content preview</em>}
          </p>
          {item.pii_masked && (
            <span style={{ fontSize: 10, color: '#8B5CF6', display: 'inline-flex', alignItems: 'center',
              gap: 3, marginTop: 4 }}>
              <MdShield size={10} /> PII masked
            </span>
          )}
        </div>
        <button onClick={() => setExpanded(e => !e)}
          style={{ fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer',
            flexShrink: 0, padding: '2px 6px' }}>
          {expanded ? 'less' : 'more'}
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
          background: `${kwColor}22`, color: kwColor, border: `1px solid ${kwColor}44` }}>
          #{item.keyword_matched}
        </span>
        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600,
          background: `${statusColor}15`, color: statusColor }}>
          {item.status === 'analyzed' ? 'Processed' : item.status === 'failed' ? 'Failed' : 'Pending'}
        </span>
        {item.sentiment && (
          <span style={{ fontSize: 10, color: sentColor, fontWeight: 600 }}>
            {item.sentiment}
          </span>
        )}
        {item.event && (
          <span style={{ fontSize: 10, color: 'var(--text2)' }}>Event: <strong>{item.event}</strong></span>
        )}
        {item.severity && (
          <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 600 }}>{item.severity}</span>
        )}
        {item.created_at && (
          <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
            {new Date(item.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  )
}

export default function ProjectDetails({ projectId, currentUser, onNavigate }) {
  const [project, setProject]         = useState(null)
  const [scraper, setScraper]         = useState(null)
  const [items, setItems]             = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [activeKw, setActiveKw]       = useState(null)
  const [editingStatus, setEditingStatus] = useState(false)
  const [newStatus, setNewStatus]     = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [saving, setSaving]           = useState(false)

  const ownerId = currentUser?.id ?? null

  const ownerParam = ownerId ? `?owner_id=${ownerId}` : ''

  const fetchProject = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}${ownerParam}`)
      const data = await res.json()
      if (data.status === 'success') setProject(data.project)
      else setProject(null)
    } catch (e) { console.error(e); setProject(null) }
    finally { setLoading(false) }
  }, [projectId, ownerParam])

  const fetchScraper = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/scraper-status${ownerParam}`)
      const data = await res.json()
      if (data.status === 'success') setScraper(data.scraper)
    } catch (e) { console.error(e) }
  }, [projectId, ownerParam])

  const fetchItems = useCallback(async (kw = null) => {
    if (!projectId) return
    setItemsLoading(true)
    try {
      const params = new URLSearchParams()
      if (ownerId) params.set('owner_id', ownerId)
      params.set('limit', '50')
      if (kw) params.set('keyword', kw)
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/items?${params}`)
      const data = await res.json()
      if (data.status === 'success') setItems(data.items ?? [])
    } catch (e) { console.error(e) }
    finally { setItemsLoading(false) }
  }, [projectId, ownerId])

  useEffect(() => {
    fetchProject()
    fetchScraper()
    fetchItems(null)
  }, [fetchProject, fetchScraper, fetchItems])

  // Auto-refresh every 20s
  useEffect(() => {
    const t = setInterval(() => { fetchProject(); fetchScraper() }, 20_000)
    return () => clearInterval(t)
  }, [fetchProject, fetchScraper])

  const handleKwClick = (kw) => {
    const next = activeKw === kw ? null : kw
    setActiveKw(next)
    fetchItems(next)
  }

  const isOwner = !project?.owner_id || project?.owner_id === ownerId

  const handleStatusUpdate = async () => {
    if (!newStatus || !project) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, owner_id: ownerId }),
      })
      const data = await res.json()
      if (data.status === 'success') { setProject(data.project); setEditingStatus(false) }
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!project) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_BASE}/api/projects/${project.id}${ownerParam}`, { method: 'DELETE' })
      if (res.ok) onNavigate?.('projects')
    } finally { setDeleting(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
      <span className="login-spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  if (!project) return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
      <h3 style={{ marginBottom: 8 }}>Project not found or access denied</h3>
      <p style={{ color: 'var(--muted)', marginBottom: 20 }}>This project doesn't exist or belongs to another user.</p>
      <button className="btn btn-ghost" onClick={() => onNavigate?.('projects')}>← Back to Projects</button>
    </div>
  )

  const kws    = project.keywords ?? []
  const colors = project.keyword_colors ?? []
  const p      = project.progress ?? 0
  const src    = scraper || {}

  // Derive display values from real scraper data
  const scraperStatusDisplay = src.scraper_status || project.scraper_status || 'Idle'
  const lastFetchedDisplay = src.last_fetched_at
    ? new Date(src.last_fetched_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : (project.last_fetched_at
      ? new Date(project.last_fetched_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'Never')
  const currentTarget = src.current_target || kws.join(', ') || '—'
  const activeSource  = src.active_source || project.source_label || 'Twitter'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 20, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        onClick={() => onNavigate?.('projects')}>
        <MdArrowBack size={16} /> Back to Projects
      </button>

      {/* ── A: OVERVIEW ── */}
      <div className="card" style={{ marginBottom: 20, borderRadius: 14 }}>
        <div className="card-header" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{project.name}</h2>
            {project.agentic_enabled && (
              <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                background: 'rgba(139,92,246,.12)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,.25)',
                display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <MdBolt size={10} /> AI Agent
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { fetchProject(); fetchScraper(); fetchItems(activeKw) }}>
              <MdRefresh size={14} />
            </button>
            {isOwner && (
              <button className="btn btn-ghost btn-sm" style={{ color: '#EF4444' }}
                onClick={() => setConfirmDelete(true)}>
                <MdDelete size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="card-body" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Source</div>
              <SourceIcon source={project.source_label || activeSource} sourceType={project.source_type} size={14} showLabel />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
              {editingStatus && isOwner ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="form-input" style={{ fontSize: 12, padding: '3px 8px', height: 28 }}
                    value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                    {['Active','Monitoring','Paused','Completed','Failed'].map(s => <option key={s}>{s}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={handleStatusUpdate} disabled={saving}>{saving ? '…' : '✓'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingStatus(false)}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    color: sc(project.status).c, background: sc(project.status).bg }}>
                    {project.status}
                  </span>
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
        </div>
      </div>

      {/* ── B: LIVE PROGRESS ── */}
      <div className="card" style={{ marginBottom: 20, borderRadius: 14 }}>
        <div className="card-header">
          <span className="card-title">Live Progress</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: p === 100 ? '#8B5CF6' : 'var(--text)' }}>{p}%</span>
        </div>
        <div className="card-body">
          <div style={{ marginBottom: 12 }}><ProgressBar value={p} status={project.status} /></div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px',
            background: 'rgba(59,130,246,.05)', border: '1px solid rgba(59,130,246,.15)', borderRadius: 8, marginBottom: 16 }}>
            <MdInfoOutline size={15} style={{ color: '#3B82F6', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
              {project.total_targets > 0
                ? `${project.processed_targets} of ${project.total_targets} posts scanned · ${project.matched_posts} matched · ${project.failed_fetches} failed`
                : 'No posts fetched yet. Start Twitter crawling to populate this project.'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <MetricCard label="Total" value={project.total_targets ?? 0} sub="posts fetched" />
            <MetricCard label="Scanned" value={project.processed_targets ?? 0} color="#10B981" sub="AI analyzed" />
            <MetricCard label="Remaining" value={project.remaining ?? 0} color="#F59E0B" sub="in queue" />
            <MetricCard label="Matched" value={project.matched_posts ?? 0} color="#3B82F6" sub="keyword hits" />
            <MetricCard label="Failed" value={project.failed_fetches ?? 0} color="#EF4444" sub="fetch errors" />
            <MetricCard label="Success" value={`${project.success_rate ?? 0}%`} color="#8B5CF6" sub="rate" />
          </div>
        </div>
      </div>

      {/* ── C: SCRAPER ACTIVITY (fully dynamic) ── */}
      <div className="card" style={{ marginBottom: 20, borderRadius: 14 }}>
        <div className="card-header"><span className="card-title">Scraper Activity</span>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700,
            color: sc(scraperStatusDisplay).c, background: sc(scraperStatusDisplay).bg }}>
            {scraperStatusDisplay}
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
            {[
              ['Active Source',   <SourceIcon source={activeSource} sourceType={project.source_type} size={13} showLabel />],
              ['Scraper Status',  scraperStatusDisplay],
              ['Last Fetched',    lastFetchedDisplay],
              ['Current Target',  currentTarget],
              ['AI Agent',        src.ai_agent_status || project.ai_agent_status || 'Standby'],
              ['Schedule',        src.schedule_interval || project.schedule_interval || 'Daily'],
            ].map(([label, val]) => (
              <div key={label} style={{ padding: '10px 12px', background: 'var(--bg)',
                borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '.05em', marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Dynamic terminal log */}
          <div style={{ padding: '12px 16px', background: '#181825', borderRadius: 8,
            fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 11, color: '#cdd6f4' }}>
            {project.total_targets > 0 ? (
              <>
                <div style={{ color: '#89b4fa' }}>[MONITOR] Watching: {currentTarget} on {activeSource}</div>
                <div style={{ color: '#a6e3a1', marginTop: 3 }}>
                  [SUCCESS] {project.processed_targets}/{project.total_targets} posts processed ({p}%)
                </div>
                {project.matched_posts > 0 && (
                  <div style={{ color: '#89dceb', marginTop: 3 }}>
                    [MATCH] {project.matched_posts} keyword matches found
                  </div>
                )}
                {project.failed_fetches > 0 && (
                  <div style={{ color: '#f38ba8', marginTop: 3 }}>
                    [WARN] {project.failed_fetches} fetch error{project.failed_fetches !== 1 ? 's' : ''}
                  </div>
                )}
                {lastFetchedDisplay !== 'Never' && (
                  <div style={{ color: '#6c7086', marginTop: 3 }}>
                    [LAST] Fetched at {lastFetchedDisplay}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: '#585b70' }}>
                [IDLE] No posts fetched yet. Run scraper to start monitoring {activeSource}.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── D: KEYWORD INDICATORS + FETCHED ITEMS ── */}
      <div className="card" style={{ borderRadius: 14 }}>
        <div className="card-header">
          <span className="card-title">Keyword Indicators &amp; Fetched Items</span>
          {activeKw && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
              onClick={() => handleKwClick(activeKw)}>
              Clear filter
            </button>
          )}
        </div>
        <div className="card-body">
          {/* Keyword chips */}
          {kws.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {kws.map((kw, i) => {
                const color = colors[i] || '#3B82F6'
                const isActive = activeKw === kw
                return (
                  <button key={kw} onClick={() => handleKwClick(kw)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px',
                      borderRadius: 999, border: `1.5px solid ${color}`,
                      background: isActive ? `${color}22` : 'transparent',
                      color, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      transition: 'all .15s', boxShadow: isActive ? `0 0 8px ${color}44` : 'none' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    {kw}
                  </button>
                )
              })}
            </div>
          )}

          {/* Fetched Items list */}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, fontWeight: 600 }}>
            {activeKw
              ? `Showing items matching "${activeKw}"`
              : `All fetched items (${items.length})`}
          </div>

          {itemsLoading ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <span className="login-spinner" style={{ width: 20, height: 20 }} />
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 20px', background: 'var(--bg)',
              borderRadius: 10, border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No fetched items yet</div>
              <p style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 320, margin: '0 auto' }}>
                {activeKw
                  ? `No posts match the keyword "${activeKw}". Try a different keyword or clear the filter.`
                  : 'Start or resume scraping to populate fetched items for this project.'}
              </p>
            </div>
          ) : (
            <div>
              {items.map(item => (
                <ItemCard key={item.id} item={item} kwColors={colors} keywords={kws} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 32, maxWidth: 420,
            width: '90%', border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}>
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
