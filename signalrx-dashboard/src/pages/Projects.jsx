import { useState, useEffect } from 'react'
import { MdEdit, MdDelete, MdPlayArrow, MdPause, MdDone, MdAutoFixHigh, MdBolt, MdRefresh } from 'react-icons/md'
import ProjectSetupWizard from '../components/ProjectSetupWizard'

import { API_BASE } from '../config';



const SEED_PROJECTS = [
  { id: 1, name: 'Diabetes Monitoring',       status: 'Active',    statusC: 'success', progress: 72, keywords: 42, sources: 'Reddit, X',       team: ['RK','PS','AM'], due: 'Ongoing',       agenticEnabled: false },
  { id: 2, name: 'Vaccine Sentiment Analysis', status: 'Active',    statusC: 'success', progress: 45, keywords: 28, sources: 'Reddit, X, News', team: ['PS','VP'],       due: 'Jun 30, 2025',  agenticEnabled: false },
  { id: 3, name: 'Cardio Drug Safety',         status: 'Active',    statusC: 'success', progress: 30, keywords: 31, sources: 'Reddit',         team: ['RK','AM'],       due: 'Jul 15, 2025',  agenticEnabled: false },
  { id: 4, name: 'OTC Pain Relief',            status: 'On Hold',   statusC: 'warning', progress: 60, keywords: 18, sources: 'X (Twitter)',   team: ['AM','SR'],       due: 'Paused',         agenticEnabled: false },
  { id: 5, name: 'Annual Drug Review 2024',    status: 'Completed', statusC: 'info',    progress:100, keywords: 52, sources: 'All',           team: ['VP','AG'],       due: 'Completed',      agenticEnabled: false },
  { id: 6, name: 'Mental Health Drugs',        status: 'Active',    statusC: 'success', progress: 15, keywords: 14, sources: 'Reddit, X',     team: ['RK','PS'],       due: 'Aug 01, 2025',  agenticEnabled: false },
]

const SOURCES_OPTIONS = ['Reddit', 'X (Twitter)', 'News', 'PubMed', 'All']
const STATUS_OPTIONS = [
  { label: 'Active', c: 'success', icon: <MdPlayArrow size={12} /> },
  { label: 'On Hold', c: 'warning', icon: <MdPause size={12} /> },
  { label: 'Completed', c: 'info', icon: <MdDone size={12} /> },
]

function getStatusColor(status) {
  return STATUS_OPTIONS.find(s => s.label === status)?.c || 'neutral'
}

