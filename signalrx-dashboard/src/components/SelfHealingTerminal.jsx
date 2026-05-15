import { useState, useRef, useEffect, useCallback } from 'react'
import {
  MdTerminal, MdPlayArrow, MdStop, MdRefresh,
  MdBugReport, MdAutoFixHigh, MdCheckCircle,
  MdLink, MdSearch, MdSensors, MdMemory, MdClear, MdWifi, MdWifiOff,
} from 'react-icons/md'
import { API_BASE } from '../config'

const POLL_MS = 1500

const EVT_STYLE = {
  ERROR:         { color: '#f38ba8', icon: '✖' },
  HEALING:       { color: '#cba6f7', icon: '⚕' },
  SUCCESS:       { color: '#a6e3a1', icon: '✔' },
  INIT:          { color: '#89dceb', icon: '⚙' },
  FDA_ANALYSIS:  { color: '#f9e2af', icon: '⚗' },
  AI_ANALYSIS:   { color: '#fab387', icon: '🧠' },
  PROJECT_UPDATE:{ color: '#a6e3a1', icon: '📊' },
  NOTIFICATION:  { color: '#89b4fa', icon: '🔔' },
  ALERT:         { color: '#f38ba8', icon: '🚨' },
  FETCH:         { color: '#89b4fa', icon: '⬇' },
  PARSE:         { color: '#89b4fa', icon: '›' },
  DEDUPE:        { color: '#6c7086', icon: '⊘' },
  FILTER:        { color: '#6c7086', icon: '⊘' },
  WARNING:       { color: '#f9e2af', icon: '⚠' },
  INFO:          { color: '#89b4fa', icon: '›' },
}
const evtStyle = (e) => EVT_STYLE[e] || EVT_STYLE.INFO

function LogLine({ log, index }) {
  const s = evtStyle(log.event_type)
  const ts = log.timestamp
    ? new Date(log.timestamp).toLocaleTimeString('en-IN', { hour12: false })
    : ''
  return (
    <div style={{ display:'flex', gap:8, padding:'2px 0', animation:'fadeInLine .2s ease',
      fontFamily:"'JetBrains Mono','Fira Code',Consolas,monospace", alignItems:'flex-start' }}>
      <span style={{ color:'#585b70', fontSize:10, minWidth:24, textAlign:'right', flexShrink:0, lineHeight:'20px' }}>
        {String(index+1).padStart(2,'0')}
      </span>
      <span style={{ flexShrink:0, lineHeight:'20px', color: s.color }}>{s.icon}</span>
      {ts && <span style={{ color:'#45475a', fontSize:10, flexShrink:0, lineHeight:'20px' }}>{ts}</span>}
      <span style={{ fontSize:12, color: s.color, lineHeight:'20px', flex:1, wordBreak:'break-word' }}>
        {log.message}
      </span>
    </div>
  )
}

function Cursor() {
  return <span style={{ display:'inline-block', width:8, height:14, background:'#a6e3a1',
    marginLeft:4, verticalAlign:'middle', animation:'blink 1s step-end infinite' }} />
}

function StatBadge({ label, value, color }) {
  return (
    <div style={{ flex:1, padding:'10px 12px', background:'var(--bg)',
      border:'1px solid var(--border)', borderRadius:8, textAlign:'center' }}>
      <div style={{ fontSize:9, color:'var(--muted)', fontWeight:700,
        textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:800, color }}>{value ?? '—'}</div>
    </div>
  )
}

