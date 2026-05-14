import { useState, useEffect, useRef } from 'react'
import {
  MdBiotech, MdEmail, MdLock, MdPerson, MdPhone,
  MdVisibility, MdVisibilityOff, MdArrowForward, MdShield,
  MdDarkMode, MdLightMode, MdCheck, MdBusiness, MdWork,
  MdPublic, MdSecurity, MdAdminPanelSettings, MdLocalHospital,
} from 'react-icons/md'
import { API_BASE } from '../config'
import './login-cinematic.css'
import './Login.css'

/* ── Animated particle canvas background ── */
function ParticleBg({ theme }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')
    let raf, w, h
    const resize = () => { w = c.width = c.offsetWidth; h = c.height = c.offsetHeight }
    resize()
    window.addEventListener('resize', resize)
    const dark = theme === 'dark'
    const N = 55
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * (w || 800), y: Math.random() * (h || 600),
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 2 + 1,
    }))
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = dark ? 'rgba(99,102,241,0.55)' : 'rgba(37,99,235,0.25)'
        ctx.fill()
      })
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < 110) {
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y)
          ctx.strokeStyle = dark
            ? `rgba(139,92,246,${0.14 * (1 - d / 110)})`
            : `rgba(37,99,235,${0.09 * (1 - d / 110)})`
          ctx.lineWidth = 0.8; ctx.stroke()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [theme])
  return <canvas ref={ref} className="lg-particle-canvas" />
}

/* ── Password strength ── */
function pwStr(pw) {
  if (!pw) return { s: 0, l: '', c: '' }
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return [null,
    { l: 'Weak',   c: '#ef4444' },
    { l: 'Fair',   c: '#f59e0b' },
    { l: 'Good',   c: '#3b82f6' },
    { l: 'Strong', c: '#10b981' },
  ][s] || { l: 'Weak', c: '#ef4444' }
}

const ROLES = [
  { id: 'safety_officer',  label: 'Safety Officer',              icon: <MdShield/>,              desc: 'Monitor signals & ensure patient safety' },
  { id: 'pv_manager',      label: 'Pharmacovigilance Manager',   icon: <MdAdminPanelSettings/>,  desc: 'Oversee PV operations' },
  { id: 'medical_reviewer',label: 'Medical Reviewer',            icon: <MdLocalHospital/>,       desc: 'Review adverse event reports' },
  { id: 'administrator',   label: 'Administrator',               icon: <MdSecurity/>,            desc: 'Manage users & configurations' },
]

