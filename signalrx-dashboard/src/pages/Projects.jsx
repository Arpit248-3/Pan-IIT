/**
 * Projects.jsx — Production-grade Project Management
 * ====================================================
 * ✅ No hardcoded/seed projects
 * ✅ Only real DB-backed projects
 * ✅ Only Twitter source
 * ✅ Real progress from processedTargets / totalTargets
 * ✅ Clickable keyword indicator dots
 * ✅ Project card → Details page navigation
 * ✅ Owner-aware edit/delete
 * ✅ Responsive grid (desktop → mobile)
 * ✅ Empty state
 * ✅ Auto status Completed if progress = 100
 */
import { useState, useEffect, useCallback } from 'react'
import {
  MdEdit, MdDelete, MdPlayArrow, MdPause, MdDone,
  MdAutoFixHigh, MdRefresh, MdOpenInNew, MdBolt,
  MdCheckCircle, MdRadioButtonChecked, MdInfoOutline,
} from 'react-icons/md'
import { SiX } from 'react-icons/si'
import ProjectSetupWizard from '../components/ProjectSetupWizard'
import { API_BASE } from '../config'

// ── Status config ────────────────────────────────────────────
const STATUS_CONFIG = {
  Active:     { color: '#10B981', bg: 'rgba(16,185,129,.12)',  label: 'Active'     },
  Monitoring: { color: '#3B82F6', bg: 'rgba(59,130,246,.12)',  label: 'Monitoring' },
  Paused:     { color: '#F59E0B', bg: 'rgba(245,158,11,.12)',  label: 'Paused'     },
  Completed:  { color: '#8B5CF6', bg: 'rgba(139,92,246,.12)',  label: 'Completed'  },
  Failed:     { color: '#EF4444', bg: 'rgba(239,68,68,.12)',   label: 'Failed'     },
}
const STATUS_OPTIONS = ['Active', 'Monitoring', 'Paused', 'Completed', 'Failed']

function statusStyle(status) {
  return STATUS_CONFIG[status] || { color: '#6B7280', bg: 'rgba(107,114,128,.12)', label: status }
}

// ── Progress bar ─────────────────────────────────────────────
function ProgressBar({ value, status }) {
  const color = status === 'Completed' ? '#8B5CF6'
              : status === 'Failed'    ? '#EF4444'
              : status === 'Paused'   ? '#F59E0B'
              : '#3B82F6'
  return (
    <div style={{ height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 99,
        width: `${Math.min(value ?? 0, 100)}%`,
        background: `linear-gradient(90deg, ${color}, ${color}cc)`,
        transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
        boxShadow: `0 0 8px ${color}66`,
      }} />
    </div>
  )
}

// ── Keyword dot with tooltip ─────────────────────────────────
function KeywordDot({ keyword, color, matchedCount, onClick, active }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <button
        onClick={e => { e.stopPropagation(); onClick(keyword) }}
        title={keyword}
        style={{
          width: 10, height: 10, borderRadius: '50%',
          background: active ? color : `${color}55`,
          border: `2px solid ${color}`,
          cursor: 'pointer', padding: 0,
          transition: 'transform .15s, box-shadow .15s',
          transform: hovered || active ? 'scale(1.5)' : 'scale(1)',
          boxShadow: hovered || active ? `0 0 6px ${color}` : 'none',
        }}
      />
      {hovered && (
        <div style={{
          position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--navy)', color: '#fff', borderRadius: 6, padding: '5px 10px',
          fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', zIndex: 999,
          boxShadow: '0 4px 12px rgba(0,0,0,.3)',
          pointerEvents: 'none',
        }}>
          <div>{keyword}</div>
          {matchedCount > 0 && <div style={{ color: '#a5b4fc', marginTop: 2 }}>{matchedCount} matched</div>}
        </div>
      )}
    </div>
  )
}

// ── Delete confirmation modal ─────────────────────────────────
function DeleteModal({ project, onConfirm, onCancel, loading }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: 32,
        maxWidth: 420, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,.4)',
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Delete Project?</div>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 24 }}>
          This will permanently delete <strong>{project?.name}</strong> and all associated
          monitoring state. This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={loading}
            style={{ background: '#EF4444', gap: 6 }}
            onClick={onConfirm}
          >
            {loading ? <span className="login-spinner" style={{ width: 14, height: 14 }} /> : <MdDelete size={14} />}
            Delete Project
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit modal ────────────────────────────────────────────────
function EditModal({ project, onSave, onCancel, loading }) {
  const [form, setForm] = useState({
    name: project?.name || '',
    status: project?.status || 'Active',
  })
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: 32,
        maxWidth: 460, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,.4)',
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>Edit Project</div>
        <div className="form-group">
          <label className="form-label">Project Name</label>
          <input className="form-input" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-input" value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || !form.name.trim()}
            onClick={() => onSave(form)}>
            {loading ? <span className="login-spinner" style={{ width: 14, height: 14 }} /> : null}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────