export default function SelfHealingTerminal() {
  const [url,      setUrl]      = useState('')
  const [keyword,  setKeyword]  = useState('')
  const [sourceId, setSourceId] = useState('generic_web')
  const [sources,  setSources]  = useState([])
  const [backendOk, setBackendOk] = useState(null) // null=checking, true=ok, false=down

  const [logs,       setLogs]       = useState([])
  const [sessionId,  setSessionId]  = useState(null)
  const [isCrawling, setIsCrawling] = useState(false)
  const [phase,      setPhase]      = useState('idle')
  const [stats,      setStats]      = useState(null)
  const [statusMsg,  setStatusMsg]  = useState('')

  const termRef    = useRef(null)
  const pollRef    = useRef(null)
  const cursorRef  = useRef(0)

  // Auto-scroll
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [logs])

  // Cleanup on unmount
  useEffect(() => () => clearInterval(pollRef.current), [])

  // Check backend + load sources on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/crawler/health`)
      .then(r => r.json())
      .then(d => setBackendOk(d.status === 'ok' || d.status === 'degraded'))
      .catch(() => setBackendOk(false))

    fetch(`${API_BASE}/api/sources`)
      .then(r => r.json())
      .then(d => { if (d.sources) setSources(d.sources) })
      .catch(() => {})
  }, [])

  const pushLog = (msg, event_type = 'INFO') => {
    setLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      event_type,
      message: msg,
      timestamp: new Date().toISOString(),
    }])
  }

  const clearAll = () => {
    clearInterval(pollRef.current)
    setLogs([])
    setSessionId(null)
    cursorRef.current = 0
    setPhase('idle')
    setIsCrawling(false)
    setStats(null)
    setStatusMsg('')
  }

  const startPolling = useCallback((sid) => {
    clearInterval(pollRef.current)
    cursorRef.current = 0

    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API_BASE}/api/crawler/logs/${sid}?after_id=${cursorRef.current}`)
        const data = await res.json()

        if (data.logs?.length) {
          cursorRef.current = data.last_id
          setLogs(prev => [...prev, ...data.logs])

          // Phase detection
          for (const l of [...data.logs].reverse()) {
            if (l.event_type === 'ERROR')   { setPhase('error');   break }
            if (l.event_type === 'HEALING') { setPhase('healing'); break }
            if (l.event_type === 'SUCCESS') { setPhase('done');    break }
          }
        }

        if (data.stats) {
          setStats({
            fetched: data.stats.records_fetched,
            matched: data.stats.records_matched,
            healed:  data.stats.healing_attempts,
          })
        }

        const done = data.session_status === 'completed' || data.session_status === 'failed'
        if (done) {
          clearInterval(pollRef.current)
          setIsCrawling(false)
          setPhase(data.session_status === 'failed' ? 'error' : 'done')
          setStatusMsg(data.session_status === 'failed'
            ? 'Crawl failed — see error above'
            : 'Crawl complete — check Data Explorer, Alerts & Reports for new signals')
        }
      } catch (e) {
        // network hiccup — keep polling
      }
    }, POLL_MS)
  }, [])

  const handleDeploy = async () => {
    if (isCrawling) return
    if (!keyword.trim()) {
      pushLog('[ERROR] Please enter a drug or keyword before deploying.', 'ERROR')
      return
    }

    clearAll()
    setIsCrawling(true)
    setPhase('crawling')
    pushLog(`[INIT] Connecting to AyuScout crawler backend at ${API_BASE}…`, 'INIT')
    pushLog(`[INIT] Drug/keyword: "${keyword.trim()}" | Source: ${sourceId}`, 'INIT')
    if (url.trim()) pushLog(`[FETCH] Target URL: ${url.trim()}`, 'FETCH')

    try {
      const payload = {
        url:        url.trim(),
        keyword:    keyword.trim(),
        source_id:  sourceId,
        max_records: 15,
      }

      const res  = await fetch(`${API_BASE}/api/crawler/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status} — ${JSON.stringify(data)}`)
      }

      pushLog(`[INIT] Session #${data.session_id} created — starting live log stream…`, 'INIT')
      setSessionId(data.session_id)
      startPolling(data.session_id)

    } catch (err) {
      pushLog(`[ERROR] ${err.message}`, 'ERROR')
      pushLog('[ERROR] Make sure the backend server is running: python start.py', 'ERROR')
      setPhase('error')
      setIsCrawling(false)
    }
  }

  const pc = {
    idle:    { border: 'var(--border)',       glow: 'none' },
    crawling:{ border: 'rgba(59,130,246,.4)', glow: '0 0 20px rgba(59,130,246,.15)' },
    error:   { border: 'rgba(239,68,68,.4)',  glow: '0 0 20px rgba(239,68,68,.12)' },
    healing: { border: 'rgba(139,92,246,.5)', glow: '0 0 24px rgba(139,92,246,.2)' },
    done:    { border: 'rgba(16,185,129,.4)', glow: '0 0 20px rgba(16,185,129,.12)' },
  }[phase] || { border:'var(--border)', glow:'none' }

  return (
    <>
      <style>{`
        @keyframes fadeInLine{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
        @keyframes blink{50%{opacity:0}}
      `}</style>

      <div style={{ maxWidth:1100, margin:'0 auto' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
          <div style={{ width:52, height:52, borderRadius:12,
            background:'linear-gradient(135deg,rgba(139,92,246,.2),rgba(59,130,246,.15))',
            border:'1px solid rgba(139,92,246,.3)', color:'#8B5CF6',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <MdMemory size={28} />
          </div>
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-.02em', marginBottom:2 }}>
              Self-Healing Agentic Crawler
            </h1>
            <p style={{ fontSize:13, color:'var(--muted)' }}>
              Real-time AI console — all terminal output is live backend data
            </p>
          </div>
          {/* Backend status indicator */}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
            borderRadius:20, fontSize:11, fontWeight:700,
            background: backendOk === false ? 'rgba(239,68,68,.1)' : backendOk ? 'rgba(16,185,129,.1)' : 'rgba(107,114,128,.1)',
            color: backendOk === false ? '#EF4444' : backendOk ? '#10B981' : '#6B7280',
            border: `1px solid ${backendOk === false ? 'rgba(239,68,68,.3)' : backendOk ? 'rgba(16,185,129,.3)' : 'rgba(107,114,128,.3)'}` }}>
            {backendOk === false ? <MdWifiOff size={14}/> : <MdWifi size={14}/>}
            {backendOk === null ? 'Checking…' : backendOk ? 'Backend Online' : 'Backend Offline'}
          </div>
          {[
            { label:'Vision AI', color:'#8B5CF6' },
            { label:'Self-Healing', color:'#3B82F6' },
            { label:'PII Masking', color:'#10B981' },
          ].map(b => (
            <span key={b.label} style={{ padding:'4px 10px', borderRadius:16, fontSize:11,
              fontWeight:700, background:`${b.color}18`, color:b.color,
              border:`1px solid ${b.color}30` }}>{b.label}</span>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:20, alignItems:'start' }}>

          {/* LEFT: Controls */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <MdSensors size={16} style={{ color:'#8B5CF6' }}/> Configuration
                </span>
              </div>
              <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>

                {/* Source */}
                <div className="form-group">
                  <label className="form-label">Source</label>
                  <select className="form-input" value={sourceId}
                    onChange={e => setSourceId(e.target.value)} disabled={isCrawling}>
                    <option value="generic_web">🌐 Generic Website (any URL)</option>
                    <option value="twitter">🐦 X / Twitter</option>
                    <option value="drugs_com">💊 Drugs.com Reviews</option>
                    <option value="reddit">💬 Reddit</option>
                    <option value="patient_info">🏥 Patient.info</option>
                    <option value="wikipedia">📖 Wikipedia</option>
                    {sources.filter(s => !['generic_web','twitter','drugs_com','reddit','patient_info','wikipedia'].includes(s.id)).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* URL — hidden for Twitter */}
                {sourceId !== 'twitter' && (
                  <div className="form-group">
                    <label className="form-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <MdLink size={13} style={{ color:'var(--muted)' }}/> Target URL
                    </label>
                    <input className="form-input" value={url}
                      onChange={e => setUrl(e.target.value)}
                      placeholder="https://www.drugs.com/comments/paracetamol/"
                      disabled={isCrawling} />
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                      Any public URL — crawler adapts automatically
                    </div>
                  </div>
                )}

                {/* Keyword */}
                <div className="form-group">
                  <label className="form-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <MdSearch size={13} style={{ color:'var(--muted)' }}/> Drug / Keyword *
                  </label>
                  <input className="form-input" value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    placeholder="e.g. Paracetamol, Ibuprofen…"
                    disabled={isCrawling}
                    onKeyDown={e => e.key === 'Enter' && handleDeploy()} />
                </div>

                {/* Backend offline warning */}
                {backendOk === false && (
                  <div style={{ padding:'8px 12px', background:'rgba(239,68,68,.08)',
                    border:'1px solid rgba(239,68,68,.25)', borderRadius:8,
                    fontSize:12, color:'#f38ba8' }}>
                    ⚠ Backend offline. Run: <code>python start.py</code> in the <code>backend/</code> folder.
                  </div>
                )}

                {/* Deploy button */}
                <button onClick={handleDeploy}
                  disabled={isCrawling || !keyword.trim()}
                  style={{ padding:'12px 0', borderRadius:'var(--radius)', border:'none',
                    fontSize:14, fontWeight:700, cursor: isCrawling ? 'not-allowed' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                    background: isCrawling ? '#334155' : 'linear-gradient(135deg,#8B5CF6,#3B82F6)',
                    color: isCrawling ? 'var(--muted)' : '#fff',
                    boxShadow: isCrawling ? 'none' : '0 4px 20px rgba(139,92,246,.4)',
                    transition:'all .2s' }}>
                  {isCrawling
                    ? <><MdStop size={18}/> Crawling…</>
                    : <><MdPlayArrow size={20}/> Deploy Agentic Crawler</>}
                </button>

                {logs.length > 0 && !isCrawling && (
                  <button onClick={clearAll} className="btn btn-ghost btn-sm"
                    style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
                    <MdClear size={14}/> Clear Console
                  </button>
                )}
              </div>
            </div>

            {/* Phase card */}
            <div className="card" style={{ border:`1px solid ${pc.border}`, transition:'border-color .5s' }}>
              <div className="card-body" style={{ padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)',
                  textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Crawler State</div>
                {[
                  { id:'crawling', icon:MdTerminal,    label:'Fetching & Parsing',  color:'#3B82F6' },
                  { id:'error',    icon:MdBugReport,   label:'Failure Detected',    color:'#EF4444' },
                  { id:'healing',  icon:MdAutoFixHigh, label:'AI Self-Healing',     color:'#8B5CF6' },
                  { id:'done',     icon:MdCheckCircle, label:'Extraction Complete', color:'#10B981' },
                ].map(s => {
                  const active = phase === s.id || (phase === 'done')
                  const Icon = s.icon
                  return (
                    <div key={s.id} style={{ display:'flex', alignItems:'center', gap:8,
                      padding:'6px 10px', borderRadius:6, marginBottom:3,
                      background: active ? `${s.color}10` : 'transparent',
                      border:`1px solid ${active ? s.color+'30' : 'transparent'}`,
                      transition:'all .3s' }}>
                      <Icon size={15} style={{ color: active ? s.color : 'var(--muted)', flexShrink:0 }}/>
                      <span style={{ fontSize:12, fontWeight: active ? 600 : 400,
                        color: active ? s.color : 'var(--muted)' }}>{s.label}</span>
                      {phase === 'done' && <span style={{ marginLeft:'auto', fontSize:10, color:s.color }}>✓</span>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Stats — real data from session */}
            {stats && (
              <div style={{ display:'flex', gap:8 }}>
                <StatBadge label="Fetched" value={stats.fetched} color="#10B981"/>
                <StatBadge label="Matched" value={stats.matched} color="#3B82F6"/>
                <StatBadge label="Healed"  value={stats.healed}  color="#F59E0B"/>
              </div>
            )}

            {statusMsg && (
              <div style={{ fontSize:12, padding:'8px 12px', borderRadius:8,
                background: phase === 'done' ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)',
                border: `1px solid ${phase === 'done' ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)'}`,
                color: phase === 'done' ? '#a6e3a1' : '#f38ba8', lineHeight:1.5 }}>
                {statusMsg}
              </div>
            )}
          </div>

          {/* RIGHT: Terminal */}
          <div style={{ borderRadius:12, overflow:'hidden', border:`1.5px solid ${pc.border}`,
            boxShadow: phase !== 'idle' ? pc.glow : 'none',
            transition:'border-color .5s, box-shadow .5s' }}>
            {/* Title bar */}
            <div style={{ background:'#1e1e2e', padding:'10px 16px',
              display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid #313244' }}>
              <span style={{ width:12, height:12, borderRadius:'50%', background:'#f38ba8', display:'block' }}/>
              <span style={{ width:12, height:12, borderRadius:'50%', background:'#f9e2af', display:'block' }}/>
              <span style={{ width:12, height:12, borderRadius:'50%', background:'#a6e3a1', display:'block' }}/>
              <span style={{ flex:1, textAlign:'center', fontSize:11, fontWeight:600,
                color:'#6c7086', fontFamily:'monospace' }}>
                ayuscout-crawler — live console
                {sessionId != null && <span style={{ color:'#45475a' }}> — session #{sessionId}</span>}
              </span>
              <MdTerminal size={14} style={{ color:'#6c7086' }}/>
            </div>

            {/* Terminal body */}
            <div ref={termRef} style={{ background:'#181825', minHeight:440, maxHeight:540,
              overflowY:'auto', padding:'16px 20px',
              scrollbarWidth:'thin', scrollbarColor:'#313244 #181825' }}>

              {logs.length === 0 && (
                <div style={{ color:'#585b70', fontSize:12, fontFamily:'monospace',
                  display:'flex', alignItems:'center', gap:8 }}>
                  <span>[READY] Enter a drug/keyword and click Deploy to start crawling any website</span>
                  <Cursor/>
                </div>
              )}

              {logs.map((log, i) => <LogLine key={`${log.id}-${i}`} log={log} index={i}/>)}

              {isCrawling && <div style={{ paddingTop:4 }}><Cursor/></div>}

              {phase === 'done' && logs.length > 0 && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #313244',
                  fontFamily:'monospace', fontSize:12 }}>
                  <span style={{ color:'#a6e3a1' }}>ayuscout</span>
                  <span style={{ color:'#cdd6f4' }}>@intelligence-vault:~$ </span>
                  <Cursor/>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="card" style={{ marginTop:20 }}>
          <div className="card-header">
            <span className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
              <MdAutoFixHigh size={16} style={{ color:'#8B5CF6' }}/> How It Works
            </span>
          </div>
          <div className="card-body">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
              {[
                { step:'01', title:'Fetch Any URL',     desc:'Fetches live HTML from any public URL — not limited to specific websites', color:'#3B82F6' },
                { step:'02', title:'Self-Heal DOM',     desc:'If CSS selector fails, AI scans DOM heuristics and generates a new valid selector automatically', color:'#F59E0B' },
                { step:'03', title:'Filter & Mask',     desc:'Adverse-event keyword gate + PII masking before any data enters the database', color:'#8B5CF6' },
                { step:'04', title:'Route to All Tabs', desc:'Matched records appear instantly in Data Explorer, Alerts, Reports and Notifications', color:'#10B981' },
              ].map(s => (
                <div key={s.step} style={{ padding:'14px 16px', background:'var(--bg)',
                  border:`1px solid ${s.color}25`, borderRadius:'var(--radius)',
                  borderTop:`3px solid ${s.color}` }}>
                  <div style={{ fontSize:10, fontWeight:800, color:s.color, marginBottom:6, letterSpacing:'.08em' }}>STEP {s.step}</div>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:5 }}>{s.title}</div>
                  <div style={{ fontSize:11.5, color:'var(--muted)', lineHeight:1.5 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}