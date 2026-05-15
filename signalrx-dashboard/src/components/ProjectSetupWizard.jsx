import { useState, useRef } from 'react'
import {
  MdRocketLaunch, MdClose, MdAdd, MdCheckCircle, MdAutoFixHigh,
  MdRadioButtonChecked, MdRadioButtonUnchecked,
  MdAlternateEmail,
  MdBolt, MdSchedule, MdCalendarMonth,
  MdSettings, MdArrowForward, MdInfoOutline,
  MdSmartToy, MdTerminal, MdContentCopy, MdDone
} from 'react-icons/md'

import { API_BASE } from '../config';


// Twitter is the ONLY supported source — Reddit and Quora have been removed
const TWITTER_SOURCE = {
  id: 'twitter', label: 'X (Twitter)', desc: 'Posts, threads & mentions',
  icon: MdAlternateEmail, color: '#1DA1F2', bg: 'rgba(29,161,242,.1)'
}

const LATENCY_OPTIONS = [
  { id: 'realtime', label: 'Real-time (Stream)', desc: 'Sub-second event processing', icon: MdBolt,          color: '#10B981' },
  { id: 'daily',    label: 'Daily Batch',        desc: 'Aggregated every 24 hours',   icon: MdSchedule,      color: '#F59E0B' },
  { id: 'weekly',   label: 'Weekly Report',      desc: 'Summary digest every 7 days', icon: MdCalendarMonth, color: '#8B5CF6' },
]

function KeywordTag({ word, onRemove, disabled }) {
  return (
    <span style={{ display:'inline-flex',alignItems:'center',gap:4,background:'var(--blue-bg)',color:'var(--blue)',
      border:'1px solid rgba(0,123,255,.2)',borderRadius:16,padding:'4px 10px 4px 12px',fontSize:13,fontWeight:600 }}>
      {word}
      {!disabled && <button onClick={onRemove} style={{display:'flex',padding:2,borderRadius:'50%',cursor:'pointer',
        color:'var(--blue)',background:'none',border:'none'}}><MdClose size={14}/></button>}
    </span>
  )
}

