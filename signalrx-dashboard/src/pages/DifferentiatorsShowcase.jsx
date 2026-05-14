import { useState } from 'react'
import {
  MdShield, MdVisibilityOff, MdVisibility, MdVerifiedUser,
  MdFileDownload, MdWarning, MdCheckCircle, MdPsychology,
  MdSentimentVeryDissatisfied, MdSentimentNeutral,
  MdLocalHospital, MdCompareArrows, MdStar, MdEmojiEvents,
  MdCode, MdDescription, MdContentCopy, MdDone
} from 'react-icons/md'

/* ═══════════════════════════════════════════════════════════
   FEATURE 1 — PII VAULT
   ═══════════════════════════════════════════════════════════ */
function PIIVault() {
  const [masked, setMasked] = useState(false)

  const raw = [
    { text: 'My name is ', safe: true },
    { text: 'John Doe', safe: false, label: 'NAME' },
    { text: ' (Ph: ', safe: true },
    { text: '555-0198', safe: false, label: 'PHONE' },
    { text: '). I live in ', safe: true },
    { text: 'Bangalore', safe: false, label: 'LOCATION' },
    { text: ' and took Aspirin. Now I have a severe rash.', safe: true },
  ]

  const maskedMap = {
    'John Doe': '[MASKED_PATIENT_01]',
    '555-0198': '[MASKED_PHONE]',
    'Bangalore': '[MASKED_LOCATION]',
  }

  return (
    <div className="card" style={{ border: '1.5px solid rgba(139,92,246,.2)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,rgba(139,92,246,.08),rgba(59,130,246,.06))',
        borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(139,92,246,.15)', color: '#8B5CF6',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MdShield size={22} /></div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>PII Vault & Differential Privacy</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>HIPAA / DPDP Act Compliance Engine</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: masked ? 'var(--success)' : 'var(--danger)' }}>
            {masked ? '🔒 Analyst Mode' : '⚠️ Raw Data'}
          </span>
          <label className="toggle">
            <input type="checkbox" checked={masked} onChange={e => setMasked(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>
      <div className="card-body">
        {/* Data display */}
        <div style={{ padding: '16px 20px', background: masked ? '#0f1923' : '#1a0a0a', borderRadius: 8,
          fontFamily: "'JetBrains Mono',Consolas,monospace", fontSize: 13.5, lineHeight: 1.8, transition: 'background .3s',
          border: `1px solid ${masked ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)'}` }}>
          {raw.map((seg, i) => {
            if (seg.safe) return <span key={i} style={{ color: '#cdd6f4' }}>{seg.text}</span>
            if (masked) {
              return (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.3)',
                  borderRadius: 4, padding: '1px 8px', color: '#10B981', fontWeight: 700, transition: 'all .3s' }}>
                  <MdVisibilityOff size={12} /> {maskedMap[seg.text]}
                </span>
              )
            }
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)',
                borderRadius: 4, padding: '1px 8px', color: '#EF4444', fontWeight: 700,
                textDecoration: 'underline', textDecorationStyle: 'wavy', transition: 'all .3s' }}>
                <MdWarning size={12} /> {seg.text}
                <span style={{ fontSize: 9, opacity: 0.7, textDecoration: 'none' }}>({seg.label})</span>
              </span>
            )
          })}
        </div>
        {/* Compliance badges */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {masked && (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px',
                borderRadius: 20, background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)',
                color: '#10B981', fontSize: 11, fontWeight: 700, animation: 'slideUp .3s ease' }}>
                <MdVerifiedUser size={14} /> HIPAA Compliant
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px',
                borderRadius: 20, background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.25)',
                color: '#3B82F6', fontSize: 11, fontWeight: 700, animation: 'slideUp .3s ease' }}>
                <MdShield size={14} /> DPDP Act 2023
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px',
                borderRadius: 20, background: 'rgba(139,92,246,.1)', border: '1px solid rgba(139,92,246,.25)',
                color: '#8B5CF6', fontSize: 11, fontWeight: 700, animation: 'slideUp .3s ease' }}>
                <MdVisibilityOff size={14} /> k-Anonymity Applied
              </span>
            </>
          )}
          {!masked && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px',
              borderRadius: 20, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
              color: '#EF4444', fontSize: 11, fontWeight: 700 }}>
              <MdWarning size={14} /> 3 PII Elements Detected — NOT SAFE for export
            </span>
          )}
        </div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════
   FEATURE 2 — SEVERITY DECOUPLING
   ═══════════════════════════════════════════════════════════ */
