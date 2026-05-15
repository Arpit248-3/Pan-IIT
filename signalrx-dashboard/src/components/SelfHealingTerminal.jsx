/**
 * SelfHealingTerminal — Real AI Crawler Console
 * ===============================================
 * PREVIOUS ISSUES FIXED:
 *  - Hardcoded default URL: 'https://en.wikipedia.org/wiki/Aspirin' → REMOVED
 *  - Hardcoded default keyword: 'Aspirin' → REMOVED
 *  - Fake fallback logs (lines 236-259) → REMOVED
 *  - streamLogs() with fake setTimeout logs → REPLACED with real DB polling
 *  - Static stats { records:'42', healed:true, confidence:'96%' } → REMOVED
 *
 * NEW BEHAVIOR:
 *  - Terminal starts EMPTY with "[READY] Waiting for crawler deployment..."
 *  - Deploy → calls POST /api/crawler/run → gets real session_id
 *  - Polls GET /api/crawler/logs/{session_id}?after_id=X every 1.2s
 *  - All log lines are real DB records from actual crawler runtime
 *  - Stats come from real session.records_fetched / records_matched
 *  - Source dropdown populated from GET /api/sources registry
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  MdTerminal, MdPlayArrow, MdStop, MdRefresh,
  MdBugReport, MdAutoFixHigh, MdCheckCircle,
  MdLink, MdSearch, MdSensors, MdMemory, MdClear,
} from 'react-icons/md'
import { API_BASE } from '../config'

const POLL_INTERVAL_MS = 1200

/* ── Log level → color/icon ──────────────────────────────────── */
const LOG_STYLE = {
  ERROR:        { color: '#f38ba8', icon: '✖' },
  HEALING:      { color: '#cba6f7', icon: '⚕' },
  SUCCESS:      { color: '#a6e3a1', icon: '✔' },
  INIT:         { color: '#89dceb', icon: '⚙' },
  FDA_ANALYSIS: { color: '#f9e2af', icon: '⚗' },
  AI_ANALYSIS:  { color: '#fab387', icon: '🧠' },
  ALERT:        { color: '#f38ba8', icon: '🚨' },
  PROJECT_UPDATE:{ color: '#a6e3a1', icon: '📊' },
  NOTIFICATION: { color: '#89b4fa', icon: '🔔' },
  FETCH:        { color: '#89b4fa', icon: '⬇' },
  PARSE:        { color: '#89b4fa', icon: '›' },
  DEDUPE:       { color: '#6c7086', icon: '⊘' },
  FILTER:       { color: '#6c7086', icon: '⊘' },
  WARNING:      { color: '#f9e2af', icon: '⚠' },
  INFO:         { color: '#89b4fa', icon: '›' },
}
const getStyle = (evt) => LOG_STYLE[evt] || LOG_STYLE.INFO

/* ── Single log line ─────────────────────────────────────────── */
function LogLine({ log, index }) {
  const s = getStyle(log.event_type)
  const ts = log.timestamp
    ? new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : ''
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', padding: '2px 0',
      animation: 'fadeInLine .2s ease',
      fontFamily: "'JetBrains Mono','Fira Code',Consolas,monospace",
    }}>
      <span style={{ color: '#585b70', fontSize: 10, flexShrink: 0, minWidth: 26, lineHeight: '20px', textAlign: 'right' }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <span style={{ color: '#585b70', flexShrink: 0, lineHeight: '20px' }}>{s.icon}</span>
      {ts && <span style={{ color: '#45475a', fontSize: 10, flexShrink: 0, lineHeight: '20px' }}>{ts}</span>}
      <span style={{ fontSize: 12, lineHeight: '20px', flex: 1, color: s.color, wordBreak: 'break-word' }}>
        {log.message}
      </span>
    </div>
  )
}

function Cursor() {
  return <span style={{ display:'inline-block', width:8, height:15, background:'#a6e3a1', marginLeft:4, verticalAlign:'middle', animation:'blink 1s step-end infinite' }} />
}