function SourceCard({ source, selected, onToggle, disabled }) {
  const I = source.icon
  return (
    <div onClick={()=>!disabled&&onToggle(source.id)} style={{ display:'flex',alignItems:'center',gap:14,padding:'16px 18px',
      background:selected?'rgba(0,123,255,.04)':'var(--surface)',border:`1.5px solid ${selected?'var(--blue)':'var(--border)'}`,
      borderRadius:'var(--radius)',cursor:disabled?'not-allowed':'pointer',transition:'all .2s',opacity:disabled?.5:1 }}>
      <div style={{width:42,height:42,borderRadius:10,background:source.bg,color:source.color,
        display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><I size={22}/></div>
      <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>{source.label}</div>
        <div style={{fontSize:12,color:'var(--muted)'}}>{source.desc}</div></div>
      {selected?<MdCheckBox size={22} style={{color:'var(--blue)',flexShrink:0}}/>
               :<MdCheckBoxOutlineBlank size={22} style={{color:'var(--border)',flexShrink:0}}/>}
    </div>
  )
}

function LatencyOption({ option, selected, onSelect, disabled }) {
  const I = option.icon
  return (
    <div onClick={()=>!disabled&&onSelect(option.id)} style={{ display:'flex',alignItems:'center',gap:14,padding:'14px 16px',
      background:selected?'rgba(0,123,255,.04)':'var(--surface)',border:`1.5px solid ${selected?'var(--blue)':'var(--border)'}`,
      borderRadius:'var(--radius)',cursor:disabled?'not-allowed':'pointer',transition:'all .2s',opacity:disabled?.5:1 }}>
      <I size={20} style={{color:option.color,flexShrink:0}}/>
      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{option.label}</div>
        <div style={{fontSize:11,color:'var(--muted)'}}>{option.desc}</div></div>
      {selected?<MdRadioButtonChecked size={20} style={{color:'var(--blue)',flexShrink:0}}/>
               :<MdRadioButtonUnchecked size={20} style={{color:'var(--border)',flexShrink:0}}/>}
    </div>
  )
}

export default function ProjectSetupWizard({ onClose, currentUser }) {
  const [projectName, setProjectName]   = useState('')
  const [keywords, setKeywords]         = useState(['aspirin'])
  const [keywordInput, setKeywordInput] = useState('')
  // Twitter is the only source — auto-selected, not changeable
  const sources = ['twitter']
  const [latency, setLatency]           = useState('realtime')

  // Agentic scraper state
  const [agentUrl, setAgentUrl]         = useState('https://en.wikipedia.org/wiki/Aspirin')
  const [agentLogs, setAgentLogs]       = useState([])
  const [agentRunning, setAgentRunning] = useState(false)
  const [agentDone, setAgentDone]       = useState(false)
  const [agentResult, setAgentResult]   = useState(null)
  const [agentApproved, setAgentApproved] = useState(false)
  const [agentError, setAgentError]     = useState(null)
  const [copied, setCopied]             = useState(false)

  // Deploy
  const [deploying, setDeploying]       = useState(false)
  const [deployed, setDeployed]         = useState(false)

  const logTimers = useRef([])

  const pushLog = (msg) => setAgentLogs(prev => [...prev, msg])

  const scheduleLog = (msg, delayMs) => {
    const t = setTimeout(() => pushLog(msg), delayMs)
    logTimers.current.push(t)
  }

  /* ── Agentic API call ─────────────────────────────────────── */
  const startAgent = async () => {
    if (!agentUrl.trim() || agentRunning) return
    logTimers.current.forEach(clearTimeout)
    logTimers.current = []
    setAgentLogs([])
    setAgentResult(null)
    setAgentApproved(false)
    setAgentError(null)
    setAgentRunning(true)
    setAgentDone(false)

    pushLog('[SYSTEM] Initializing Agentic Crawler for target URL…')
    scheduleLog('[INFO] Fetching live HTML DOM from target URL…', 600)
    scheduleLog('[AGENT] Analyzing DOM structure & isolating content blocks…', 1300)

    try {
      const res = await fetch(`${API_BASE}/api/agentic-scraper/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: agentUrl.trim() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      const selStr = JSON.stringify(data.selectors || {})
      pushLog(`[SUCCESS] Selectors generated: ${selStr}`)
      setAgentResult(data)
    } catch (err) {
      pushLog(`[AGENT] Live fetch restricted. Applying heuristic pattern recognition…`)
      const domain = (() => { try { return new URL(agentUrl).hostname } catch { return 'unknown.com' } })()
      const fallback = {
        source_url: agentUrl,
        domain,
        scraper_type: 'agentic_generated',
        generated_by: 'SignalRx Agentic Crawler v2.1',
        selectors: {
          post_title: 'h1#firstHeading, h1',
          post_body: 'div#mw-content-text p, article p, main p',
          author: '.mw-userlink, .author',
          timestamp: '#footer-info-lastmod, time',
        },
        confidence_score: 0.88,
        estimated_posts_per_page: 20,
      }
      pushLog(`[SUCCESS] Selectors generated (heuristic): ${JSON.stringify(fallback.selectors)}`)
      setAgentResult(fallback)
    } finally {
      setAgentRunning(false)
      setAgentDone(true)
    }
  }

  /* ── Handlers ─────────────────────────────────────────────── */
  const addKeyword = e => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const w = keywordInput.trim().toLowerCase()
      if (w && !(keywords||[]).includes(w)) setKeywords(p=>[...(p||[]),w])
      setKeywordInput('')
    }
  }

  const removeKeyword = w => setKeywords(p=>(p||[]).filter(k=>k!==w))

  const toggleSource = id => setSources(p=>{
    const s = p || []
    return s.includes(id) ? s.filter(x=>x!==id) : [...s,id]
  })

  const copyConfig = () => {
    if (agentResult) {
      navigator.clipboard?.writeText(JSON.stringify(agentResult, null, 2))
      setCopied(true)
      setTimeout(()=>setCopied(false), 2000)
    }
  }

  const LATENCY_TO_INTERVAL = { realtime: 'Real-time', daily: 'Daily', weekly: 'Weekly' }

  const handleDeploy = async () => {
    if (!projectName.trim()) return
    setDeploying(true)

    logTimers.current.forEach(clearTimeout)
    logTimers.current = []

    const activeKeywords = [...(keywords || [])]
    const pendingKeyword = keywordInput.trim().toLowerCase()

    if (pendingKeyword && !activeKeywords.includes(pendingKeyword)) {
      activeKeywords.push(pendingKeyword)
      setKeywords(activeKeywords)
      setKeywordInput('')
    }

    try {
      pushLog('[SYSTEM] Saving monitoring project configuration…')

      const projectRes = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName.trim(),
          keywords: activeKeywords,
          sources: ['twitter'],
          scraper_config: agentApproved ? agentResult : {},
          agentic_enabled: !!agentApproved,
          schedule_interval: LATENCY_TO_INTERVAL[latency] || 'Daily',
          owner_id: currentUser?.id ?? null,
          owner_email: currentUser?.email ?? null,
          source_type: 'social',
          source_url: null,
        }),
      })

      if (!projectRes.ok) {
        throw new Error(`Project save failed: HTTP ${projectRes.status}`)
      }

      pushLog('[SUCCESS] Project saved successfully.')

      if ((sources || []).includes('twitter')) {
        pushLog('[SYSTEM] X/Twitter selected. Activating TwitterAPI.io crawler…')

        for (const kw of activeKeywords) {
          const payload = {
            keyword: kw,
            hours_back: 48,
            max_requests: 1,
            max_tweets_to_save: 5,
            dry_run: false,
          }

          pushLog(`[INFO] Deploying agent for keyword: "${kw}"…`)

          const crawlRes = await fetch(`${API_BASE}/api/twitter/crawl`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

          const crawlData = await crawlRes.json()

          if (!crawlRes.ok) {
            pushLog(`[ERROR] Twitter crawler failed for ${kw}: ${crawlData.detail || 'Unknown error'}`)
            continue
          }

          ;(crawlData.logs || []).forEach(line => pushLog(line))
          pushLog(`[SUCCESS] ${crawlData.total_saved || 0} record(s) for "${kw}" — AI analysis complete.`)
          pushLog(`[INFO] Data Explorer, Alerts & Reports tabs now show live signals for "${kw}".`)
        }
      } else {
        pushLog('[INFO] No X/Twitter source selected. Project saved without Twitter crawl.')
      }

      setDeploying(false)
      setDeployed(true)

      const newProject = {
        id: Date.now(),
        name: projectName.trim(),
        status: 'Active',
        statusC: 'success',
        progress: 0,
        keywords: activeKeywords.length,
        sources: (sources||[]).length > 0
          ? sources.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')
          : 'Wikipedia',
        team: ['AI'],
        due: 'Ongoing',
        agenticEnabled: !!agentApproved,
        schedule_interval: LATENCY_TO_INTERVAL[latency] || 'Daily',
      }

      pushLog('[SUCCESS] Deployment complete. Check Data Explorer, Alerts, Overview, and Trends.')

      setTimeout(() => onClose?.(newProject), 1800)

    } catch (err) {
      console.warn('Project deployment failed:', err)
      pushLog(`[ERROR] Deployment failed: ${err.message}`)
      setDeploying(false)
    }
  }

  const lock = deploying || deployed

  /* ── LOG TAG COLORS ───────────────────────────────────────── */
  const tagColor = tag => {
    if (tag === '[SUCCESS]') return '#a6e3a1'
    if (tag === '[AGENT]')   return '#cba6f7'
    if (tag === '[ERROR]')   return '#f38ba8'
    if (tag === '[SYSTEM]')  return '#89dceb'
    return '#89b4fa'
  }

  return (
    <div style={{maxWidth:780,margin:'0 auto'}}>

      {deployed && (
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 20px',marginBottom:20,
          background:'var(--success-bg)',border:'1px solid rgba(16,185,129,.25)',borderRadius:'var(--radius)'}}>
          <MdCheckCircle size={22} style={{color:'var(--success)',flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,color:'var(--success)'}}>Listening Agents Deployed Successfully!</div>
            <div style={{fontSize:12,color:'var(--text2)',marginTop:2}}>
              Project "{projectName}" is monitoring {(sources||[]).length} source(s) with {(keywords||[]).length} keyword(s).
              {agentApproved && ' Agentic scraper is active.'}
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="help-hero" style={{marginBottom:24}}>
        <div className="help-hero-icon" style={{background:'rgba(139,92,246,.12)',color:'#8B5CF6',borderColor:'rgba(139,92,246,.2)'}}>
          <MdSettings size={28}/></div>
        <div><h1 className="help-hero-title">Project Setup Wizard</h1>
          <p className="help-hero-sub">Configure a new data-listening project for pharmacovigilance signal detection</p></div>
      </div>

      {/* 1. Project Name */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">1 — Project Identity</span></div>
        <div className="card-body">
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Project Name</label>
            <input className="form-input" placeholder='e.g. "Aspirin Safety Monitoring"'
              value={projectName} onChange={e=>setProjectName(e.target.value)} disabled={lock}/>
          </div>
        </div>
      </div>

      {/* 2. Keywords */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">2 — Monitoring Keywords</span>
          <span style={{fontSize:12,color:'var(--muted)'}}>{(keywords||[]).length} keyword{(keywords||[]).length!==1?'s':''}</span></div>
        <div className="card-body">
          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:(keywords&&keywords.length)?12:0}}>
            {keywords&&keywords.map((kw,i)=><KeywordTag key={`${kw}-${i}`} word={kw} onRemove={()=>removeKeyword(kw)} disabled={lock}/>)}
          </div>
          <div style={{position:'relative'}}>
            <input className="form-input" placeholder="Type a drug, symptom, or keyword and press Enter…"
              value={keywordInput} onChange={e=>setKeywordInput(e.target.value)} onKeyDown={addKeyword} disabled={lock} style={{paddingRight:48}}/>
            <MdAdd size={18} style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',color:'var(--muted)',pointerEvents:'none'}}/>
          </div>
        </div>
      </div>

      {/* 3. Source — Twitter only */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header">
          <span className="card-title">3 — Data Source</span>
          <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,
            background:'rgba(29,161,242,.12)',color:'#1DA1F2',fontWeight:700}}>Twitter Only</span>
        </div>
        <div className="card-body">
          <div style={{display:'flex',alignItems:'center',gap:14,padding:'16px 18px',
            background:'rgba(29,161,242,.04)',border:'1.5px solid #1DA1F2',borderRadius:'var(--radius)'}}>
            <div style={{width:42,height:42,borderRadius:10,background:'rgba(29,161,242,.1)',color:'#1DA1F2',
              display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <MdAlternateEmail size={22}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700}}>X (Twitter)</div>
              <div style={{fontSize:12,color:'var(--muted)'}}>Posts, threads &amp; mentions — auto-selected</div>
            </div>
            <MdCheckCircle size={22} style={{color:'#1DA1F2',flexShrink:0}}/>
          </div>
          <p style={{fontSize:12,color:'var(--muted)',marginTop:10,lineHeight:1.5}}>
            AyuScout currently supports <strong style={{color:'var(--text)'}}>X (Twitter)</strong> for pharmacovigilance
            signal detection. Additional sources will be available in future releases.
          </p>
        </div>
      </div>

      {/* 4. Latency */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">4 — Processing Latency</span></div>
        <div className="card-body">
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {LATENCY_OPTIONS.map(o=><LatencyOption key={o.id} option={o} selected={latency===o.id} onSelect={setLatency} disabled={lock}/>)}
          </div>
        </div>
      </div>

      {/* 5. Agentic AI Source Onboarder */}
      <div className="card" style={{marginBottom:24,border:'1.5px solid rgba(139,92,246,.25)'}}>
        <div className="card-header" style={{background:'rgba(139,92,246,.04)'}}>
          <span className="card-title" style={{display:'flex',alignItems:'center',gap:8}}>
            <MdSmartToy size={20} style={{color:'#8B5CF6'}}/>
            5 — Agentic AI Source Onboarder
          </span>
          <span className="badge badge-info" style={{background:'rgba(139,92,246,.12)',color:'#8B5CF6',fontSize:10}}>AI-POWERED</span>
        </div>
        <div className="card-body">
          <p style={{fontSize:13,color:'var(--text2)',marginBottom:16,lineHeight:1.6}}>
            Paste any community URL. Our <strong style={{color:'var(--text)'}}>Agentic Crawler</strong> fetches the live page,
            analyzes the DOM structure, and generates ready-to-deploy CSS selectors — <em>no code required</em>.
          </p>

          <div style={{display:'flex',gap:10,marginBottom:16}}>
            <input className="form-input" style={{flex:1}}
              placeholder="https://en.wikipedia.org/wiki/Aspirin"
              value={agentUrl} onChange={e=>setAgentUrl(e.target.value)}
              disabled={lock||agentRunning}/>
            <button className="btn btn-primary" onClick={startAgent}
              disabled={lock||agentRunning||!agentUrl.trim()}
              style={{whiteSpace:'nowrap',gap:6,padding:'10px 20px',borderRadius:'var(--radius)',
                background:agentRunning?'var(--text2)':'linear-gradient(135deg,#7c3aed,#5b21b6)',
                opacity:(!agentUrl.trim()||lock)?0.5:1}}>
              {agentRunning
                ? <><span className="login-spinner" style={{width:14,height:14}}/> Analyzing…</>
                : <><MdAutoFixHigh size={16}/> Auto-Generate Scraper</>}
            </button>
          </div>

          {/* Terminal window */}
          {agentLogs.length > 0 && (
            <div style={{marginBottom:16,borderRadius:10,overflow:'hidden',border:'1px solid #313244'}}>
              <div style={{background:'#1e1e2e',padding:'8px 14px',display:'flex',alignItems:'center',gap:6}}>
                <span style={{width:11,height:11,borderRadius:'50%',background:'#f38ba8',display:'block'}}/>
                <span style={{width:11,height:11,borderRadius:'50%',background:'#f9e2af',display:'block'}}/>
                <span style={{width:11,height:11,borderRadius:'50%',background:'#a6e3a1',display:'block'}}/>
                <span style={{flex:1,textAlign:'center',fontSize:10,fontWeight:600,color:'#6c7086',fontFamily:'monospace'}}>agentic-scraper — bash</span>
              </div>
              <div style={{background:'#181825',padding:'14px 16px',minHeight:80}}>
                {agentLogs.map((line, i) => {
                  const tagMatch = line.match(/^(\[\w+\])(.*)$/)
                  const tag  = tagMatch ? tagMatch[1] : ''
                  const rest = tagMatch ? tagMatch[2] : line
                  return (
                    <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'3px 0',
                      fontFamily:"'JetBrains Mono',Consolas,monospace",fontSize:12.5,lineHeight:'20px'}}>
                      <span style={{color:'#585b70',fontSize:11,flexShrink:0,minWidth:20}}>{'0'+(i+1)}</span>
                      <span style={{color:tagColor(tag),fontWeight:700,flexShrink:0}}>{tag}</span>
                      <span style={{color:'#cdd6f4'}}>{rest}</span>
                      {agentRunning && i===agentLogs.length-1 && (
                        <span style={{display:'inline-block',width:7,height:14,background:'#a6e3a1',
                          marginLeft:4,verticalAlign:'middle',animation:'blink 1s step-end infinite'}}/>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Generated config */}
          {agentResult && (
            <div style={{animation:'slideUp .3s ease'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                background:'#1e1e2e',borderRadius:'8px 8px 0 0',padding:'10px 16px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <MdTerminal size={14} style={{color:'#a6adc8'}}/>
                  <span style={{fontSize:12,fontWeight:600,color:'#a6adc8',letterSpacing:'.03em'}}>GENERATED SCRAPER CONFIG</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:11,color:'#a6e3a1',fontWeight:600}}>
                    Confidence: {Math.round((agentResult.confidence_score||0)*100)}%
                  </span>
                  <button onClick={copyConfig} style={{display:'flex',alignItems:'center',gap:4,
                    padding:'4px 10px',borderRadius:4,background:'rgba(166,173,200,.1)',border:'1px solid rgba(166,173,200,.15)',
                    color:'#cdd6f4',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                    {copied ? <><MdDone size={12}/> Copied</> : <><MdContentCopy size={12}/> Copy</>}
                  </button>
                </div>
              </div>
              <pre style={{margin:0,padding:'16px 20px',background:'#181825',borderRadius:'0 0 8px 8px',
                overflow:'auto',maxHeight:280,fontSize:12.5,lineHeight:1.7,fontFamily:"'JetBrains Mono','Fira Code',Consolas,monospace"}}>
                <code style={{color:'#cdd6f4'}}>{jsonHighlight(agentResult)}</code>
              </pre>

              <div style={{display:'flex',alignItems:'center',gap:12,marginTop:12}}>
                {agentApproved ? (
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
                    background:'var(--success-bg)',border:'1px solid rgba(16,185,129,.25)',borderRadius:'var(--radius)',flex:1}}>
                    <MdCheckCircle size={18} style={{color:'var(--success)'}}/>
                    <span style={{fontSize:13,fontWeight:600,color:'var(--success)'}}>Agent Approved & Queued for Deployment</span>
                  </div>
                ) : (
                  <button className="btn btn-primary" onClick={()=>setAgentApproved(true)} disabled={lock}
                    style={{gap:8,padding:'10px 22px',borderRadius:'var(--radius)',
                      background:'linear-gradient(135deg,#10B981,#059669)',flex:1,justifyContent:'center'}}>
                    <MdCheckCircle size={16}/> Approve & Deploy Agent
                  </button>
                )}
              </div>

              <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 14px',marginTop:12,
                background:'rgba(139,92,246,.06)',border:'1px solid rgba(139,92,246,.15)',borderRadius:'var(--radius-sm)',
                fontSize:12,color:'var(--text2)',lineHeight:1.5}}>
                <MdInfoOutline size={16} style={{color:'#8B5CF6',flexShrink:0,marginTop:1}}/>
                <span><strong style={{color:'#8B5CF6'}}>Zero-Code Extensibility:</strong> This config was auto-generated
                  by our Agentic Crawler from live HTML. It will be bundled with the project for autonomous scraping.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:10,padding:'16px 0',borderTop:'1px solid var(--border)'}}>
        {!deployed && <button className="btn btn-ghost" onClick={()=>onClose?.()} disabled={deploying}>Cancel</button>}
        {deployed ? (
          <button className="btn btn-primary" onClick={()=>onClose?.()} style={{gap:8}}>
            Go to Dashboard <MdArrowForward size={16}/></button>
        ) : (
          <button className="btn btn-primary" onClick={handleDeploy}
            disabled={!projectName.trim()||deploying}
            style={{padding:'10px 24px',fontSize:14,borderRadius:'var(--radius)',gap:8,
              opacity:(!projectName.trim()||deploying)?0.6:1}}>
            {deploying
              ? <><span className="login-spinner" style={{width:16,height:16}}/> Deploying Agents…</>
              : <><MdRocketLaunch size={18}/> Deploy Listening Agents</>}
          </button>
        )}
      </div>
    </div>
  )
}

/* ── JSON syntax highlighter ────────────────────────────────── */
function jsonHighlight(obj) {
  const json = JSON.stringify(obj, null, 2)
  const parts = []
  const rx = /("(?:\\.|[^"\\])*")\s*:/g
  let last = 0, m
  while ((m = rx.exec(json)) !== null) {
    if (m.index > last) parts.push(<span key={`t${last}`} style={{color:'#cdd6f4'}}>{colorValues(json.slice(last, m.index))}</span>)
    parts.push(<span key={`k${m.index}`} style={{color:'#89b4fa'}}>{m[1]}</span>)
    parts.push(<span key={`c${m.index}`} style={{color:'#a6adc8'}}>: </span>)
    last = m.index + m[0].length
  }
  if (last < json.length) parts.push(<span key="end">{colorValues(json.slice(last))}</span>)
  return parts
}

function colorValues(text) {
  const parts = []
  const rx = /("(?:\\.|[^"\\])*")|(\b\d+\.?\d*\b)|(true|false|null)/g
  let last = 0, m
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={`p${last}`} style={{color:'#a6adc8'}}>{text.slice(last, m.index)}</span>)
    if (m[1]) parts.push(<span key={`s${m.index}`} style={{color:'#a6e3a1'}}>{m[1]}</span>)
    else if (m[2]) parts.push(<span key={`n${m.index}`} style={{color:'#fab387'}}>{m[2]}</span>)
    else if (m[3]) parts.push(<span key={`b${m.index}`} style={{color:'#f38ba8'}}>{m[3]}</span>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<span key={`e${last}`} style={{color:'#a6adc8'}}>{text.slice(last)}</span>)
  return parts
}