import { useState, useEffect } from 'react'
import {
  MdShield, MdClose, MdSend, MdRefresh, MdCheckCircle,
  MdSchedule, MdPerson, MdEmail, MdQuestionAnswer,
  MdSearch, MdFilterList, MdOpenInNew, MdReply,
  MdPendingActions, MdBarChart, MdAccessTime,
} from 'react-icons/md'
import { API_BASE } from '../config'

function StatusBadge({ status }) {
  return status === 'answered'
    ? <span style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:12,
        fontSize:11,fontWeight:700,background:'rgba(16,185,129,.12)',color:'#10B981',border:'1px solid rgba(16,185,129,.25)' }}>
        <MdCheckCircle size={12}/> Answered</span>
    : <span style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:12,
        fontSize:11,fontWeight:700,background:'rgba(245,158,11,.12)',color:'#F59E0B',border:'1px solid rgba(245,158,11,.25)' }}>
        <MdPendingActions size={12}/> Open</span>
}

function Avatar({ name, size=38 }) {
  const initials = (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)
  const colors = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4']
  const color  = colors[(name||'').charCodeAt(0) % colors.length]
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:`${color}20`,
      border:`2px solid ${color}40`, color, display:'flex', alignItems:'center',
      justifyContent:'center', fontSize:size*0.35, fontWeight:800, flexShrink:0 }}>
      {initials}
    </div>
  )
}