function SeverityDecoupling() {
  const cases = [
    {
      id: 'nuisance',
      label: 'The Nuisance',
      icon: MdSentimentVeryDissatisfied,
      text: '"I am SO MAD! This pill is absolutely massive and impossible to swallow! 😡"',
      sentiment: { label: 'HIGH NEGATIVE', score: 92, color: '#EF4444' },
      clinical: { label: 'LOW', desc: 'No clinical safety signal', color: '#10B981', bg: 'rgba(16,185,129,.1)', pulse: false },
      reasoning: 'Patient frustration about pill size — no adverse drug reaction detected. Emotional distress ≠ clinical risk.',
    },
    {
      id: 'threat',
      label: 'The Silent Threat',
      icon: MdSentimentNeutral,
      text: '"I took the medication yesterday. Today my left arm is completely numb and I can\'t lift it."',
      sentiment: { label: 'NEUTRAL', score: 35, color: '#94A3B8' },
      clinical: { label: 'CRITICAL', desc: 'Possible peripheral neuropathy', color: '#EF4444', bg: 'rgba(239,68,68,.1)', pulse: true },
      reasoning: 'Calm tone masks a serious ADR — arm numbness indicates potential neurological event. URGENT signal.',
    },
  ]

  return (
    <div className="card" style={{ border: '1.5px solid rgba(245,158,11,.2)', overflow: 'hidden' }}>
      <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,rgba(245,158,11,.08),rgba(239,68,68,.04))',
        borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,.15)', color: '#F59E0B',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MdPsychology size={22} /></div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Clinical Severity vs. Emotional Sentiment</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Why pure NLP sentiment analysis fails in pharmacovigilance</div>
        </div>
      </div>
      <div className="card-body">
        <div className="grid-2" style={{ gap: 16 }}>
          {cases.map(c => {
            const Icon = c.icon
            return (
              <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                overflow: 'hidden', transition: 'all .2s' }}>
                {/* Case label */}
                <div style={{ padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={18} style={{ color: c.sentiment.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{c.label}</span>
                </div>
                {/* Quote */}
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)',
                  fontSize: 13, lineHeight: 1.6, color: 'var(--text)', fontStyle: 'italic' }}>
                  {c.text}
                </div>
                {/* Analysis */}
                <div style={{ padding: 16 }}>
                  {/* Sentiment bar */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
                        letterSpacing: '.05em' }}>Emotional Sentiment</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: c.sentiment.color }}>{c.sentiment.label}</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${c.sentiment.score}%`, background: c.sentiment.color,
                        borderRadius: 4, transition: 'width 1s ease' }} />
                    </div>
                  </div>
                  {/* Clinical badge */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
                      letterSpacing: '.05em', marginBottom: 6 }}>Clinical Safety Risk</div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px',
                      borderRadius: 20, background: c.clinical.bg, border: `1.5px solid ${c.clinical.color}44`,
                      color: c.clinical.color, fontSize: 13, fontWeight: 800,
                      animation: c.clinical.pulse ? 'pulse 1.5s infinite' : 'none' }}>
                      <MdLocalHospital size={16} /> {c.clinical.label}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{c.clinical.desc}</span>
                  </div>
                  {/* Reasoning */}
                  <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,.06)',
                    border: '1px solid rgba(245,158,11,.12)', borderRadius: 6,
                    fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                    <strong style={{ color: '#F59E0B' }}>AI Reasoning:</strong> {c.reasoning}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {/* Key insight banner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: '12px 18px',
          background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 'var(--radius)' }}>
          <MdCompareArrows size={20} style={{ color: '#F59E0B', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            <strong style={{ color: '#F59E0B' }}>Key Insight:</strong> Our AI decouples emotional tone from clinical severity.
            A calm post can be CRITICAL, while an angry post can be harmless. This is what sets AyuScout apart from basic sentiment tools.
          </span>
        </div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════
   COPY BUTTON — clipboard helper for on-screen XML
   ═══════════════════════════════════════════════════════════ */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy XML to clipboard'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
        fontSize: 11, fontWeight: 700, transition: 'all .2s',
        background: copied ? 'rgba(16,185,129,.15)' : 'rgba(139,92,246,.15)',
        color: copied ? '#10B981' : '#a6adc8' }}>
      {copied ? <MdDone size={13} /> : <MdContentCopy size={13} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}


/* ═══════════════════════════════════════════════════════════
   FEATURE 3 — E2B (R3) EXPORT
   ═══════════════════════════════════════════════════════════ */
function E2BExport() {
  const [exporting, setExporting] = useState(false)
  const [showXML, setShowXML]     = useState(false)

  const handleExport = () => {
    setExporting(true)
    setTimeout(() => { setExporting(false); setShowXML(true) }, 1800)
  }

  const xmlSnippet = `<?xml version="1.0" encoding="UTF-8"?>
