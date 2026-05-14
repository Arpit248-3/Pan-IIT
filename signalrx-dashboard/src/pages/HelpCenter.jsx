import { useState, useEffect } from 'react'
import {
  MdHelpOutline, MdSend, MdExpandMore, MdExpandLess,
  MdPlayCircleOutline, MdBiotech, MdNotificationsActive,
  MdAssessment, MdWebhook, MdArrowForward, MdCheckCircle,
  MdSchedule, MdQuestionAnswer, MdSearch, MdClose
} from 'react-icons/md'

import { API_BASE } from '../config';


// ─── Guide data ─────────────────────────────────────────────
const guides = [
  {
    id: 'analyze',
    icon: MdBiotech,
    color: '#007BFF',
    bg: 'rgba(0,123,255,.12)',
    title: 'Run AI Analysis',
    desc: 'Analyse a patient report through the full LangGraph pipeline',
    page: 'dashboard',
    steps: [
      { icon: '📋', title: 'Open the Dashboard', desc: 'Navigate to Overview from the sidebar.' },
      { icon: '✏️', title: 'Paste report text', desc: 'Find the "Analyze Case" card and paste or type your case report.' },
      { icon: '🚀', title: 'Click Analyze', desc: 'Hit the blue Analyze button. Ollama runs the full LangGraph pipeline.' },
      { icon: '📊', title: 'Review results', desc: 'Causality, severity, WHO-UMC score and PubMed link appear instantly.' },
    ]
  },
  {
    id: 'scout',
    icon: MdSearch,
    color: '#10B981',
    bg: 'rgba(16,185,129,.12)',
    title: 'Fetch Signals',
    desc: 'Deploy the Scout Agent to crawl social media for new signals',
    page: 'dashboard',
    steps: [
      { icon: '🔍', title: 'Enter a drug keyword', desc: 'Type a drug name (e.g. "Metformin") in the Scout Agent card.' },
      { icon: '🤖', title: 'Deploy Scout', desc: 'Click "Deploy Scout". The crawler runs in the background.' },
      { icon: '⏳', title: 'Wait for signals', desc: 'New intake records appear in the Data Explorer when crawling finishes.' },
      { icon: '🧪', title: 'Process Vault', desc: 'Click "Process Vault" to run AI analysis on all new records.' },
    ]
  },
  {
    id: 'e2b',
    icon: MdAssessment,
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,.12)',
    title: 'E2B Export',
    desc: 'Download ICH E2B (R3 or R2) XML for regulatory submission',
    page: 'reports',
    steps: [
      { icon: '📄', title: 'Go to Reports', desc: 'Open the Reports page from the MANAGEMENT section.' },
      { icon: '🔎', title: 'Find your record', desc: 'Browse or filter the report list by drug or event.' },
      { icon: '⬇️', title: 'Click Export', desc: 'Hit "E2B R3" or "E2B R2" button. XML downloads immediately.' },
      { icon: '✅', title: 'Submit to authority', desc: 'Upload the downloaded XML to your regulatory submission portal.' },
    ]
  },
  {
    id: 'webhook',
    icon: MdWebhook,
    color: '#F59E0B',
    bg: 'rgba(245,158,11,.12)',
    title: 'Webhook Alerts',
    desc: 'Configure real-time alerts for Critical and High severity signals',
    page: 'settings',
    steps: [
      { icon: '⚙️', title: 'Open Settings', desc: 'Navigate to Settings from the ADMINISTRATION section.' },
      { icon: '🔗', title: 'Enter webhook URL', desc: 'Paste your Slack / Teams / custom webhook URL in the Alerting section.' },
      { icon: '💾', title: 'Save settings', desc: 'Hit Save. AyuScout will POST JSON payloads to that URL on new signals.' },
      { icon: '🔔', title: 'Test alert', desc: 'Run AI analysis on a Critical case — your channel gets notified instantly.' },
    ]
  }
]

