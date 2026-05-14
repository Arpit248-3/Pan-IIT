import { useEffect, useRef, useState, useCallback } from 'react'
import './HeroCinematic.css'

const TOTAL_FRAMES  = 240
const DURATION_MS   = 8000   // 8 seconds total cinematic runtime

const src = (n) => `/frames/ezgif-frame-${String(n).padStart(3,'0')}.jpg`

export default function HeroCinematic({ onEnter }) {
  const canvasRef    = useRef(null)
  const framesRef    = useRef(new Array(TOTAL_FRAMES).fill(null))
  const curIdxRef    = useRef(0)
  const tgtIdxRef    = useRef(0)
  const rafRef       = useRef(null)
  const startTimeRef = useRef(null)   // wall-clock when playback began
  const loadedRef    = useRef(0)
  const doneRef      = useRef(false)  // guard against double-fire

  const [loadPct,     setLoadPct]     = useState(0)
  const [canvasReady, setCanvasReady] = useState(false)
  const [progress,    setProgress]    = useState(0)   // 0 → 1 over 8 s
  const [showCards,   setShowCards]   = useState(false)
  const [showCta,     setShowCta]     = useState(false)
  const [scene,       setScene]       = useState(0)

  /* ── Lock body scroll (no scrollbar needed now) ─────────────── */
  useEffect(() => {
    const prev = document.body.style.cssText
    document.body.style.overflow = 'hidden'
    document.body.style.height   = '100vh'
    const root = document.getElementById('root')
    if (root) { root.style.overflow = 'hidden'; root.style.height = '100vh' }
    return () => {
      document.body.style.cssText = prev
      if (root) { root.style.overflow = ''; root.style.height = '' }
    }
  }, [])

  /* ── Canvas cover-fill draw ─────────────────────────────────── */
  const drawFrame = useCallback((idx) => {
    const canvas = canvasRef.current
    const img    = framesRef.current[idx]
    if (!canvas || !img || !img.complete || !img.naturalWidth) return
    const ctx = canvas.getContext('2d', { alpha: false })
    const { width: cw, height: ch } = canvas
    if (!cw || !ch) return
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight)
    const sw = img.naturalWidth  * scale
    const sh = img.naturalHeight * scale
    ctx.drawImage(img, (cw - sw) / 2, (ch - sh) / 2, sw, sh)
  }, [])

  /* ── Size canvas ─────────────────────────────────────────────── */
  const sizeCanvas = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    c.width  = c.offsetWidth  || window.innerWidth
    c.height = c.offsetHeight || window.innerHeight
  }, [])

  useEffect(() => {
    sizeCanvas()
    window.addEventListener('resize', sizeCanvas)
    return () => window.removeEventListener('resize', sizeCanvas)
  }, [sizeCanvas])

  /* ── Preload all frames ──────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false

    // Production fallback: if frame 1 errors (no /frames/ on CDN),
    // skip the cinematic and go straight to login after 2 s
    const fallbackTimer = setTimeout(() => {
      if (!cancelled && !canvasReady) {
        console.info('[HeroCinematic] Frames unavailable — skipping cinematic.')
        if (!doneRef.current) { doneRef.current = true; onEnter() }
      }
    }, 2000)

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const img = new Image()
      img.src = src(i + 1)
      const idx = i
      img.onload = () => {
        if (cancelled) return
        clearTimeout(fallbackTimer)          // frames exist — cancel skip
        framesRef.current[idx] = img
        loadedRef.current++
        const pct = Math.round((loadedRef.current / TOTAL_FRAMES) * 100)
        setLoadPct(pct)
        if (idx === 0) {          // first frame → show canvas immediately
          sizeCanvas()
          drawFrame(0)
          setCanvasReady(true)
        }
      }
      img.onerror = () => {
        if (cancelled) return
        loadedRef.current++
        setLoadPct(Math.round((loadedRef.current / TOTAL_FRAMES) * 100))
        // If ALL frames errored and canvas never became ready, the fallbackTimer
        // above will fire and redirect — no action needed here
      }
    }
    return () => { cancelled = true; clearTimeout(fallbackTimer) }
  }, [sizeCanvas, drawFrame, canvasReady, onEnter])

  /* ── Main RAF loop: time-based playback ──────────────────────── */
  useEffect(() => {
    if (!canvasReady) return

    const tick = (timestamp) => {
      // Start the clock on first tick
      if (!startTimeRef.current) startTimeRef.current = timestamp

      const elapsed = timestamp - startTimeRef.current
      const prog    = Math.min(1, elapsed / DURATION_MS)

      // Update target frame
      const idx = Math.round(prog * (TOTAL_FRAMES - 1))
      tgtIdxRef.current = Math.max(0, Math.min(TOTAL_FRAMES - 1, idx))

      // Lerp current frame toward target
      const cur  = curIdxRef.current
      const tgt  = tgtIdxRef.current
      if (cur !== tgt) {
        const next = Math.round(cur + (tgt - cur) * 0.4)
        curIdxRef.current = Math.max(0, Math.min(TOTAL_FRAMES - 1, next))
        drawFrame(curIdxRef.current)
      }

      // React state for overlays (throttled via floor to avoid re-renders each frame)
      setProgress(prog)

      const s = prog < 0.08 ? 0 : prog < 0.20 ? 1 : prog < 0.32 ? 2
              : prog < 0.46 ? 3 : prog < 0.60 ? 4 : prog < 0.74 ? 5
              : prog < 0.88 ? 6 : 7
      setScene(s)
      setShowCards(prog >= 0.55)
      setShowCta(prog >= 0.88)

      if (prog < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        // Cinematic done — transition to login
        if (!doneRef.current) {
          doneRef.current = true
          // Small grace delay so CTA / final frame are visible for a beat
          setTimeout(() => onEnter(), 600)
        }
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [canvasReady, drawFrame, onEnter])

  const LABELS     = [
    'Background Reveal','DNA Formation','Security Activation','Capsule Motion',
    'UI Reveal','Live Interactions','Parallax Depth','Final Loop'
  ]
  const THRESHOLDS = [0,0.08,0.20,0.32,0.46,0.60,0.74,0.88]

  const p = progress

  return (
    <div
      className="hc-scroll-root"
      style={{ height: '100vh', overflow: 'hidden', position: 'fixed', inset: 0, zIndex: 3000 }}
    >
      <div className="hc-sticky">

        {/* ── LOADING OVERLAY ── */}
        {!canvasReady && (
          <div className="hc-loader">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="23" stroke="url(#lg)" strokeWidth="3"
                strokeDasharray="72 72" strokeLinecap="round">
                <animateTransform attributeName="transform" type="rotate"
                  from="0 26 26" to="360 26 26" dur="1.1s" repeatCount="indefinite"/>
              </circle>
              <circle cx="26" cy="26" r="11" stroke="#22d3ee" strokeWidth="1.5" opacity="0.45"/>
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="52" y2="52" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#6366f1"/><stop offset="100%" stopColor="#22d3ee"/>
                </linearGradient>
              </defs>
            </svg>
            <div className="hc-ld-name">AyuScout V2</div>
            <div className="hc-ld-sub">Pharmacovigilance Intelligence</div>
            <div className="hc-ld-track"><div className="hc-ld-fill" style={{width:`${loadPct}%`}}/></div>
            <div className="hc-ld-pct">{loadPct}%</div>
            <p className="hc-ld-hint">Loading {TOTAL_FRAMES} cinematic frames…</p>
          </div>
        )}

        {/* ── CANVAS ── */}
        <canvas
          ref={canvasRef}
          className={`hc-canvas${canvasReady?' hc-canvas-show':''}`}
        />

        {/* Vignette */}
        <div className="hc-vig"/>
        <div className="hc-vig-b"/>

        {/* Top progress bar (shows playback progress) */}
        <div className="hc-topbar"><div className="hc-topfill" style={{width:`${p*100}%`}}/></div>

        {/* ── PARTICLES (scene 0–1) ── */}
        <div className="hc-ptcls" style={{
          opacity: p < 0.02 ? 0 : p < 0.06 ? (p-0.02)/0.04 : p < 0.18 ? 1 : Math.max(0,1-(p-0.18)/0.06)
        }}>
          {[...Array(22)].map((_,i)=>(
            <span key={i} className="hc-pt" style={{
              left:`${(i*4.3+2)%93}%`, top:`${(i*6.7+4)%87}%`,
              animationDelay:`${(i*0.26)%3.8}s`, animationDuration:`${3.2+(i%4)*0.6}s`
            }}/>
          ))}
        </div>

        {/* ── DNA BLOOM (scene 1–2) ── */}
        <div className="hc-dna-bloom" style={{
          opacity: p<0.06?0 : p<0.14?(p-0.06)/0.06 : p<0.28?1 : Math.max(0,1-(p-0.28)/0.08),
          transform:`scale(${0.9+(p*0.2)})`
        }}/>

        {/* ── SHIELD RINGS (scene 2–3) ── */}
        {p>=0.18 && p<0.48 && (
          <div className="hc-rings" style={{
            opacity: p<0.26?(p-0.18)/0.08 : p<0.40?1 : Math.max(0,1-(p-0.40)/0.08)
          }}>
            <div className="hr r1"/><div className="hr r2"/><div className="hr r3"/>
          </div>
        )}

        {/* ── HEADLINE (scene 4+) ── */}
        <div className="hc-headline" style={{
          opacity: p>=0.42 ? Math.min(1,(p-0.42)/0.07) : 0,
          transform:`translateY(${p>=0.42?0:32}px)`
        }}>
          <div className="hc-pill-badge">
            <span className="hc-bdot"/> Pharmacovigilance Intelligence Platform
          </div>
          <h1 className="hc-h1">
            <span className="hl-w">Intelligent</span>
            <span className="hl-g">Pharmacovigilance.</span>
            <span className="hl-m">Safer Tomorrow.</span>
          </h1>
          <p className="hc-desc">
            AyuScout V2 uses AI to detect, analyze, and prevent adverse drug reactions
            — real-time intelligence at global scale.
          </p>
        </div>

        {/* ── LIVE CARDS (scene 5+) ── */}
        {showCards && (
          <div className="hc-cards" style={{opacity:Math.min(1,(p-0.55)/0.08)}}>

            <div className="hc-card c-c">
              <div className="hc-ch"><span className="hc-cd cd-c"/>Signals Detected</div>
              <div className="hc-cv">24,589</div>
              <svg className="hc-spk" viewBox="0 0 120 38">
                <polyline points="0,33 20,24 40,28 60,11 80,20 100,9 120,15"
                  stroke="#22d3ee" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <animate attributeName="stroke-dashoffset" from="220" to="0" dur="1.4s" fill="freeze"/>
                </polyline>
                <circle r="3.5" fill="#22d3ee">
                  <animateMotion path="M0,33 L20,24 L40,28 L60,11 L80,20 L100,9 L120,15" dur="1.4s" fill="freeze"/>
                </circle>
              </svg>
              <span className="hc-cb cb-c">↑ +18.6% · 7-day avg</span>
            </div>

            <div className="hc-card c-v">
              <div className="hc-ch"><span className="hc-cd cd-v"/>Adverse Events</div>
              <div className="hc-cv cv-v">1,247</div>
              <svg className="hc-spk" viewBox="0 0 120 38">
                <polyline points="0,30 18,21 38,28 58,7 78,24 98,13 120,19"
                  stroke="#8b5cf6" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <animate attributeName="stroke-dashoffset" from="220" to="0" dur="1.8s" fill="freeze"/>
                </polyline>
              </svg>
              <span className="hc-cb cb-v">AI-Detected · Live</span>
            </div>

            <div className="hc-card c-g">
              <div className="hc-ch"><span className="hc-cd cd-g"/>Global Coverage</div>
              <div style={{display:'flex',justifyContent:'center',margin:'6px 0'}}>
                <svg width="74" height="74" viewBox="0 0 74 74">
                  <circle cx="37" cy="37" r="29" stroke="#1e293b" strokeWidth="8" fill="none"/>
                  <circle cx="37" cy="37" r="29" stroke="#10b981" strokeWidth="8" fill="none"
                    strokeLinecap="round" strokeDasharray="182"
                    strokeDashoffset="46" transform="rotate(-90 37 37)">
                    <animate attributeName="stroke-dashoffset" from="182" to="46" dur="1.8s" fill="freeze"/>
                  </circle>
                  <text x="37" y="43" textAnchor="middle" fontSize="14"
                    fill="#10b981" fontWeight="800" fontFamily="Inter,sans-serif">75%</text>
                </svg>
              </div>
              <span className="hc-cb cb-g">142 countries</span>
            </div>
          </div>
        )}

        {/* ── FEATURE PILLS (scene 6) ── */}
        {p>=0.68 && (
          <div className="hc-pills" style={{opacity:Math.min(1,(p-0.68)/0.08)}}>
            {['🧠 AI Intelligence','🛡️ Real-time Guard','📊 Analytics','🔒 Compliant','🌐 Global Scale']
              .map((f,i)=><span key={i} className="hc-fpill" style={{animationDelay:`${i*0.09}s`}}>{f}</span>)}
          </div>
        )}

        {/* ── CTA (scene 7) — still shown but no need to click; auto-redirects ── */}
        {showCta && (
          <div className="hc-cta" style={{opacity:Math.min(1,(p-0.88)/0.06)}}>
            <button className="hc-btn" onClick={() => { doneRef.current = true; onEnter() }}>
              Enter Platform <span className="arr">→</span>
              <span className="shn"/>
            </button>
            <p className="hc-hint">Entering platform…</p>
          </div>
        )}

        {/* Scene dots */}
        <div className="hc-sdots">
          {THRESHOLDS.map((_,i)=>(
            <div key={i} className={`hc-sd${scene===i?' sa':scene>i?' sd':''}`} title={LABELS[i]}/>
          ))}
        </div>

        {/* Scene label */}
        <div className="hc-sname">{LABELS[scene]}</div>

        {/* Playback progress bar */}
        <div className="hc-pbar"><div className="hc-pfill" style={{width:`${p*100}%`}}/></div>

        {/* Frame counter */}
        <div className="hc-fc">
          Frame {Math.round(p*(TOTAL_FRAMES-1))+1}/{TOTAL_FRAMES} · {Math.round(p*100)}%
        </div>

        {/* Brand */}
        <div className="hc-brand">
          <svg width="17" height="17" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" stroke="#6366f1" strokeWidth="2.5" fill="none"/>
            <circle cx="18" cy="18" r="7" fill="#6366f1" opacity="0.4"/>
          </svg>
          <span>AyuScout V2</span>
          <span className="hc-sep">·</span>
          <span className="hc-bsub">Pharmacovigilance Intelligence</span>
        </div>
      </div>
    </div>
  )
}