function ProjectCard({ project, currentUser, onViewDetails, onDelete, onEdit }) {
  const [activeKw, setActiveKw] = useState(null)
  const st = statusStyle(project.status)
  const isOwner = !project.owner_id || project.owner_id === currentUser?.id
  const kws = project.keywords ?? []
  const colors = project.keyword_colors ?? []
  const progress = project.progress ?? 0

  const handleKwClick = kw => setActiveKw(prev => prev === kw ? null : kw)

  return (
    <div
      className="card"
      style={{
        cursor: 'pointer',
        transition: 'transform .18s, box-shadow .18s',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}
      onClick={() => onViewDetails(project)}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,.15)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div className="card-body" style={{ padding: '18px 20px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, marginBottom: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SiX size={11} style={{ color: '#1DA1F2', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Twitter</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 8 }}>
            {project.agentic_enabled && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 2,
                padding: '2px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700,
                background: 'rgba(139,92,246,.12)', color: '#8B5CF6',
                border: '1px solid rgba(139,92,246,.25)',
              }}>
                <MdBolt size={9} /> AI
              </span>
            )}
            <span style={{
              padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              color: st.color, background: st.bg,
            }}>{st.label}</span>
          </div>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11,
            color: 'var(--text2)', marginBottom: 6 }}>
            <span>Progress</span>
            <span style={{ fontWeight: 700, color: progress === 100 ? '#8B5CF6' : 'var(--text)' }}>
              {progress}%
            </span>
          </div>
          <ProgressBar value={progress} status={project.status} />
          {/* Progress breakdown */}
          {project.total_targets > 0 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 10, color: 'var(--muted)' }}>
              <span>{project.processed_targets ?? 0}/{project.total_targets ?? 0} scanned</span>
              {project.matched_posts > 0 && <span>· {project.matched_posts} matched</span>}
              {project.remaining > 0 && <span>· {project.remaining} remaining</span>}
            </div>
          )}
        </div>

        {/* Keyword dots */}
        {kws.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Keywords
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {kws.map((kw, i) => (
                <KeywordDot
                  key={kw}
                  keyword={kw}
                  color={colors[i] || '#3B82F6'}
                  matchedCount={project.matched_posts ?? 0}
                  onClick={handleKwClick}
                  active={activeKw === kw}
                />
              ))}
              {kws.length > 0 && (
                <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>
                  {kws.length} keyword{kws.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {/* Active keyword filter banner */}
            {activeKw && (
              <div style={{
                marginTop: 8, padding: '5px 10px', borderRadius: 6, fontSize: 11,
                background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.2)',
                color: '#3B82F6', fontWeight: 600,
              }}>
                Filtering: {activeKw} · {project.matched_posts ?? 0} posts matched
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            {project.schedule_interval} · Created {project.created_at
              ? new Date(project.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
              : '—'}
          </span>
          <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
            <button
              className="btn btn-ghost btn-sm"
              title="View Details"
              onClick={() => onViewDetails(project)}
              style={{ padding: '3px 7px', display: 'inline-flex', alignItems: 'center' }}
            >
              <MdOpenInNew size={13} />
            </button>
            {isOwner && <>
              <button
                className="btn btn-ghost btn-sm"
                title="Edit"
                onClick={() => onEdit(project)}
                style={{ padding: '3px 7px', display: 'inline-flex', alignItems: 'center' }}
              >
                <MdEdit size={13} />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                title="Delete"
                onClick={() => onDelete(project)}
                style={{ padding: '3px 7px', display: 'inline-flex', alignItems: 'center', color: '#EF4444' }}
              >
                <MdDelete size={13} />
              </button>
            </>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Projects page ────────────────────────────────────────
export default function Projects({ currentUser, onNavigate, openModal: _openModal }) {
  const [projects, setProjects]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [showWizard, setShowWizard]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editTarget, setEditTarget]   = useState(null)
  const [deleting, setDeleting]       = useState(false)
  const [editing, setEditing]         = useState(false)
  const [lastRefresh, setLastRefresh] = useState(Date.now())

  // ── Fetch projects from DB ─────────────────────────────────
  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/projects`)
      const data = await res.json()
      if (data.status === 'success') {
        setProjects(data.projects ?? [])
      }
    } catch (err) {
      console.error('[Projects] Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // Auto-refresh every 30s to pick up progress updates
  useEffect(() => {
    const t = setInterval(() => {
      setLastRefresh(Date.now())
      fetchProjects()
    }, 30_000)
    return () => clearInterval(t)
  }, [fetchProjects])

  // ── Filter ─────────────────────────────────────────────────
  const filtered = (projects ?? []).filter(p =>
    statusFilter === 'All' || p.status === statusFilter
  )

  // ── View Details ───────────────────────────────────────────
  const handleViewDetails = (project) => {
    if (onNavigate) onNavigate('project-detail', { projectId: project.id })
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_BASE}/api/projects/${deleteTarget.id}`, { method: 'DELETE' })
      if (res.ok) {
        setProjects(prev => (prev ?? []).filter(p => p.id !== deleteTarget.id))
      }
    } catch (err) {
      console.error('[Projects] Delete error:', err)
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // ── Edit ───────────────────────────────────────────────────
  const handleEditSave = async (form) => {
    if (!editTarget) return
    setEditing(true)
    try {
      const res = await fetch(`${API_BASE}/api/projects/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, status: form.status }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        setProjects(prev => (prev ?? []).map(p => p.id === editTarget.id ? data.project : p))
      }
    } catch (err) {
      console.error('[Projects] Edit error:', err)
    } finally {
      setEditing(false)
      setEditTarget(null)
    }
  }

  // ── Wizard completion ──────────────────────────────────────
  const handleWizardClose = (newProject) => {
    setShowWizard(false)
    if (newProject?.id) {
      fetchProjects()  // refresh from DB — source of truth
    }
  }

  if (showWizard) {
    return <ProjectSetupWizard onClose={handleWizardClose} currentUser={currentUser} />
  }

  return (
    <>
      {/* Modals */}
      {deleteTarget && (
        <DeleteModal
          project={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
      {editTarget && (
        <EditModal
          project={editTarget}
          onSave={handleEditSave}
          onCancel={() => setEditTarget(null)}
          loading={editing}
        />
      )}

      {/* Filter bar */}
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <select
          className="filter-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="All">All Status</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {filtered.length} project{filtered.length !== 1 ? 's' : ''}
          {loading && <span style={{ marginLeft: 6, fontSize: 11 }}>· syncing…</span>}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={fetchProjects}
            disabled={loading}
            title="Refresh"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <MdRefresh size={14} className={loading ? 'spin' : ''} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowWizard(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <MdAutoFixHigh size={14} /> Setup Wizard
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '80px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(59,130,246,.08)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', marginBottom: 20,
          }}>
            <MdAutoFixHigh size={32} style={{ color: '#3B82F6' }} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
            {statusFilter !== 'All' ? `No ${statusFilter} projects` : 'No projects yet'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 320, lineHeight: 1.6 }}>
            {statusFilter !== 'All'
              ? `No projects match the "${statusFilter}" filter. Try another status.`
              : 'Use the Setup Wizard to create your first Twitter monitoring project and start detecting pharmacovigilance signals.'}
          </p>
          {statusFilter === 'All' && (
            <button
              className="btn btn-primary"
              style={{ marginTop: 20, gap: 8, padding: '10px 22px' }}
              onClick={() => setShowWizard(true)}
            >
              <MdAutoFixHigh size={16} /> Open Setup Wizard
            </button>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && projects.length === 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="card" style={{
              borderRadius: 14, overflow: 'hidden', opacity: 0.6,
            }}>
              <div className="card-body" style={{ padding: 20 }}>
                <div style={{ height: 14, background: 'var(--border)', borderRadius: 6, marginBottom: 10, width: '70%' }} />
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, marginBottom: 12 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3].map(j => (
                    <div key={j} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--border)' }} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project grid — fully responsive */}
      {!loading || projects.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {filtered.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              currentUser={currentUser}
              onViewDetails={handleViewDetails}
              onDelete={setDeleteTarget}
              onEdit={setEditTarget}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}