import { useState } from 'react'
import {
  MdShield, MdVisibility, MdVisibilityOff, MdDownload,
  MdPsychology, MdWarning, MdCheckCircle, MdLock,
  MdSentimentVeryDissatisfied, MdSentimentNeutral,
  MdCode, MdStar, MdAutoFixHigh, MdBiotech
} from 'react-icons/md'

// ── Mock E2B(R3) XML ────────────────────────────────────────────
const MOCK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ichicsr lang="en" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ichicsrmessageheader>
    <messagetype>ichicsr</messagetype>
    <messageformatversion>2.1</messageformatversion>
    <messageformatrelease>2</messageformatrelease>
    <messagenumb>MSG-20250507-SRX-042</messagenumb>
    <messagesenderidentifier>SIGNALRX-AI-V2</messagesenderidentifier>
    <messagereceiveridentifier>CDSCO-PV-INDIA</messagereceiveridentifier>
    <messagedateformat>102</messagedateformat>
    <messagedate>20250507</messagedate>
  </ichicsrmessageheader>
  <safetyreport>
    <safetyreportid>SIG-042</safetyreportid>
    <safetyreportversion>1</safetyreportversion>
    <primarysourcecountry>IN</primarysourcecountry>
    <occurcountry>IN</occurcountry>
    <reporttype>1</reporttype>
    <serious>1</serious>
    <seriousnesshospitalization>1</seriousnesshospitalization>
    <receivedate>20250507</receivedate>
    <receiptdate>20250507</receiptdate>
    <patient>
      <patientonsetage>45</patientonsetage>
      <patientonsetageunit>801</patientonsetageunit>
      <patientsex>2</patientsex>
      <reaction>
        <primarysourcereaction>Angioedema of face and throat</primarysourcereaction>
        <reactionmeddraversionllt>27.0</reactionmeddraversionllt>
        <reactionmeddrallt>Angioedema</reactionmeddrallt>
        <reactionmeddraversionpt>27.0</reactionmeddraversionpt>
        <reactionmeddraptid>10002425</reactionmeddraptid>
        <reactionoutcome>3</reactionoutcome>
      </reaction>
      <drug>
        <drugcharacterization>1</drugcharacterization>
        <medicinalproduct>LISINOPRIL</medicinalproduct>
        <drugdosagetext>10mg once daily oral</drugdosagetext>
        <drugadministrationroute>048</drugadministrationroute>
        <drugindicationmeddraversion>27.0</drugindicationmeddraversion>
        <drugindication>Hypertension</drugindication>
        <actiondrug>1</actiondrug>
        <drugrecurreadministration>3</drugrecurreadministration>
      </drug>
    </patient>
    <summary>
      <narrativeincludeclinical>Patient taking Lisinopril 10mg for hypertension
      reported facial swelling and throat tightness 10 minutes after dose.
      WHO-UMC Causality: Certain. Signal detected via SignalRx AI platform.</narrativeincludeclinical>
    </summary>
  </safetyreport>