// ─── FAQ data ────────────────────────────────────────────────
const faqs = [
  { q: 'Which LLM does AyuScout use?', a: 'AyuScout V2 uses Ollama with the llama3.2:1b model locally. No data leaves your machine — 100% on-premise.' },
  { q: 'What is the WHO-UMC causality score?', a: 'The WHO-UMC algorithm classifies adverse drug reactions into: Certain, Probable, Possible, Unlikely, and Unassessable — based on temporal relationship, dechallenge/rechallenge data, and prior knowledge.' },
  { q: 'What is an E2B XML export?', a: 'ICH E2B is the international standard format for Individual Case Safety Reports (ICSRs). AyuScout generates both R3 (current) and R2 (legacy) formats for submission to regulatory authorities like CDSCO, FDA, or EMA.' },
  { q: 'How does the Scout Agent work?', a: 'The Scout Agent simulates crawling Reddit-style posts for a given drug keyword, extracts candidate adverse event signals, and stores them in the Intake Vault for AI processing.' },
  { q: 'Can I use real patient data?', a: 'AyuScout applies PII masking before storing any text. However, for production use, ensure your deployment complies with HIPAA/GDPR requirements and consult your data governance team.' },
  { q: 'How do I configure Gmail email alerts?', a: 'Add GMAIL_USER and GMAIL_APP_PASSWORD to your .env file. Generate an App Password from Google Account → Security → App Passwords (requires 2FA enabled).' },
  { q: 'What databases does AyuScout support?', a: 'SQLite by default (signalrx.db). Change DATABASE_URL in .env to connect to PostgreSQL or MySQL without any code changes — the SQLAlchemy ORM handles it.' },
]

// ─── Sub-components ──────────────────────────────────────────

function GuideCard({ guide, onOpen }) {
  const Icon = guide.icon
  return (
    <div className="help-guide-card" onClick={() => onOpen(guide)}>
      <div className="help-guide-icon" style={{ background: guide.bg, color: guide.color }}>
        <Icon size={26} />
      </div>
      <div className="help-guide-info">
        <div className="help-guide-title">{guide.title}</div>
        <div className="help-guide-desc">{guide.desc}</div>
      </div>
      <MdArrowForward size={18} className="help-guide-arrow" />
    </div>
  )
}