export default function Login({ onLogin }) {
  const [mode,     setMode]     = useState('login')
  const [theme,    setTheme]    = useState(() => localStorage.getItem('ayuscout_theme') || 'light')
  const [name,     setName]     = useState('')
  const [phone,    setPhone]    = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [showCpw,  setShowCpw]  = useState(false)
  const [role,     setRole]     = useState('')
  const [roleOpen, setRoleOpen] = useState(false)
  const [org,      setOrg]      = useState('')
  const [dept,     setDept]     = useState('')
  const [country,  setCountry]  = useState('')
  const [terms,    setTerms]    = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')
  const [shake,    setShake]    = useState(false)
  const [tabAnim,  setTabAnim]  = useState(false)
  const [ready,    setReady]    = useState(false)

  useEffect(() => { setTimeout(() => setReady(true), 60) }, [])
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ayuscout_theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  const switchMode = m => {
    if (m === mode) return
    setTabAnim(true); setError(''); setSuccess('')
    setTimeout(() => {
      setMode(m); setName(''); setPhone(''); setEmail(''); setPassword('')
      setConfirm(''); setRole(''); setTerms(false); setTabAnim(false)
    }, 260)
  }

  const shake_ = msg => { setError(msg); setShake(true); setTimeout(() => setShake(false), 500) }
  const pw = pwStr(password)
  const selRole = ROLES.find(r => r.id === role)

  const submit = async e => {
    e.preventDefault(); setError(''); setSuccess('')
    if (mode === 'register') {
      if (!name.trim()) return shake_('Full name required')
      if (!email.includes('@')) return shake_('Enter valid email')
      if (password.length < 6) return shake_('Min 6 characters')
      if (password !== confirm) return shake_('Passwords do not match')
    } else {
      if (!email.trim()) return shake_('Email required')
      if (!password.trim()) return shake_('Password required')
    }
    setLoading(true)
    try {
      if (mode === 'register') {
        if (!terms) return shake_('Please accept the Terms of Service to continue')
        const r = await fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            password,
            role: role || 'safety_officer',
            department: dept || 'Pharmacovigilance',
            organization: org || '',
          }),
        })
        const d = await r.json()
        // FastAPI returns errors as { detail: "..." }
        const errMsg = d.detail || d.error || d.message
        if (!r.ok || errMsg) return shake_(errMsg || 'Registration failed')
        setSuccess('Account created! Logging you in…')
        setTimeout(() => onLogin(d.user), 800)
      } else {
        const r = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const d = await r.json()
        const errMsg = d.detail || d.error || d.message
        if (!r.ok || errMsg) return shake_(errMsg || 'Invalid credentials')
        onLogin(d.user)
      }
    } catch { shake_('Cannot connect to server') }
    finally { setLoading(false) }
  }

  return (
    <div className={`lg-root${ready ? ' lg-ready' : ''}`} data-theme={theme}>
      {/* Animated particle background */}
      <ParticleBg theme={theme} />

      {/* Soft radial orbs */}
      <div className="lg-orb lg-orb-1" />
      <div className="lg-orb lg-orb-2" />
      <div className="lg-orb lg-orb-3" />

      {/* Centered card */}
      <div className={`lc-card lg-card${shake ? ' lc-shake' : ''}`}>

        {/* ── Tabs + theme toggle ── */}
        <div className="lc-tabs-bar">
          <button
            id="tab-signin"
            className={`lc-tab${mode === 'login' ? ' lc-tab-on' : ''}`}
            onClick={() => switchMode('login')}
          >
            <MdPerson size={15} /> Sign In
          </button>
          <button
            id="tab-register"
            className={`lc-tab${mode === 'register' ? ' lc-tab-on' : ''}`}
            onClick={() => switchMode('register')}
          >
            <MdBiotech size={15} /> Create Account
          </button>
          <button
            id="theme-toggle"
            className="lc-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <MdLightMode size={18} /> : <MdDarkMode size={18} />}
          </button>
        </div>

        {/* ── Form area ── */}
        <div className={tabAnim ? 'lc-fade-out' : 'lc-fade-in'}>
          <h2 className="lc-ftitle">
            {mode === 'login' ? 'Welcome back 👋' : 'Join AyuScout V2'}
          </h2>
          <p className="lc-fsub">
            {mode === 'login'
              ? 'Sign in to access your pharmacovigilance dashboard'
              : 'Create your account to start monitoring adverse events'}
          </p>

          {error   && <div className="lc-err">⚠️ {error}</div>}
          {success && <div className="lc-ok">✅ {success}</div>}

          <form onSubmit={submit} className="lc-form" noValidate>

            {mode === 'register' && (
              <div className="lc-r2">
                <div className="lc-f">
                  <label className="lc-lbl">Full Name</label>
                  <div className="lc-iw">
                    <MdPerson className="lc-ic" />
                    <input id="input-name" className="lc-in" type="text" placeholder="Dr. Jane Smith"
                      value={name} onChange={e => setName(e.target.value)} autoFocus />
                  </div>
                </div>
                <div className="lc-f">
                  <label className="lc-lbl">Phone <span className="lc-opt">(optional)</span></label>
                  <div className="lc-iw">
                    <MdPhone className="lc-ic" />
                    <input id="input-phone" className="lc-in" type="tel" placeholder="+91 98765 43210"
                      value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            <div className="lc-f">
              <label className="lc-lbl">Email Address</label>
              <div className="lc-iw">
                <MdEmail className="lc-ic" />
                <input id="input-email" className="lc-in" type="email" placeholder="you@hospital.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                  autoFocus={mode === 'login'} />
              </div>
            </div>

            <div className={mode === 'register' ? 'lc-r2' : ''}>
              <div className="lc-f">
                <label className="lc-lbl">Password</label>
                <div className="lc-iw">
                  <MdLock className="lc-ic" />
                  <input id="input-password" className="lc-in lc-pr"
                    type={showPw ? 'text' : 'password'}
                    placeholder={mode === 'register' ? 'Min. 8 characters' : '••••••••'}
                    value={password} onChange={e => setPassword(e.target.value)} />
                  <button type="button" className="lc-eye" onClick={() => setShowPw(p => !p)}>
                    {showPw ? <MdVisibilityOff size={16} /> : <MdVisibility size={16} />}
                  </button>
                </div>
                {mode === 'register' && password && (
                  <div className="lc-pws">
                    <div className="lc-pwb">
                      <div className="lc-pwf" style={{ width: `${pw.s * 25}%`, background: pw.c }} />
                    </div>
                    <span style={{ color: pw.c, fontSize: 10, fontWeight: 700 }}>{pw.l}</span>
                  </div>
                )}
              </div>

              {mode === 'register' && (
                <div className="lc-f">
                  <label className="lc-lbl">Confirm Password</label>
                  <div className="lc-iw">
                    <MdLock className="lc-ic" />
                    <input id="input-confirm" className="lc-in lc-pr"
                      type={showCpw ? 'text' : 'password'} placeholder="Re-enter password"
                      value={confirm} onChange={e => setConfirm(e.target.value)} />
                    <button type="button" className="lc-eye" onClick={() => setShowCpw(p => !p)}>
                      {showCpw ? <MdVisibilityOff size={16} /> : <MdVisibility size={16} />}
                    </button>
                    {confirm && (
                      <span className="lc-mico">{confirm === password ? '✅' : '❌'}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {mode === 'login' && (
              <div className="lc-remrow">
                <label className="lc-chk">
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                  Remember me
                </label>
                <button type="button" className="lc-fgot">Forgot password?</button>
              </div>
            )}

            {mode === 'register' && (
              <>
                <div className="lc-r2">
                  <div className="lc-f">
                    <label className="lc-lbl">Role</label>
                    <div className="lc-sel" onClick={() => setRoleOpen(o => !o)}>
                      <MdWork className="lc-ic lc-ic-sel" />
                      <span className={selRole ? '' : 'lc-ph'}>
                        {selRole ? selRole.label : 'Select your role'}
                      </span>
                      <span className={`lc-chev${roleOpen ? ' lc-chev-up' : ''}`}>▾</span>
                    </div>
                    {roleOpen && (
                      <div className="lc-rdrop">
                        {ROLES.map(r => (
                          <div key={r.id}
                            className={`lc-ri${role === r.id ? ' lc-ri-sel' : ''}`}
                            onClick={() => { setRole(r.id); setRoleOpen(false) }}>
                            <span className="lc-ric">{r.icon}</span>
                            <div>
                              <div className="lc-rn">{r.label}</div>
                              <div className="lc-rd">{r.desc}</div>
                            </div>
                            {role === r.id && <MdCheck className="lc-rchk" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="lc-f">
                    <label className="lc-lbl">Organization</label>
                    <div className="lc-iw">
                      <MdBusiness className="lc-ic" />
                      <input id="input-org" className="lc-in" placeholder="Your organization"
                        value={org} onChange={e => setOrg(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="lc-r2">
                  <div className="lc-f">
                    <label className="lc-lbl">Department <span className="lc-opt">(optional)</span></label>
                    <div className="lc-iw">
                      <MdWork className="lc-ic" />
                      <input id="input-dept" className="lc-in" placeholder="Department"
                        value={dept} onChange={e => setDept(e.target.value)} />
                    </div>
                  </div>
                  <div className="lc-f">
                    <label className="lc-lbl">Country</label>
                    <div className="lc-iw">
                      <MdPublic className="lc-ic" />
                      <input id="input-country" className="lc-in" placeholder="Country"
                        value={country} onChange={e => setCountry(e.target.value)} />
                    </div>
                  </div>
                </div>
                <label className="lc-terms">
                  <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} />
                  I agree to the <span className="lc-lnk">Terms of Service</span> and{' '}
                  <span className="lc-lnk">Privacy Policy</span>
                </label>
              </>
            )}

            <button id="btn-submit" type="submit" className="lc-sub" disabled={loading}>
              {loading
                ? <><span className="lc-spin" />Processing…</>
                : <>{mode === 'login' ? 'Sign In' : 'Create Account'} <MdArrowForward size={17} /></>}
              <span className="lc-shine" />
            </button>
          </form>

          <p className="lc-sw">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button className="lc-swb" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>

          <div className="lc-notice">
            <MdShield size={17} className="lc-ni" />
            <div>
              <div className="lc-nt">Safety Officer access is required.</div>
              <div className="lc-ns">You will select your role during account creation.</div>
            </div>
          </div>

          {mode === 'login' && (
            <div className="lc-admin">
              🛡️ Admin login: <code>admin@ayuscout.ai</code> / <code>Admin@123</code>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