</ichicsr>`

// ── Section 1: PII Vault ────────────────────────────────────────
function PIIVault() {
  const [masked, setMasked] = useState(false)
  const [animating, setAnimating] = useState(false)

  const toggle = () => {
    setAnimating(true)
    setTimeout(() => { setMasked(m => !m); setAnimating(false) }, 300)
  }

  const RAW = {
    name: 'John Doe',
    age: '45',
    phone: '555-0198',
    email: 'johndoe@gmail.com',
    location: 'Mumbai, Maharashtra',
    aadhaar: '9876-5432-1098',
    text: '"I\'ve been on Lisinopril for 3 months. Yesterday my face swelled up badly — John Doe, 45M, called 555-0198."',
  }
  const MASKED = {
    name: '[MASKED_PATIENT_01]',
    age: '[AGE_REDACTED]',
    phone: '[PHONE_REDACTED]',
    email: '[EMAIL_REDACTED]',
    location: '[LOCATION_REDACTED]',
    aadhaar: '[ID_REDACTED]',
    text: '"I\'ve been on Lisinopril for 3 months. Yesterday my face swelled up badly — [MASKED_PATIENT_01], [AGE_REDACTED], called [PHONE_REDACTED]."',
  }
  const D = masked ? MASKED : RAW

  const fields = [
    { label: 'Patient Name', key: 'name' },
    { label: 'Age', key: 'age' },
    { label: 'Phone', key: 'phone' },
    { label: 'Email', key: 'email' },
    { label: 'Location', key: 'location' },
    { label: 'Aadhaar ID', key: 'aadhaar' },
  ]

  return (
    <div className="card" style={{ marginBottom: 24, border: '1.5px solid rgba(16,185,129,.2)' }}>
      <div className="card-header" style={{ background: 'rgba(16,185,129,.04)' }}>
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MdShield size={20} style={{ color: '#10B981' }} />
          PII Vault — HIPAA / DPDP Compliance Engine
        </span>
        <span className="badge badge-success" style={{ fontSize: 10 }}>ZERO-TRUST</span>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
          All patient-identifiable information is <strong>automatically detected and masked</strong> before
          entering the AI pipeline. Toggle to see the transformation in real time.
        </p>

        {/* Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <button
            onClick={toggle}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
              borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', fontWeight: 700,
              fontSize: 13, transition: 'all .2s',
              background: masked ? 'linear-gradient(135deg,#10B981,#059669)' : 'linear-gradient(135deg,#EF4444,#DC2626)',
              color: '#fff', boxShadow: masked ? '0 4px 16px rgba(16,185,129,.4)' : '0 4px 16px rgba(239,68,68,.4)',
            }}>
            {masked ? <MdLock size={18} /> : <MdVisibility size={18} />}
            {masked ? 'Showing: Masked (HIPAA Safe)' : 'Showing: Raw PII (Vulnerable)'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {masked ? '✅ Data is safe to process through AI pipeline' : '⚠️ PII detected — masking required before AI processing'}
          </span>
        </div>

        {/* Data Table */}
        <div style={{
          borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)',
          opacity: animating ? 0 : 1, transition: 'opacity .3s',
        }}>
          <table style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Field</th>
                <th>Value</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(f => (
                <tr key={f.key}>
                  <td style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{f.label}</td>
                  <td style={{
                    fontFamily: "'JetBrains Mono',Consolas,monospace", fontSize: 13, fontWeight: 600,
                    color: masked ? '#10B981' : '#EF4444', transition: 'color .3s',
                  }}>{D[f.key]}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                      background: masked ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
                      color: masked ? '#10B981' : '#EF4444',
                    }}>{masked ? '✓ MASKED' : '⚠ EXPOSED'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Raw text block */}
        <div style={{ marginTop: 14, padding: '12px 16px', background: '#181825', borderRadius: 'var(--radius)', borderLeft: `3px solid ${masked ? '#10B981' : '#EF4444'}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: masked ? '#10B981' : '#EF4444', marginBottom: 6, letterSpacing: '.05em' }}>
            ORIGINAL PATIENT TEXT
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',Consolas,monospace", fontSize: 12.5, color: '#cdd6f4', lineHeight: 1.7, transition: 'all .3s' }}>
            {D.text}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Section 2: Severity Decoupling ──────────────────────────────