function StatBadge({ label, value, color }) {
  return (
    <div style={{ padding:'10px 16px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, textAlign:'center', flex:1 }}>
      <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:800, color }}>{value}</div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */
export default function SelfHealingTerminal() {
  // ── Inputs — NO hardcoded defaults ──────────────────────────
  const [url,     setUrl]     = useState('')
  const [keyword, setKeyword] = useState('')
  const [sourceId, setSourceId] = useState('generic_web')

  // ── Sources from registry ────────────────────────────────────
  const [sources, setSources] = useState([])

  // ── Session & polling state ──────────────────────────────────
  const [sessionId,  setSessionId]  = useState(null)
  const [logs,       setLogs]       = useState([])
  const [lastLogId,  setLastLogId]  = useState(0)
  const [isCrawling, setIsCrawling] = useState(false)
  const [phase,      setPhase]      = useState('idle')
  const [stats,      setStats]      = useState(null)

  const terminalRef  = useRef(null)
  const pollTimerRef = useRef(null)

  // ── Auto-scroll ──────────────────────────────────────────────
  useEffect(() => {
    if (terminalRef.current)
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
  }, [logs])

  // ── Cleanup polling on unmount ───────────────────────────────
  useEffect(() => () => clearInterval(pollTimerRef.current), [])

  // ── Load source registry ─────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/sources`)
      .then(r => r.json())
      .then(d => { if (d.status === 'success') setSources(d.sources) })
      .catch(() => {})
  }, [])

  // ── Phase detection from log events ─────────────────────────
  const updatePhase = useCallback((newLogs) => {
    for (const l of [...newLogs].reverse()) {
      if (l.event_type === 'ERROR')    { setPhase('error');   return }
      if (l.event_type === 'HEALING')  { setPhase('healing'); return }
      if (l.event_type === 'SUCCESS')  { setPhase('done');    return }
    }
  }, [])

  // ── Polling loop ─────────────────────────────────────────────
  const startPolling = useCallback((sid) => {
    let cursor = 0
    clearInterval(pollTimerRef.current)

    pollTimerRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API_BASE}/api/crawler/logs/${sid}?after_id=${cursor}`)
        const data = await res.json()

        if (data.logs?.length) {
          cursor = data.last_id
          setLastLogId(cursor)
          setLogs(prev => [...prev, ...data.logs])
          updatePhase(data.logs)
        }

        // Update stats from real session data
        if (data.stats) {
          setStats({
            fetched:  data.stats.records_fetched,
            matched:  data.stats.records_matched,
            healed:   data.stats.healing_attempts,
          })
        }

        // Stop polling when session is done
        if (data.session_status === 'completed' || data.session_status === 'failed') {
          clearInterval(pollTimerRef.current)
          setIsCrawling(false)
          setPhase(data.session_status === 'failed' ? 'error' : 'done')
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, POLL_INTERVAL_MS)
  }, [updatePhase])

  // ── Clear all ────────────────────────────────────────────────
  const clearAll = () => {
    clearInterval(pollTimerRef.current)
    setLogs([])
    setSessionId(null)
    setLastLogId(0)
    setPhase('idle')
    setIsCrawling(false)
    setStats(null)
  }

  // ── Deploy handler ───────────────────────────────────────────
  const handleDeploy = async () => {
    if (isCrawling) return
    if (!keyword.trim()) {
      alert('Please enter a drug/keyword before deploying.')
      return
    }

    clearAll()
    setIsCrawling(true)
    setPhase('crawling')

    try {
      const payload = {
        url:       url.trim() || '',
        keyword:   keyword.trim(),
        source_id: sourceId,
        max_records: 15,
      }

      const res  = await fetch(`${API_BASE}/api/crawler/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)

      setSessionId(data.session_id)
      startPolling(data.session_id)

    } catch (err) {
      // Real error — show it, don't inject fake logs
      setLogs([{
        id: -1,
        event_type: 'ERROR',
        level: 'ERROR',
        message: `[ERROR] Backend connection failed: ${err.message}. Ensure server.py is running.`,
        timestamp: new Date().toISOString(),
      }])
      setPhase('error')
      setIsCrawling(false)
    }
  }

  const phaseColors = {
    idle:    { border: 'var(--border)',       glow: 'none' },
    crawling:{ border: 'rgba(59,130,246,.4)', glow: '0 0 20px rgba(59,130,246,.15)' },
    error:   { border: 'rgba(239,68,68,.4)',  glow: '0 0 20px rgba(239,68,68,.12)' },
    healing: { border: 'rgba(139,92,246,.5)', glow: '0 0 24px rgba(139,92,246,.2)' },
    done:    { border: 'rgba(16,185,129,.4)', glow: '0 0 20px rgba(16,185,129,.12)' },
  }
  const pc = phaseColors[phase] || phaseColors.idle

  return (
    <>
      <style>{`
        @keyframes fadeInLine { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
        @keyframes blink { 50%{opacity:0} }
        @keyframes pulseGlow { 0%,100%{box-shadow:${pc.glow}} 50%{box-shadow:none} }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Hero */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
          <div style={{ width:52, height:52, borderRadius:12,
            background:'linear-gradient(135deg,rgba(139,92,246,.2),rgba(59,130,246,.15))',
            border:'1px solid rgba(139,92,246,.3)', color:'#8B5CF6',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <MdMemory size={28} />
          </div>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-.02em', marginBottom:2 }}>
              Self-Healing Agentic Crawler
            </h1>
            <p style={{ fontSize:13, color:'var(--muted)' }}>
              Real-time AI console — all logs are live backend events from actual crawler execution
            </p>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            {[
              { label:'Vision AI',    color:'#8B5CF6' },
              { label:'Self-Healing', color:'#3B82F6' },
              { label:'PII Masking',  color:'#10B981' },
            ].map(b => (
              <span key={b.label} style={{ padding:'4px 12px', borderRadius:16, fontSize:11, fontWeight:700,
                background:`${b.color}18`, color:b.color, border:`1px solid ${b.color}30` }}>
                {b.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', gap:20, alignItems:'start' }}>

          {/* LEFT: Controls */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <MdSensors size={16} style={{ color:'#8B5CF6' }} /> Crawler Configuration
                </span>
              </div>
              <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>

                {/* Source selector */}
                <div className="form-group">
                  <label className="form-label">Source</label>
                  <select
                    className="form-input"
                    value={sourceId}
                    onChange={e => setSourceId(e.target.value)}
                    disabled={isCrawling}
                  >
                    <option value="generic_web">Generic Website</option>
                    <option value="twitter">X / Twitter</option>
                    {sources.filter(s => !['generic_web','twitter'].includes(s.id)).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Target URL — hidden for Twitter/API sources */}
                {sourceId !== 'twitter' && (
                  <div className="form-group">
                    <label className="form-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <MdLink size={13} style={{ color:'var(--muted)' }} /> Target URL
                    </label>
                    <input
                      className="form-input"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      placeholder="https://patient-forum.org/..."
                      disabled={isCrawling}
                    />
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
                      Leave blank to use source registry default URL
                    </div>
                  </div>
                )}

                {/* Keyword */}
                <div className="form-group">
                  <label className="form-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <MdSearch size={13} style={{ color:'var(--muted)' }} /> Drug / Keyword *
                  </label>
                  <input
                    className="form-input"
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    placeholder="e.g. Ibuprofen, Metformin…"
                    disabled={isCrawling}
                  />
                </div>

                {/* Deploy */}
                <button
                  onClick={handleDeploy}
                  disabled={isCrawling || !keyword.trim()}
                  style={{
                    padding:'13px 0', borderRadius:'var(--radius)', border:'none',
                    fontSize:14, fontWeight:700, cursor: isCrawling ? 'not-allowed' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                    background: isCrawling ? '#334155' : 'linear-gradient(135deg,#8B5CF6,#3B82F6)',
                    color: isCrawling ? 'var(--muted)' : '#fff',
                    boxShadow: isCrawling ? 'none' : '0 4px 20px rgba(139,92,246,.4)',
                    transition:'all .2s',
                  }}
                >
                  {isCrawling
                    ? <><MdStop size={18} /> Crawling…</>
                    : <><MdPlayArrow size={20} /> Deploy Agentic Crawler</>}
                </button>

                {(logs.length > 0 && !isCrawling) && (
                  <button onClick={clearAll} className="btn btn-ghost btn-sm"
                    style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
                    <MdClear size={14} /> Clear Console
                  </button>
                )}
              </div>
            </div>

            {/* Phase state card */}
            <div className="card" style={{ border:`1px solid ${pc.border}`, transition:'border-color .5s' }}>
              <div className="card-body" style={{ padding:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase',
                  letterSpacing:'.05em', marginBottom:10 }}>Crawler State</div>
                {[
                  { id:'crawling', icon:MdTerminal,    label:'Connecting & Fetching', color:'#3B82F6' },
                  { id:'error',    icon:MdBugReport,   label:'Failure Detected',      color:'#EF4444' },
                  { id:'healing',  icon:MdAutoFixHigh, label:'AI Self-Healing',       color:'#8B5CF6' },
                  { id:'done',     icon:MdCheckCircle, label:'Extraction Complete',   color:'#10B981' },
                ].map(s => {
                  const active = phase === s.id || (phase === 'done' && s.id !== 'idle')
                  const Icon = s.icon
                  return (
                    <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
                      borderRadius:6, marginBottom:4,
                      background: active ? `${s.color}10` : 'transparent',
                      border: `1px solid ${active ? s.color+'30' : 'transparent'}`,
                      transition:'all .3s' }}>
                      <Icon size={16} style={{ color: active ? s.color : 'var(--muted)', flexShrink:0 }} />
                      <span style={{ fontSize:12, fontWeight: active ? 600 : 400,
                        color: active ? s.color : 'var(--muted)' }}>{s.label}</span>
                      {phase === 'done' && <span style={{ marginLeft:'auto', fontSize:10, color:s.color }}>✓</span>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Real stats — only when session has data */}
            {stats && (
              <div style={{ display:'flex', gap:10, animation:'fadeInLine .4s ease' }}>
                <StatBadge label="Fetched"  value={stats.fetched}  color="#10B981" />
                <StatBadge label="Matched"  value={stats.matched}  color="#3B82F6" />
                <StatBadge label="Healed"   value={stats.healed}   color="#F59E0B" />
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
              <span style={{ width:12, height:12, borderRadius:'50%', background:'#f38ba8', display:'block' }} />
              <span style={{ width:12, height:12, borderRadius:'50%', background:'#f9e2af', display:'block' }} />
              <span style={{ width:12, height:12, borderRadius:'50%', background:'#a6e3a1', display:'block' }} />
              <span style={{ flex:1, textAlign:'center', fontSize:11, fontWeight:600,
                color:'#6c7086', fontFamily:'monospace' }}>
                ayuscout-crawler — live console
                {sessionId && <span style={{ color:'#45475a' }}> — session #{sessionId}</span>}
              </span>
              <MdTerminal size={14} style={{ color:'#6c7086' }} />
            </div>

            {/* Terminal body */}
            <div ref={terminalRef} style={{ background:'#181825', minHeight:420, maxHeight:520,
              overflowY:'auto', padding:'16px 20px',
              scrollbarWidth:'thin', scrollbarColor:'#313244 #181825' }}>

              {/* Empty / ready state */}
              {logs.length === 0 && !isCrawling && (
                <div style={{ color:'#585b70', fontSize:12, fontFamily:'monospace',
                  display:'flex', alignItems:'center', gap:8 }}>
                  <span>[READY] Waiting for crawler deployment…</span>
                  <Cursor />
                </div>
              )}

              {/* Real log lines from DB */}
              {logs.map((log, i) => <LogLine key={log.id ?? i} log={log} index={i} />)}

              {isCrawling && <div style={{ paddingTop:4 }}><Cursor /></div>}

              {phase === 'done' && logs.length > 0 && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #313244',
                  fontFamily:'monospace', fontSize:12, color:'#45475a' }}>
                  <span style={{ color:'#a6e3a1' }}>ayuscout</span>
                  <span style={{ color:'#cdd6f4' }}>@intelligence-vault</span>
                  <span style={{ color:'#cdd6f4' }}>:~$ </span>
                  <Cursor />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="card" style={{ marginTop:20 }}>
          <div className="card-header">
            <span className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
              <MdAutoFixHigh size={16} style={{ color:'#8B5CF6' }} /> How Self-Healing Works
            </span>
          </div>
          <div className="card-body">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
              {[
                { step:'01', title:'Fetch & Parse',    desc:'Fetches live HTML DOM from target URL and parses page structure',              color:'#3B82F6' },
                { step:'02', title:'Selector Test',    desc:'Attempts extraction using known CSS selectors from the source registry',       color:'#F59E0B' },
                { step:'03', title:'AI Self-Heal',     desc:'On failure, Vision AI scans DOM heuristics and generates a new valid selector', color:'#8B5CF6' },
                { step:'04', title:'Persist & Route',  desc:'Saves healed config; pipes PII-masked records through canonical AI pipeline',  color:'#10B981' },
              ].map(s => (
                <div key={s.step} style={{ padding:'14px 16px', background:'var(--bg)',
                  border:`1px solid ${s.color}25`, borderRadius:'var(--radius)',
                  borderTop:`3px solid ${s.color}` }}>
                  <div style={{ fontSize:10, fontWeight:800, color:s.color, marginBottom:6, letterSpacing:'.08em' }}>STEP {s.step}</div>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>{s.title}</div>
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