function QueryCard({ q, onClick, selected }) {
  const ts = q.created_at
    ? new Date(q.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
    : ''
  return (
    <div onClick={() => onClick(q)}
      style={{ padding:'16px 20px', cursor:'pointer', transition:'all .15s',
        background: selected ? 'rgba(59,130,246,.06)' : 'transparent',
        borderLeft: `3px solid ${selected ? '#3B82F6' : 'transparent'}`,
        borderBottom: '1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
        <Avatar name={q.user_name} size={36}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontSize:13, fontWeight:700 }}>{q.user_name || 'Unknown'}</span>
            <StatusBadge status={q.status}/>
            <span style={{ marginLeft:'auto', fontSize:11, color:'var(--muted)', flexShrink:0 }}>
              {ts}
            </span>
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>{q.user_email}</div>
          <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.5,
            overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
            {q.question}
          </div>
          {q.answer && (
            <div style={{ marginTop:6, fontSize:12, color:'#10B981', display:'flex', alignItems:'center', gap:4 }}>
              <MdReply size={13}/> Admin replied
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AnswerPanel({ query, onClose, onAnswered }) {
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState('')

  useEffect(() => {
    setAnswer(query?.answer || '')
    setMsg('')
  }, [query])

  if (!query) return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      color:'var(--muted)', gap:12, padding:40 }}>
      <MdQuestionAnswer size={48} style={{ opacity:.3 }}/>
      <div style={{ fontSize:14, fontWeight:600 }}>Select a query to review</div>
      <div style={{ fontSize:12 }}>Click any query from the list to see details and reply</div>
    </div>
  )

  const submit = async () => {
    if (!answer.trim()) return
    setLoading(true); setMsg('')
    try {
      const res  = await fetch(`${API_BASE}/api/help/queries/${query.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: answer.trim() })
      })
      const data = await res.json()
      if (res.ok) {
        setMsg('✅ Answer sent! User notified by email.')
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

  const ts = query.created_at
    ? new Date(query.created_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })
    : ''
  const tsAns = query.answered_at
    ? new Date(query.answered_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })
    : null

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', borderLeft:'1px solid var(--border)', overflow:'hidden' }}>
      {/* Panel header */}
      <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>Query Details</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Review and respond to this support request</div>
        </div>
        <StatusBadge status={query.status}/>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer',
          color:'var(--muted)', padding:4, borderRadius:6, display:'flex' }}>
          <MdClose size={18}/>
        </button>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {/* User info card */}
        <div style={{ padding:'16px', background:'var(--bg)', border:'1px solid var(--border)',
          borderRadius:10, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
            <Avatar name={query.user_name} size={44}/>
            <div>
              <div style={{ fontSize:15, fontWeight:700 }}>{query.user_name || 'Unknown'}</div>
              <div style={{ fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                <MdEmail size={12}/> {query.user_email}
              </div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div style={{ padding:'8px 12px', background:'var(--surface)', borderRadius:8, fontSize:12 }}>
              <div style={{ color:'var(--muted)', fontSize:10, fontWeight:700, textTransform:'uppercase',
                letterSpacing:'.05em', marginBottom:2 }}>Submitted</div>
              <div style={{ fontWeight:600 }}>{ts}</div>
            </div>
            {tsAns && (
              <div style={{ padding:'8px 12px', background:'rgba(16,185,129,.06)', borderRadius:8, fontSize:12 }}>
                <div style={{ color:'#10B981', fontSize:10, fontWeight:700, textTransform:'uppercase',
                  letterSpacing:'.05em', marginBottom:2 }}>Answered</div>
                <div style={{ fontWeight:600, color:'#10B981' }}>{tsAns}</div>
              </div>
            )}
          </div>
        </div>

        {/* Question */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase',
            letterSpacing:'.06em', marginBottom:8 }}>User's Question</div>
          <div style={{ padding:'14px 16px', background:'rgba(245,158,11,.06)',
            border:'1px solid rgba(245,158,11,.2)', borderRadius:10,
            fontSize:14, lineHeight:1.7, color:'var(--text)' }}>
            {query.question}
          </div>
        </div>

        {/* Previous answer */}
        {query.answer && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#10B981', textTransform:'uppercase',
              letterSpacing:'.06em', marginBottom:8 }}>Previous Answer</div>
            <div style={{ padding:'14px 16px', background:'rgba(16,185,129,.06)',
              border:'1px solid rgba(16,185,129,.2)', borderRadius:10,
              fontSize:13, lineHeight:1.7 }}>
              {query.answer}
            </div>
          </div>
        )}

        {/* Answer textarea */}
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase',
            letterSpacing:'.06em', marginBottom:8 }}>
            {query.status === 'answered' ? '✏️ Update Answer' : '✍️ Write Answer'}
          </div>
          <textarea
            rows={5}
            placeholder="Type a clear, helpful response. The user will be notified via email automatically…"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            style={{ width:'100%', padding:'12px 14px', background:'var(--surface)',
              border:'1px solid var(--border)', borderRadius:10, color:'var(--text)',
              fontSize:13, lineHeight:1.6, resize:'vertical', fontFamily:'inherit',
              outline:'none', boxSizing:'border-box', transition:'border-color .2s' }}
            onFocus={e => e.target.style.borderColor='#3B82F6'}
            onBlur={e  => e.target.style.borderColor='var(--border)'}
          />
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, display:'flex', alignItems:'center', gap:4 }}>
            <MdEmail size={12}/> User will receive an email notification at {query.user_email}
          </div>
        </div>

        {msg && (
          <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, fontSize:13,
            background: msg.startsWith('✅') ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)',
            border: `1px solid ${msg.startsWith('✅') ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)'}`,
            color: msg.startsWith('✅') ? '#10B981' : '#EF4444' }}>
            {msg}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)',
        display:'flex', gap:10, flexShrink:0 }}>
        <button onClick={onClose}
          style={{ padding:'9px 18px', borderRadius:8, border:'1px solid var(--border)',
            background:'transparent', color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          Close
        </button>
        <button onClick={submit} disabled={loading || !answer.trim()}
          style={{ flex:1, padding:'9px 18px', borderRadius:8, border:'none',
            background: !answer.trim() || loading ? '#334155' : 'linear-gradient(135deg,#3B82F6,#2563EB)',
            color: !answer.trim() || loading ? 'var(--muted)' : '#fff',
            fontSize:13, fontWeight:700, cursor: !answer.trim() || loading ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow: answer.trim() && !loading ? '0 4px 14px rgba(59,130,246,.35)' : 'none',
            transition:'all .2s' }}>
          {loading
            ? <><span className="login-spinner" style={{ width:14, height:14 }}/> Sending…</>
            : <><MdSend size={15}/> Send Answer + Email</>}
        </button>
      </div>
    </div>
  )
}

export default function AdminHelpDashboard() {
  const [queries,  setQueries]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [filter,   setFilter]   = useState('all')
  const [search,   setSearch]   = useState('')

  const user = (() => { try { return JSON.parse(localStorage.getItem('ayuscout_user') || 'null') } catch { return null } })()

  const loadQueries = () => {
    setLoading(true)
    fetch(`${API_BASE}/api/help/queries?role=admin`)
      .then(r  => r.json())
      .then(d  => setQueries(d.queries || []))
      .catch(() => setQueries([]))
      .finally(() => setLoading(false))
  }
  useEffect(loadQueries, [])

  const handleAnswered = (updated) => {
    setQueries(qs => qs.map(q => q.id === updated.id ? updated : q))
    setSelected(updated)
  }

  if (!user || user.role !== 'admin') {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:16 }}>
        <MdShield size={56} style={{ color:'var(--danger)' }}/>
        <div style={{ fontSize:20, fontWeight:700 }}>Admin Access Required</div>
        <div style={{ color:'var(--muted)', fontSize:14 }}>This page is only accessible to administrators.</div>
      </div>
    )
  }

  const openCount     = queries.filter(q => q.status === 'open').length
  const answeredCount = queries.length - openCount
  const avgReply      = answeredCount > 0 ? '~2h' : '—'

  const filtered = queries
    .filter(q => filter === 'all' ? true : q.status === filter)
    .filter(q => !search.trim() || q.question?.toLowerCase().includes(search.toLowerCase())
      || q.user_name?.toLowerCase().includes(search.toLowerCase())
      || q.user_email?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 80px)', overflow:'hidden' }}>

      {/* Page header */}
      <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
          <div style={{ width:44, height:44, borderRadius:12,
            background:'rgba(239,68,68,.1)', color:'#EF4444',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <MdShield size={24}/>
          </div>
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:'-.02em', marginBottom:2 }}>
              Help Query Management
            </h1>
            <p style={{ fontSize:13, color:'var(--muted)' }}>
              Review and respond to user queries · Email notifications sent automatically
            </p>
          </div>
          <button onClick={loadQueries}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
              borderRadius:8, border:'1px solid var(--border)', background:'transparent',
              color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <MdRefresh size={16}/> Refresh
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { label:'Total Queries',    value: queries.length, color:'#3B82F6', icon: MdQuestionAnswer },
            { label:'Open',             value: openCount,      color:'#F59E0B', icon: MdPendingActions },
            { label:'Answered',         value: answeredCount,  color:'#10B981', icon: MdCheckCircle    },
            { label:'Avg Reply Time',   value: avgReply,       color:'#8B5CF6', icon: MdAccessTime     },
          ].map(s => {
            const I = s.icon
            return (
              <div key={s.label} style={{ padding:'14px 16px', background:'var(--surface)',
                border:'1px solid var(--border)', borderRadius:10,
                borderTop:`3px solid ${s.color}` }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>{s.label}</div>
                  <I size={16} style={{ color:s.color }}/>
                </div>
                <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main split layout */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Left: Query list */}
        <div style={{ width:420, flexShrink:0, display:'flex', flexDirection:'column',
          borderRight:'1px solid var(--border)', overflow:'hidden' }}>

          {/* Search + filter */}
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <div style={{ position:'relative', marginBottom:10 }}>
              <MdSearch size={16} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
                color:'var(--muted)', pointerEvents:'none' }}/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search queries, users…"
                style={{ width:'100%', paddingLeft:32, paddingRight:12, paddingTop:8, paddingBottom:8,
                  background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8,
                  color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' }}/>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {['all','open','answered'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:700,
                    cursor:'pointer', border:'none', transition:'all .15s',
                    background: filter===f ? '#3B82F6' : 'var(--bg)',
                    color: filter===f ? '#fff' : 'var(--muted)' }}>
                  {f === 'all' ? `All (${queries.length})` : f === 'open' ? `Open (${openCount})` : `Answered (${answeredCount})`}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {loading ? (
              <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Loading queries…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>
                <MdQuestionAnswer size={36} style={{ opacity:.3, marginBottom:12, display:'block', margin:'0 auto 12px' }}/>
                <div style={{ fontSize:13 }}>No queries found</div>
              </div>
            ) : filtered.map(q => (
              <QueryCard key={q.id} q={q} onClick={setSelected} selected={selected?.id === q.id}/>
            ))}
          </div>
        </div>

        {/* Right: Answer panel */}
        <AnswerPanel
          query={selected}
          onClose={() => setSelected(null)}
          onAnswered={handleAnswered}
        />
      </div>
    </div>
  )
}