function SeverityDecoupling() {
  const [selected, setSelected] = useState(null)

  const CARDS = [
    {
      id: 'a',
      label: 'Case A — False Alarm',
      platform: 'Reddit · r/diabetes',
      text: '"This is OUTRAGEOUS!! My Metformin pills are HUGE and impossible to swallow! I am SO angry at the manufacturer — this is completely unacceptable and I am FURIOUS!!!"',
      sentiment: { label: 'VERY HIGH NEGATIVE', color: '#EF4444', icon: <MdSentimentVeryDissatisfied size={20} /> },
      safety: { label: 'LOW SAFETY RISK', color: '#10B981', icon: <MdCheckCircle size={20} /> },
      safetyScore: 1.2,
      sentimentScore: 9.4,
      reasoning: 'Patient is emotionally distressed about pill size (cosmetic/UX complaint). No adverse drug reaction, no clinical harm reported. Flagged as informational only.',
      verdict: 'NO ACTION REQUIRED',
      verdictColor: '#10B981',
    },
    {
      id: 'b',
      label: 'Case B — Critical Signal',
      platform: 'Twitter · @patient_reports',
      text: '"Been on lisinopril for a week. Noticed my arm feels numb. Probably nothing, it\'s fine I guess. Not really worried about it."',
      sentiment: { label: 'NEUTRAL', color: '#F59E0B', icon: <MdSentimentNeutral size={20} /> },
      safety: { label: 'CRITICAL SAFETY RISK', color: '#EF4444', icon: <MdWarning size={20} /> },
      safetyScore: 9.8,
      sentimentScore: 2.1,
      reasoning: 'Temporal relationship: Drug started 7 days ago. "Arm numbness" matches MedDRA term "Paraesthesia" (10033987) — known ACE inhibitor adverse event. WHO-UMC Causality: Probable. Requires immediate follow-up.',
      verdict: 'URGENT REVIEW',
      verdictColor: '#EF4444',
    },
  ]

  return (
    <div className="card" style={{ marginBottom: 24, border: '1.5px solid rgba(139,92,246,.2)' }}>
      <div className="card-header" style={{ background: 'rgba(139,92,246,.04)' }}>
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MdPsychology size={20} style={{ color: '#8B5CF6' }} />
          Severity ≠ Sentiment — AI Decoupling Engine
        </span>
        <span className="badge badge-info" style={{ background: 'rgba(139,92,246,.12)', color: '#8B5CF6', fontSize: 10 }}>
          15% UNIQUENESS DIFFERENTIATOR
        </span>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>
          Traditional tools conflate emotional sentiment with clinical risk. Our AI <strong>decouples them separately</strong> — an angry post about pill size is low risk; a calm post about arm numbness is critical.
        </p>
        <div className="grid-2" style={{ gap: 16 }}>
          {CARDS.map(card => (
            <div key={card.id}
              onClick={() => setSelected(selected === card.id ? null : card.id)}
              style={{
                padding: 20, borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all .25s',
                border: selected === card.id ? `2px solid ${card.safety.color}` : '1.5px solid var(--border)',
                background: selected === card.id ? `${card.safety.color}08` : 'var(--surface)',
                boxShadow: selected === card.id ? `0 4px 20px ${card.safety.color}25` : 'none',
              }}>
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{card.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{card.platform}</div>
                </div>
                <span style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800,
                  background: `${card.verdictColor}15`, color: card.verdictColor,
                  border: `1px solid ${card.verdictColor}30`,
                }}>{card.verdict}</span>
              </div>

              {/* Quote */}
              <div style={{ padding: '10px 14px', background: '#181825', borderRadius: 8, marginBottom: 14,
                fontFamily: "'JetBrains Mono',Consolas,monospace", fontSize: 11.5, color: '#cdd6f4', lineHeight: 1.6, fontStyle: 'italic' }}>
                {card.text}
              </div>

              {/* Score bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                {/* Sentiment */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: card.sentiment.color }}>
                      {card.sentiment.icon} Emotional Sentiment
                    </span>
                    <span style={{ color: card.sentiment.color }}>{card.sentimentScore}/10</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${card.sentimentScore * 10}%`, background: card.sentiment.color, transition: 'width .6s ease' }} />
                  </div>
                  <div style={{ fontSize: 10, color: card.sentiment.color, fontWeight: 700, marginTop: 3 }}>{card.sentiment.label}</div>
                </div>
                {/* Safety */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: card.safety.color }}>
                      {card.safety.icon} Clinical Safety Risk
                    </span>
                    <span style={{ color: card.safety.color }}>{card.safetyScore}/10</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${card.safetyScore * 10}%`, background: card.safety.color, transition: 'width .6s ease' }} />
                  </div>
                  <div style={{ fontSize: 10, color: card.safety.color, fontWeight: 700, marginTop: 3 }}>{card.safety.label}</div>
                </div>
              </div>

              {/* Expanded reasoning */}
              {selected === card.id && (
                <div style={{ padding: '12px 14px', background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.15)',
                  borderRadius: 8, fontSize: 12, lineHeight: 1.6, color: 'var(--text)', animation: 'slideUp .2s ease' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#8B5CF6', marginBottom: 6, letterSpacing: '.05em' }}>
                    🧠 AI REASONING
                  </div>
                  {card.reasoning}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
                {selected === card.id ? '▲ Click to collapse' : '▼ Click to see AI reasoning'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Section 3: E2B(R3) Export ───────────────────────────────────
function E2BExport() {
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [copied, setCopied] = useState(false)

  const generate = () => {
    setLoading(true)
    setGenerated(false)
    setTimeout(() => { setLoading(false); setGenerated(true) }, 1200)
  }

  const copyXml = () => {
    navigator.clipboard?.writeText(MOCK_XML)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadXml = () => {
    const blob = new Blob([MOCK_XML], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'E2B_R3_ICSR_SIG042.xml'
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card" style={{ border: '1.5px solid rgba(59,130,246,.2)' }}>
      <div className="card-header" style={{ background: 'rgba(59,130,246,.04)' }}>
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MdBiotech size={20} style={{ color: '#3B82F6' }} />
          E2B(R3) Regulatory Export — ICH Compliant
        </span>
        <span className="badge badge-info" style={{ fontSize: 10 }}>CDSCO / FDA READY</span>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>
          One-click generation of <strong>ICH E2B(R3) Individual Case Safety Reports (ICSR)</strong> —
          the global standard for pharmacovigilance submissions to regulatory authorities including
          CDSCO (India), FDA (USA), EMA (Europe).
        </p>

        {/* Generate Button */}
        <button
          onClick={generate}
          disabled={loading}
          style={{
            width: '100%', padding: '16px 0', borderRadius: 'var(--radius)', border: 'none',
            fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: loading ? '#334155' : 'linear-gradient(135deg,#3B82F6,#1D4ED8)',
            color: loading ? 'var(--muted)' : '#fff',
            boxShadow: loading ? 'none' : '0 6px 24px rgba(59,130,246,.45)',
            transition: 'all .2s', marginBottom: 16,
          }}>
          {loading
            ? <><span className="login-spinner" style={{ width: 18, height: 18 }} /> Generating E2B(R3) XML…</>
            : <><MdCode size={22} /> Generate FDA E2B(R3) XML Report</>}
        </button>

        {/* XML Output */}
        {generated && (
          <div style={{ animation: 'slideUp .35s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#1e1e2e', borderRadius: '8px 8px 0 0', padding: '10px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f38ba8', display: 'block' }} />
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f9e2af', display: 'block' }} />
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#a6e3a1', display: 'block' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#6c7086', marginLeft: 8, fontFamily: 'monospace' }}>
                  E2B_R3_ICSR_SIG042.xml — ICH E2B(R3) Format
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={copyXml} style={{ display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 4, background: 'rgba(166,173,200,.1)',
                  border: '1px solid rgba(166,173,200,.15)', color: '#cdd6f4', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  {copied ? '✓ Copied' : '⎘ Copy'}
                </button>
                <button onClick={downloadXml} style={{ display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 4, background: 'rgba(59,130,246,.2)',
                  border: '1px solid rgba(59,130,246,.3)', color: '#89b4fa', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  <MdDownload size={12} /> Download
                </button>
              </div>
            </div>
            <pre style={{ margin: 0, padding: '16px 20px', background: '#181825', borderRadius: '0 0 8px 8px',
              overflow: 'auto', maxHeight: 340, fontSize: 12, lineHeight: 1.7,
              fontFamily: "'JetBrains Mono','Fira Code',Consolas,monospace", color: '#89b4fa' }}>
              <code>{MOCK_XML}</code>
            </pre>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              {['✅ ICH E2B(R3) Compliant', '✅ MedDRA Coded', '✅ CDSCO Ready', '✅ WHO-UMC Causality'].map(tag => (
                <span key={tag} style={{ padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                  background: 'rgba(16,185,129,.1)', color: '#10B981', border: '1px solid rgba(16,185,129,.2)' }}>{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────
export default function CommandCenter() {
  return (
    <>
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28,
        padding: '20px 24px', background: 'linear-gradient(135deg,rgba(139,92,246,.1),rgba(59,130,246,.06))',
        borderRadius: 'var(--radius)', border: '1px solid rgba(139,92,246,.2)' }}>
        <div style={{ width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg,#8B5CF6,#3B82F6)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MdStar size={30} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 4 }}>
            Competitive Differentiators
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
            Three enterprise-grade capabilities that set SignalRx AI apart from every other pharmacovigilance platform.
            Built for AI Bharat 2.0 — demonstrating real-world, production-grade innovation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: '15% Uniqueness', color: '#8B5CF6' },
            { label: '30% Execution', color: '#3B82F6' },
            { label: '15% Presentation', color: '#10B981' },
          ].map(b => (
            <span key={b.label} style={{ padding: '6px 14px', borderRadius: 16, fontSize: 11, fontWeight: 800,
              background: `${b.color}18`, color: b.color, border: `1px solid ${b.color}30` }}>
              {b.label}
            </span>
          ))}
        </div>
      </div>

      <PIIVault />
      <SeverityDecoupling />
      <E2BExport />
    </>
  )
}