<!-- AyuScout V2 — ICH E2B(R3) ICSR | Generated: ${new Date().toISOString().slice(0,19)}Z -->
<ichicsr lang="en" xmlns="urn:hl7-org:v3">
  <ichicsrmessageheader>
    <messagetype>ichicsr</messagetype>
    <messageformatversion>2.1</messageformatversion>
    <messagenumb>AYU-2025-00036</messagenumb>
    <messagesenderidentifier>AyuScout-V2-Dashboard</messagesenderidentifier>
    <messagereceiveridentifier>CDSCO-INDIA</messagereceiveridentifier>
  </ichicsrmessageheader>
  <safetyreport>
    <safetyreportid>AYU-2025-00036</safetyreportid>
    <primarysourcecountry>IN</primarysourcecountry>
    <reporttype>1</reporttype>
    <serious>1</serious>
    <seriousnesshospitalization>1</seriousnesshospitalization>
    <patient>
      <patientinitial>[REDACTED-PII-VAULT]</patientinitial>
      <patientagegroup>5</patientagegroup>
      <drug>
        <drugcharacterization>1</drugcharacterization>
        <medicinalproduct>Lisinopril</medicinalproduct>
        <drugindication>Hypertension</drugindication>
        <drugreactionassessment>
          <drugassessmentmethod>WHO-UMC Causality System</drugassessmentmethod>
          <drugassessmentresult>Certain</drugassessmentresult>
          <drugassessmentsource>AyuScout V2 AI (Confidence: 92%)</drugassessmentsource>
        </drugreactionassessment>
      </drug>
      <reaction>
        <primarysourcereaction>Angioedema</primarysourcereaction>
        <reactionmeddraversionllt>27.0</reactionmeddraversionllt>
        <reactionmeddrallt>Angioedema</reactionmeddrallt>
        <reactionoutcome>6</reactionoutcome>
      </reaction>
      <summary>
        <narrativeincludeclinical>
          Patient reported facial swelling 3 months after initiating Lisinopril
          therapy for hypertension. WHO-UMC causality: Certain. AyuScout V2
          AI reasoning: strong temporal relationship, known mechanism.
          PII masked by k-Anonymity vault per DPDP Act 2023.
        </narrativeincludeclinical>
      </summary>
    </patient>
  </safetyreport>
