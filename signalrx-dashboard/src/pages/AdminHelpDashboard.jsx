import { useState, useEffect } from 'react'
import {
  MdShield, MdClose, MdSend, MdRefresh, MdCheckCircle,
  MdSchedule, MdPerson, MdEmail, MdQuestionAnswer
} from 'react-icons/md'

import { API_BASE } from '../config';


function StatusBadge({ status }) {
  return status === 'answered'
    ? <span className="badge badge-success">✓ Answered</span>
    : <span className="badge badge-warning">⏳ Open</span>
}

function QueryRow({ q, onClick, selected }) {
  return (
    <tr
      style={{ cursor: 'pointer', background: selected ? 'rgba(0,123,255,.06)' : undefined }}
      onClick={() => onClick(q)}
    >
      <td>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{q.user_name}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{q.user_email}</div>
      </td>
      <td style={{ maxWidth: 340 }}>
        <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>
          {q.question}
        </div>
      </td>
      <td><StatusBadge status={q.status} /></td>
      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
        {new Date(q.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </td>
    </tr>
  )
}

function AnswerDrawer({ query, onClose, onAnswered }) {
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState('')

  useEffect(() => {
    setAnswer(query?.answer || '')
    setMsg('')
  }, [query])

  if (!query) return null

  const submit = async () => {
    if (!answer.trim()) return
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch(`${API_BASE}/api/help/queries/${query.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: answer.trim() })
      })
      const data = await res.json()
      if (res.ok) {
        setMsg('✅ Answer sent! Email notification dispatched.')
        onAnswered(data.query)
      } else {
        setMsg(`❌ ${data.detail || 'Failed to save answer.'}`)
      }
    } catch {
      setMsg('❌ Cannot connect to backend.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-drawer-overlay" onClick={onClose}>
      <div className="admin-drawer" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="admin-drawer-header">
          <div>
            <div className="admin-drawer-title">Answer Query</div>
            <StatusBadge status={query.status} />
          </div>
          <button className="help-drawer-close" onClick={onClose}><MdClose size={20} /></button>
        </div>

        {/* User info */}
        <div className="admin-drawer-user">
          <div className="admin-drawer-avatar">{query.user_name?.[0]?.toUpperCase() || '?'}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{query.user_name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{query.user_email}</div>
          </div>
        </div>

        {/* Question */}
        <div className="admin-drawer-section-label">Question</div>
        <div className="admin-drawer-question">{query.question}</div>

        {/* Previous answer if any */}
        {query.answer && (
          <>
            <div className="admin-drawer-section-label">Previous Answer</div>
            <div className="admin-drawer-prev-answer">{query.answer}</div>
          </>
        )}

        {/* Answer textarea */}
        <div className="admin-drawer-section-label">
          {query.status === 'answered' ? 'Update Answer' : 'Your Answer'}
        </div>
        <textarea
          className="help-ask-textarea"
          rows={5}
          placeholder="Type a clear, helpful response..."
          value={answer}
          onChange={e => setAnswer(e.target.value)}
        />

        {msg && <div className="help-submit-msg" style={{ marginTop: 8 }}>{msg}</div>}

        {/* Footer */}
        <div className="admin-drawer-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !answer.trim()}>
            {loading ? <span className="login-spinner" /> : <><MdSend size={16} /> Send Answer + Email</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminHelpDashboard() {
  const [queries, setQueries]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(null)
  const [filter, setFilter]         = useState('all')    // 'all' | 'open' | 'answered'

  const user = (() => { try { return JSON.parse(localStorage.getItem('ayuscout_user') || 'null') } catch { return null } })()

  const loadQueries = () => {
    setLoading(true)
    fetch(`${API_BASE}/api/help/queries?role=admin`)
      .then(r => r.json())
      .then(d => setQueries(d.queries || []))
      .catch(() => setQueries([]))
      .finally(() => setLoading(false))
  }

  useEffect(loadQueries, [])

  const handleAnswered = (updated) => {
    setQueries(qs => qs.map(q => q.id === updated.id ? updated : q))
    setSelected(updated)
  }

  // Access guard
  if (!user || user.role !== 'admin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <MdShield size={56} style={{ color: 'var(--danger)' }} />
        <div style={{ fontSize: 20, fontWeight: 700 }}>Admin Access Required</div>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>This page is only accessible to administrators.</div>
      </div>
    )
  }

  const filtered = queries.filter(q => filter === 'all' ? true : q.status === filter)
  const openCount = queries.filter(q => q.status === 'open').length

  return (
    <div className="admin-help-page">
      {/* Hero */}
      <div className="help-hero" style={{ marginBottom: 24 }}>
        <div className="help-hero-icon" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--danger)' }}>
          <MdShield size={30} />
        </div>
        <div>
          <h1 className="help-hero-title">Admin Panel — Help Queries</h1>
          <p className="help-hero-sub">Review and answer user queries. Email notifications sent automatically on reply.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadQueries} style={{ marginLeft: 'auto' }}>
          <MdRefresh size={16} /> Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="admin-stats-row">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{queries.length}</div>
          <div className="admin-stat-label">Total Queries</div>
        </div>
        <div className="admin-stat-card" style={{ borderColor: 'var(--warn)' }}>
          <div className="admin-stat-value" style={{ color: 'var(--warn)' }}>{openCount}</div>
          <div className="admin-stat-label">Open</div>
        </div>
        <div className="admin-stat-card" style={{ borderColor: 'var(--success)' }}>
          <div className="admin-stat-value" style={{ color: 'var(--success)' }}>{queries.length - openCount}</div>
          <div className="admin-stat-label">Answered</div>
        </div>
      </div>

      {/* Filter */}
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Show:</span>
        {['all', 'open', 'answered'].map(f => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(f)}
            style={{ textTransform: 'capitalize' }}
          >
            {f === 'all' ? 'All Queries' : f === 'open' ? '⏳ Open' : '✓ Answered'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading queries...</div>
        ) : filtered.length === 0 ? (
          <div className="help-empty" style={{ padding: 40 }}>
            <MdQuestionAnswer size={40} style={{ color: 'var(--muted)', marginBottom: 12 }} />
            <div>No {filter !== 'all' ? filter : ''} queries found.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Question</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(q => (
                  <QueryRow
                    key={q.id}
                    q={q}
                    onClick={setSelected}
                    selected={selected?.id === q.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Answer drawer */}
      <AnswerDrawer
        query={selected}
        onClose={() => setSelected(null)}
        onAnswered={handleAnswered}
      />
    </div>
  )
}