function GuideDrawer({ guide, onClose, onNavigate }) {
  if (!guide) return null
  const Icon = guide.icon
  return (
    <div className="help-drawer-overlay" onClick={onClose}>
      <div className="help-drawer" onClick={e => e.stopPropagation()}>
        <div className="help-drawer-header">
          <div className="help-drawer-icon" style={{ background: guide.bg, color: guide.color }}>
            <Icon size={22} />
          </div>
          <div>
            <div className="help-drawer-title">{guide.title}</div>
            <div className="help-drawer-sub">{guide.desc}</div>
          </div>
          <button className="help-drawer-close" onClick={onClose}><MdClose size={20} /></button>
        </div>
        <div className="help-drawer-steps">
          {guide.steps.map((step, i) => (
            <div className="help-step" key={i}>
              <div className="help-step-num">{i + 1}</div>
              <div className="help-step-body">
                <div className="help-step-emoji">{step.icon}</div>
                <div>
                  <div className="help-step-title">{step.title}</div>
                  <div className="help-step-desc">{step.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="help-drawer-footer">
          <button className="btn btn-primary" onClick={() => { onNavigate(guide.page); onClose() }}>
            Go to {guide.title} page <MdArrowForward size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function FAQItem({ item }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`help-faq-item ${open ? 'open' : ''}`}>
      <button className="help-faq-q" onClick={() => setOpen(o => !o)}>
        <span>{item.q}</span>
        {open ? <MdExpandLess size={20} /> : <MdExpandMore size={20} />}
      </button>
      {open && <div className="help-faq-a">{item.a}</div>}
    </div>
  )
}

function QueryCard({ q }) {
  return (
    <div className="help-query-card">
      <div className="help-query-header">
        <MdQuestionAnswer size={16} style={{ color: '#007BFF', flexShrink: 0 }} />
        <span className="help-query-question">{q.question}</span>
        <span className={`badge ${q.status === 'answered' ? 'badge-success' : 'badge-warning'}`}>
          {q.status === 'answered' ? '✓ Answered' : '⏳ Open'}
        </span>
      </div>
      {q.answer && (
        <div className="help-query-answer">
          <strong>Admin reply:</strong> {q.answer}
        </div>
      )}
      <div className="help-query-meta">
        Submitted {new Date(q.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        {q.answered_at && ` · Answered ${new Date(q.answered_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function HelpCenter({ onNavigate }) {
  const [tab, setTab]             = useState('guides')
  const [activeGuide, setActiveGuide] = useState(null)
  const [question, setQuestion]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')
  const [queries, setQueries]     = useState([])
  const [loadingQ, setLoadingQ]   = useState(false)

  const user = (() => { try { return JSON.parse(localStorage.getItem('ayuscout_user') || 'null') } catch { return null } })()

  // Load user queries when tab is "my-queries"
  useEffect(() => {
    if (tab === 'my-queries' && user) {
      setLoadingQ(true)
      const params = new URLSearchParams({ user_id: user.id, role: user.role })
      fetch(`${API_BASE}/api/help/queries?${params}`)
        .then(r => r.json())
        .then(d => setQueries(d.queries || []))
        .catch(() => setQueries([]))
        .finally(() => setLoadingQ(false))
    }
  }, [tab])

  const submitQuery = async () => {
    if (!question.trim()) return
    if (!user) { setSubmitMsg('⚠️ Please log in to submit a query.'); return }
    setSubmitting(true)
    setSubmitMsg('')
    try {
      const res = await fetch(`${API_BASE}/api/help/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_email: user.email,
          user_name: user.name,
          question: question.trim()
        })
      })
      if (res.ok) {
        setSubmitMsg('✅ Query submitted! Our team will respond shortly.')
        setQuestion('')
      } else {
        setSubmitMsg('❌ Failed to submit. Please try again.')
      }
    } catch {
      setSubmitMsg('❌ Cannot connect to backend.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="help-center">
      {/* Page hero */}
      <div className="help-hero">
        <div className="help-hero-icon"><MdHelpOutline size={32} /></div>
        <div>
          <h1 className="help-hero-title">Help Center</h1>
          <p className="help-hero-sub">Step-by-step guides, FAQ, and direct support</p>
        </div>
      </div>

      {/* Ask a question */}
      <div className="card help-ask-card">
        <div className="card-header">
          <span className="card-title">Ask a Question</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Our team typically replies within a few hours</span>
        </div>
        <div className="card-body">
          <textarea
            className="help-ask-textarea"
            placeholder="Describe your question or issue in detail..."
            value={question}
            onChange={e => setQuestion(e.target.value)}
            rows={3}
          />
          {submitMsg && <div className="help-submit-msg">{submitMsg}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-primary" onClick={submitQuery} disabled={submitting || !question.trim()}>
              {submitting ? <span className="login-spinner" /> : <><MdSend size={16} /> Submit Query</>}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginTop: 24 }}>
        {[
          { id: 'guides',     label: '📚 Guides' },
          { id: 'faq',        label: '❓ FAQ' },
          { id: 'my-queries', label: '🗒 My Queries' },
        ].map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Guides tab */}
      {tab === 'guides' && (
        <div className="help-guides-grid">
          {guides.map(g => <GuideCard key={g.id} guide={g} onOpen={setActiveGuide} />)}
        </div>
      )}

      {/* FAQ tab */}
      {tab === 'faq' && (
        <div className="help-faq-list">
          {faqs.map((f, i) => <FAQItem key={i} item={f} />)}
        </div>
      )}

      {/* My Queries tab */}
      {tab === 'my-queries' && (
        <div className="help-queries-list">
          {!user && (
            <div className="help-empty">🔒 Please sign in to view your submitted queries.</div>
          )}
          {user && loadingQ && (
            <div className="help-empty"><span className="spin" style={{ display: 'inline-block', width: 20, height: 20, border: '2px solid #007BFF', borderTopColor: 'transparent', borderRadius: '50%' }} /></div>
          )}
          {user && !loadingQ && queries.length === 0 && (
            <div className="help-empty">
              <MdHelpOutline size={40} style={{ color: 'var(--muted)', marginBottom: 12 }} />
              <div>You haven't submitted any queries yet.</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Use the form above to ask a question.</div>
            </div>
          )}
          {user && !loadingQ && queries.map(q => <QueryCard key={q.id} q={q} />)}
        </div>
      )}

      {/* Guide drawer */}
      <GuideDrawer guide={activeGuide} onClose={() => setActiveGuide(null)} onNavigate={onNavigate} />
    </div>
  )
}