export default function Projects({ openModal }) {
  const [projects, setProjects]     = useState(SEED_PROJECTS)
  const [apiLoaded, setApiLoaded]   = useState(false)
  const [loadingApi, setLoadingApi] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [showWizard, setShowWizard] = useState(false)

  /* Fetch both projects and signals; compute dynamic progress */
  const fetchProjects = async () => {
    setLoadingApi(true)
    try {
      // Fetch projects and signals in parallel
      const [projRes, sigRes] = await Promise.all([
        fetch(`${API_BASE}/api/projects`),
        fetch(`${API_BASE}/api/signals`),
      ])
      const projData = await projRes.json()
      const sigData  = await sigRes.json()

      if (projData.status === 'success') {
        const allSignals = sigData.records || []

        const apiProjs = (projData.projects || []).map(p => {
          // Normalise keyword list
          const kwList = Array.isArray(p.keywords) ? p.keywords : []
          const primaryKw = (kwList[0] || '').toLowerCase()

          // Count matching signals against drug name (case-insensitive)
          const signalCount = primaryKw
            ? allSignals.filter(s =>
                (s.drug || '').toLowerCase().includes(primaryKw)
              ).length
            : 0

          // 10 signals == 100% progress; cap at 100
          const calculatedProgress = Math.min(signalCount * 10, 100)

          return {
            ...p,
            keywords: p.keywords_count ?? kwList.length,
            sources:  p.sources_label ?? (Array.isArray(p.sources) ? p.sources.join(', ') : p.sources || 'Reddit'),
            progress: calculatedProgress,
            status:   calculatedProgress > 0 ? 'Active' : (p.status || 'Pending'),
            statusC:  calculatedProgress > 0 ? 'success' : 'warning',
          }
        })

        // Prepend API records, then append seed entries not duplicated by name
        const apiNames = new Set(apiProjs.map(p => p.name.toLowerCase()))
        const seeds = SEED_PROJECTS.filter(p => !apiNames.has(p.name.toLowerCase()))
        setProjects([...apiProjs, ...seeds])
        setApiLoaded(true)
      }
    } catch {
      /* keep seed data if backend unreachable */
    }
    setLoadingApi(false)
  }

  useEffect(() => { fetchProjects() }, [])

  const filtered = projects.filter(p =>
    statusFilter === 'All Status' || p.status === statusFilter
  )

  /* Save helper — updates React state (localStorage kept as local backup) */
  const saveProjects = (updated) => {
    setProjects(updated)
    try { localStorage.setItem('signalrx_projects', JSON.stringify(updated)) } catch {}
  }

  /* addProject: POST to API then prepend to local state */
  const addProject = async (newProject) => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProject.name,
          keywords: Array.isArray(newProject.keywords) ? newProject.keywords : [],
          sources: Array.isArray(newProject.sources) ? newProject.sources : (newProject.sources ? [newProject.sources] : []),
          agentic_enabled: !!newProject.agenticEnabled,
        }),
      })
      if (res.ok) {
        await fetchProjects()   // refresh from DB
        return
      }
    } catch { /* fall through to local-only save */ }
    saveProjects([newProject, ...projects])
  }

  // ── New Project ──────────────────────────────────────────────
  const handleNewProject = () => {
    let formData = { name: '', sources: [], desc: '', due: '' }

    openModal({
      title: 'New Project',
      children: (
        <>
          <div className="form-group">
            <label className="form-label">Project Name</label>
            <input className="form-input" placeholder="e.g. Oncology Drug Safety"
              onChange={e => formData.name = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Data Sources</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {SOURCES_OPTIONS.map(src => (
                <label key={src} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" value={src}
                    onChange={e => {
                      if (e.target.checked) formData.sources = [...formData.sources, src]
                      else formData.sources = formData.sources.filter(s => s !== src)
                    }} />
                  {src}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Due Date</label>
            <input className="form-input" type="date"
              onChange={e => formData.due = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} placeholder="Brief project description..."
              onChange={e => formData.desc = e.target.value} />
          </div>
        </>
      ),
      footer: (
        <>
          <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => {
            if (!formData.name.trim()) return alert('Project name is required')
            const newProject = {
              id: Date.now(),
              name: formData.name.trim(),
              status: 'Active',
              statusC: 'success',
              progress: 0,
              keywords: 0,
              sources: formData.sources.length > 0 ? formData.sources.join(', ') : 'Reddit',
              team: ['DR'],
              due: formData.due
                ? new Date(formData.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Ongoing',
            }

            // Replaced setProjects with addProject to trigger local storage save
            addProject(newProject)
            openModal(null)
          }}>Create Project</button>
        </>
      )
    })
  }

  // ── Edit Project ─────────────────────────────────────────────
  const handleEdit = (project) => {
    let formData = { ...project }

    openModal({
      title: `Edit: ${project.name}`,
      children: (
        <>
          <div className="form-group">
            <label className="form-label">Project Name</label>
            <input className="form-input" defaultValue={project.name}
              onChange={e => formData.name = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input" defaultValue={project.status}
              onChange={e => { formData.status = e.target.value; formData.statusC = getStatusColor(e.target.value) }}>
              {STATUS_OPTIONS.map(s => <option key={s.label}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Progress ({project.progress}%)</label>
            <input className="form-input" type="number" min={0} max={100} defaultValue={project.progress}
              onChange={e => formData.progress = Number(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Sources</label>
            <input className="form-input" defaultValue={project.sources}
              onChange={e => formData.sources = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Due</label>
            <input className="form-input" defaultValue={project.due}
              onChange={e => formData.due = e.target.value} />
          </div>
        </>
      ),
      footer: (
        <>
          <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => {
            // Replaced setProjects with saveProjects to trigger local storage save
            const updatedProjects = projects.map(p => p.id === project.id ? { ...p, ...formData } : p);
            saveProjects(updatedProjects);
            openModal(null)
          }}>Save Changes</button>
        </>
      )
    })
  }

  // ── Delete Project ───────────────────────────────────────────
  const handleDelete = (project) => {
    openModal({
      title: 'Delete Project',
      children: (
        <div style={{ fontSize: 14, lineHeight: 1.7 }}>
          Delete <strong>{project.name}</strong>? This cannot be undone.
        </div>
      ),
      footer: (
        <>
          <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
          <button className="btn btn-primary" style={{ background: 'var(--danger)' }} onClick={() => {
            // Replaced setProjects with saveProjects to trigger local storage save
            const updatedProjects = projects.filter(p => p.id !== project.id);
            saveProjects(updatedProjects);
            openModal(null)
          }}>Delete</button>
        </>
      )
    })
  }

  // ── Wizard closes with a new project (or just close) ────────
  const handleWizardClose = (newProject) => {
    setShowWizard(false)
    if (newProject && newProject.id) {
      // Replaced setProjects with addProject to trigger local storage save
      addProject(newProject)
    }
  }

  // ── Render Wizard View ───────────────────────────────────────
  if (showWizard) {
    return <ProjectSetupWizard onClose={handleWizardClose} />
  }

  return (
    <>
      <div className="filter-bar">
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option>All Status</option>
          <option>Active</option>
          <option>Completed</option>
          <option>On Hold</option>
        </select>
        <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 4 }}>
          {filtered.length} project{filtered.length !== 1 ? 's' : ''}
          {loadingApi && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>syncing…</span>}
        </span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={fetchProjects} disabled={loadingApi} title="Refresh from DB">
          <MdRefresh size={14} className={loadingApi ? 'spin' : ''} />
        </button>
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', gap: 6 }} onClick={() => setShowWizard(true)}>
          <MdAutoFixHigh size={14} /> Setup Wizard
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleNewProject}>
          + New Project
        </button>
      </div>

      <div className="grid-3">
        {filtered.map(p => (
          <div className="card" key={p.id} style={{ cursor: 'default' }}>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'flex-start' }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {p.agenticEnabled && (
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px',
                      borderRadius: 10, fontSize: 10, fontWeight: 700,
                      background: 'rgba(139,92,246,.12)', color: '#8B5CF6',
                      border: '1px solid rgba(139,92,246,.25)'
                    }}>
                      <MdBolt size={10} /> AI
                    </span>
                  )}
                  <span className={`badge badge-${p.statusC}`}>{p.status}</span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>Sources: {p.sources}</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span>Progress</span><span>{p.progress}%</span>
                </div>
                <div className="progress">
                  <div className="progress-fill" style={{
                    width: `${p.progress}%`,
                    background: p.progress === 100 ? 'var(--success)' : 'var(--blue)',
                    transition: 'width 0.4s ease'
                  }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                <span><strong>{p.keywords}</strong> keywords</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex' }}>
                  {p.team.map((t, i) => (
                    <div key={t + i} style={{
                      width: 28, height: 28, borderRadius: '50%', background: 'var(--navy)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, border: '2px solid #fff', marginLeft: i > 0 ? -8 : 0
                    }}>{t}</div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.due}</span>
                  <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => handleEdit(p)}
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px' }}>
                    <MdEdit size={13} />
                  </button>
                  <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => handleDelete(p)}
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px', color: 'var(--danger)' }}>
                    <MdDelete size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            No projects match the current filter.
          </div>
        )}
      </div>
    </>
  )
}