</ichicsr>`

  return (
    <div className="card" style={{ border: '1.5px solid rgba(59,130,246,.2)', overflow: 'hidden' }}>
      <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,rgba(59,130,246,.08),rgba(16,185,129,.04))',
        borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(59,130,246,.15)', color: '#3B82F6',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MdDescription size={22} /></div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>One-Click Regulatory Compliance</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>E2B(R3) XML — FDA MedWatch &amp; CDSCO Standard</div>
        </div>
      </div>
      <div className="card-body">
        {/* Buttons comparison */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 20, alignItems: 'stretch' }}>
          {/* Legacy CSV — disabled */}
          <div style={{ flex: 1, padding: '16px 20px', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', opacity: 0.5, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 9, fontWeight: 700,
              padding: '2px 8px', borderRadius: 8, background: 'rgba(148,163,184,.15)', color: 'var(--muted)' }}>LEGACY</div>
            <MdFileDownload size={24} style={{ color: 'var(--muted)', marginBottom: 8 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Export to CSV</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Flat table — no structure, no compliance, no MedDRA</div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, opacity: 0.5, cursor: 'not-allowed' }} disabled>
              Not Regulatory Grade
            </button>
          </div>
          {/* E2B — primary */}
          <div style={{ flex: 1.5, padding: '16px 20px', background: 'rgba(59,130,246,.04)',
            border: '1.5px solid rgba(59,130,246,.25)', borderRadius: 'var(--radius)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 9, fontWeight: 700,
              padding: '2px 8px', borderRadius: 8, background: 'rgba(16,185,129,.15)', color: '#10B981' }}>FDA STANDARD</div>
            <MdCode size={24} style={{ color: '#3B82F6', marginBottom: 8 }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Generate E2B(R3) XML Report
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>
              ICH-compliant ICSR with MedDRA coding, WHO-UMC causality &amp; PII masking
            </div>
            {showXML ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MdCheckCircle size={18} style={{ color: 'var(--success)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>
                  E2B_ICSR_AYU-2025-00036.xml — Preview below ↓
                </span>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={handleExport} disabled={exporting}
                style={{ gap: 8, padding: '10px 22px', borderRadius: 'var(--radius)',
                  background: exporting ? 'var(--text2)' : 'linear-gradient(135deg,#3B82F6,#1d4ed8)' }}>
                {exporting
                  ? <><span className="login-spinner" style={{ width: 14, height: 14 }} /> Generating XML…</>
                  : <><MdCode size={16} /> Generate E2B(R3) XML</>}
              </button>
            )}
          </div>
        </div>

        {/* ── On-screen XML viewer (no file download needed for demo) ── */}
        {showXML && (
          <div style={{ animation: 'slideUp .35s ease' }}>
            {/* Title bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#1e1e2e', borderRadius: '8px 8px 0 0', padding: '9px 16px',
              borderBottom: '1px solid #313244' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f38ba8', display: 'block' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f9e2af', display: 'block' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#a6e3a1', display: 'block' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#585b70',
                  marginLeft: 6, fontFamily: 'monospace' }}>E2B_ICSR_AYU-2025-00036.xml</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, color: '#a6e3a1', fontWeight: 700,
                  background: 'rgba(166,227,161,.1)', padding: '2px 8px', borderRadius: 4 }}>
                  ✓ ICH E2B(R3) VALIDATED
                </span>
                <CopyButton text={xmlSnippet} />
              </div>
            </div>
            {/* Code block */}
            <pre style={{ margin: 0, padding: '16px 20px', background: '#181825',
              borderRadius: '0 0 8px 8px', overflow: 'auto', maxHeight: 340, fontSize: 12,
              lineHeight: 1.65, fontFamily: "'JetBrains Mono','Fira Code',Consolas,monospace",
              color: '#cdd6f4', border: '1px solid #313244', borderTop: 'none' }}>
              <code>{xmlHighlight(xmlSnippet)}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Simple XML syntax highlighter ─────────────────────────── */
function xmlHighlight(xml) {
  const parts = []
  const rx = /(<\/?)([\w:]+)((?:\s+[\w:]+="[^"]*")*)\s*(\/?>)/g
  let last = 0, m
  while ((m = rx.exec(xml)) !== null) {
    if (m.index > last) parts.push(<span key={`t${last}`} style={{ color: '#cdd6f4' }}>{xml.slice(last, m.index)}</span>)
    parts.push(
      <span key={`tag${m.index}`}>
        <span style={{ color: '#a6adc8' }}>{m[1]}</span>
        <span style={{ color: '#89b4fa' }}>{m[2]}</span>
        <span style={{ color: '#a6e3a1' }}>{m[3]}</span>
        <span style={{ color: '#a6adc8' }}>{m[4]}</span>
      </span>
    )
    last = m.index + m[0].length
  }
  if (last < xml.length) parts.push(<span key="end" style={{ color: '#fab387' }}>{xml.slice(last)}</span>)
  return parts
}


/* ═══════════════════════════════════════════════════════════
   MAIN — DIFFERENTIATORS SHOWCASE
   ═══════════════════════════════════════════════════════════ */
export default function DifferentiatorsShowcase() {
  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg,rgba(245,158,11,.15),rgba(239,68,68,.1))',
          border: '1px solid rgba(245,158,11,.2)', color: '#F59E0B',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MdEmojiEvents size={30} />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em', marginBottom: 2 }}>
            Competitive Differentiators
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Three features that set AyuScout apart from every other pharmacovigilance tool
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {['PII Masking', 'Severity AI', 'E2B Export'].map((f, i) => (
            <span key={i} style={{ padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: ['rgba(139,92,246,.1)', 'rgba(245,158,11,.1)', 'rgba(59,130,246,.1)'][i],
              color: ['#8B5CF6', '#F59E0B', '#3B82F6'][i],
              border: `1px solid ${['rgba(139,92,246,.2)', 'rgba(245,158,11,.2)', 'rgba(59,130,246,.2)'][i]}` }}>
              <MdStar size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />{f}
            </span>
          ))}
        </div>
      </div>

      {/* Feature 1 — PII Vault */}
      <div style={{ marginBottom: 24 }}><PIIVault /></div>

      {/* Feature 2 — Severity Decoupling */}
      <div style={{ marginBottom: 24 }}><SeverityDecoupling /></div>

      {/* Feature 3 — E2B Export */}
      <E2BExport />
    </div>
  )
}
