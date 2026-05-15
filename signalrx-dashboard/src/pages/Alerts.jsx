import { useState, useEffect, useCallback } from 'react'
import {
  MdArrowUpward, MdDownload, MdRefresh, MdClose,
  MdTimeline, MdVisibility, MdSmartToy, MdBiotech,
  MdFormatQuote, MdLabel, MdPsychology, MdOpenInNew,
  MdFilterList, MdTrendingUp, MdScience
} from 'react-icons/md'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart
} from 'recharts'

import { API_BASE } from '../config';
import { useDataRefresh } from '../utils/dataEvents'
import useAyuStore from '../store/useAyuStore'
import FDAEvidenceModal from '../components/FDAEvidenceModal'
import FDAModalPortal from '../components/FDAModalPortal'
import { getFDAStatus, getFDALabel, getFDABadgeStyle, FDA_STATUS } from '../utils/fdaStatus'

const sevColors = { Critical: 'danger', High: 'warning', Medium: 'info', Low: 'neutral' }

// ── Frontend PII safety net (email/phone/Aadhaar/PAN only) ──────
// Per security req §3: does NOT aggressively mask names.
// Backend PIIVault is the source of truth for name/address masking.
const _ALERTS_FE_RX = [
  [/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]'],
  [/\b[6-9]\d{9}\b/g, '[PHONE]'],
  [/(?<!\d)(?:\+?1[\s\-.])?\(?\d{3}\)?[\s\-.]\d{3}[\s\-.]\d{4}(?!\d)/g, '[PHONE]'],
  [/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, '[AADHAAR]'],
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[PAN]'],
]
function alertSanitize(text = '') {
  if (!text || typeof text !== 'string') return text
  let out = text
  for (const [rx, rep] of _ALERTS_FE_RX) out = out.replace(rx, rep)
  return out
}

/* ── Confidence badge logic ────────────────────────────────── */
function confidenceStyle(val) {
  const n = typeof val === 'number' ? val : parseInt(val)
  if (!isNaN(n)) {
    if (n >= 80) return { bg: 'rgba(16,185,129,.12)', border: 'rgba(16,185,129,.25)', color: '#10B981', label: `${n}% — High` }
    if (n >= 50) return { bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.25)', color: '#F59E0B', label: `${n}% — Medium` }
    return { bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.25)', color: '#EF4444', label: `${n}% — Low` }
  }
  const s = String(val).toLowerCase()
  if (s.includes('certain') || s.includes('high')) return { bg: 'rgba(16,185,129,.12)', border: 'rgba(16,185,129,.25)', color: '#10B981', label: val }
  if (s.includes('probable')) return { bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.25)', color: '#F59E0B', label: val }
  return { bg: 'rgba(59,130,246,.12)', border: 'rgba(59,130,246,.25)', color: '#3B82F6', label: val || 'N/A' }
}

function ConfidencePill({ value }) {
  const s = confidenceStyle(value)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: 12, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      background: s.bg, border: `1px solid ${s.border}`, color: s.color
    }}>
      {s.label}
    </span>
  )
}

/* ── Custom chart tooltip ──────────────────────────────────── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      padding: '10px 14px', background: 'var(--navy)', color: '#fff',
      borderRadius: 8, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,.3)', border: 'none'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#60a5fa' }}>Signals: <strong>{payload[0].value}</strong></div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TRACEABILITY DRAWER
   ══════════════════════════════════════════════════════════════ */
function TraceabilityDrawer({ signal, onClose }) {
  if (!signal) return null

  let factors = []
  try { factors = JSON.parse(signal.who_umc_factors || '[]') } catch { factors = [] }

  const entities = [
    { label: 'Suspect Drug', value: signal.drug, color: '#EF4444', bg: 'rgba(239,68,68,.1)' },
    { label: 'Adverse Event', value: signal.event, color: '#F59E0B', bg: 'rgba(245,158,11,.1)' },
    { label: 'MedDRA Term', value: signal.meddra_term || signal.event, color: '#8B5CF6', bg: 'rgba(139,92,246,.1)' },
    { label: 'Severity', value: signal.severity, color: sevColors[signal.severity] === 'danger' ? '#EF4444' : '#3B82F6', bg: 'rgba(59,130,246,.1)' },
  ]

  // --- DDI & Concomitant Extraction Logic ---
  let concomitant = [];
  let ddiRisk = 'None';
  let altCause = false;
  let interactionReasoning = '';

  try {
    const docVerdict = typeof signal.doctor_verdict === 'string' ? JSON.parse(signal.doctor_verdict) : (signal.doctor_verdict || {});
    const extractedData = typeof signal.extracted_data === 'string' ? JSON.parse(signal.extracted_data) : (signal.extracted_data || signal.clinical_data || {});

    concomitant = extractedData.concomitant_drugs || [];
    ddiRisk = docVerdict.ddi_risk_level || signal.ddi_risk_level || 'None';
    altCause = docVerdict.alternative_cause_likely || signal.alternative_cause_likely || false;
    interactionReasoning = docVerdict.interaction_reasoning || signal.interaction_reasoning || '';
  } catch (e) { }

  // Ensure UI gracefully hides DDI section if empty
  const hasConcomitant = Array.isArray(concomitant)
    ? concomitant.length > 0 && concomitant[0] !== 'None' && concomitant[0] !== ''
    : typeof concomitant === 'string' && concomitant.trim() !== '' && concomitant !== 'None';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,25,47,.45)', backdropFilter: 'blur(4px)' }}
        onClick={onClose} />
      {/* Drawer */}
      <div style={{
        position: 'relative', width: 520, background: 'var(--surface)', boxShadow: '-8px 0 32px rgba(0,0,0,.12)',
        display: 'flex', flexDirection: 'column', animation: 'slideInRight .25s ease', overflow: 'hidden'
      }}>

        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <MdSmartToy size={20} style={{ color: '#8B5CF6' }} />
              <span style={{ fontSize: 17, fontWeight: 700 }}>AI Traceability Report</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              SIG-{String(signal.id).padStart(3, '0')} · {signal.drug} → {signal.event}
            </div>
          </div>
          <button onClick={onClose} style={{
            display: 'flex', padding: 4, borderRadius: 4,
            color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color .2s'
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
            <MdClose size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── Section 1: Quick Stats ──────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Causality', val: signal.causality, badge: `badge-${sevColors[signal.severity] || 'neutral'}` },
              { label: 'Confidence', val: signal.confidence, custom: true },
              { label: 'Onset', val: signal.time_to_onset || 'N/A' },
            ].map((s, i) => (
              <div key={i} style={{
                padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)', textAlign: 'center'
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
                  letterSpacing: '.05em', marginBottom: 6
                }}>{s.label}</div>
                {s.custom ? <ConfidencePill value={s.val} />
                  : s.badge ? <span className={`badge ${s.badge}`}>{s.val}</span>
                    : <div style={{ fontSize: 14, fontWeight: 700 }}>{s.val}</div>}
              </div>
            ))}
          </div>

          {/* ── Section 2: Original Patient Text ───────────── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <MdFormatQuote size={16} style={{ color: '#8B5CF6' }} />
              <span style={{
                fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
                letterSpacing: '.05em'
              }}>Masked Patient Text</span>
              <span style={{ fontSize: 9, color: '#8B5CF6', fontWeight: 700,
                background: 'rgba(139,92,246,.12)', border: '1px solid rgba(139,92,246,.25)',
                borderRadius: 8, padding: '1px 6px', letterSpacing: '.04em' }}>🔒 PII Masked</span>
            </div>
            <div style={{
              padding: '14px 18px', background: '#181825', borderRadius: 'var(--radius)',
              borderLeft: '3px solid #8B5CF6', fontSize: 13, lineHeight: 1.7,
              color: '#cdd6f4', fontFamily: "'JetBrains Mono',Consolas,monospace"
            }}>
              {alertSanitize(signal.raw_text || signal.source_text || `Patient reported experiencing ${signal.event} after taking ${signal.drug}. Time to onset: ${signal.time_to_onset || 'unknown'}.`)}
            </div>
          </div>

          {/* ── Section 3: Extracted Entities ───────────────── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <MdLabel size={16} style={{ color: '#10B981' }} />
              <span style={{
                fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
                letterSpacing: '.05em'
              }}>Extracted Entities</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {entities.map((e, i) => (
                <div key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 20, background: e.bg,
                  border: `1px solid ${e.color}22`, fontSize: 12, fontWeight: 600
                }}>
                  <span style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>{e.label}:</span>
                  <span style={{ color: e.color, fontWeight: 700 }}>{e.value || 'N/A'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Section 4: LLM Reasoning Engine ────────────── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <MdPsychology size={16} style={{ color: '#F59E0B' }} />
              <span style={{
                fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
                letterSpacing: '.05em'
              }}>LLM Reasoning Engine</span>
            </div>
            <div style={{
              padding: '14px 18px', background: 'rgba(245,158,11,.06)',
              border: '1px solid rgba(245,158,11,.15)', borderRadius: 'var(--radius)',
              fontSize: 13, lineHeight: 1.7, color: 'var(--text)'
            }}>
              {alertSanitize(signal.reasoning || `Flagged because temporal relationship (${signal.time_to_onset || 'reported'}) and adverse event "${signal.event}" match MedDRA standard for ${signal.drug}. WHO-UMC assessment: ${signal.causality}.`)}
            </div>
          </div>

          {/* ── Section 4b: DDI & Concomitant Analysis ──────── */}
          {hasConcomitant && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <MdScience size={16} style={{ color: '#0ea5e9' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  DDI & Concomitant Analysis
                </span>
              </div>

              {ddiRisk === 'High' ? (
                <div style={{ padding: '14px 18px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.15)', borderRadius: 'var(--radius)', fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
                  <strong style={{ color: '#EF4444' }}>⚠️ High Drug-Drug Interaction Risk Detected</strong><br />
                  <span style={{ color: 'var(--muted)' }}>{interactionReasoning}</span>
                </div>
              ) : altCause ? (
                <div style={{ padding: '14px 18px', background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.15)', borderRadius: 'var(--radius)', fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
                  <strong style={{ color: '#F59E0B' }}>🔄 Alternative Cause Identified: Concomitant Drug</strong><br />
                  <span style={{ color: 'var(--muted)' }}>{interactionReasoning}</span>
                </div>
              ) : (
                <div style={{ padding: '14px 18px', background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.15)', borderRadius: 'var(--radius)', fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
                  <strong style={{ color: '#10B981' }}>✅ No Significant Concomitant Interference</strong><br />
                  <span style={{ color: 'var(--muted)' }}>{interactionReasoning}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Section 5: FDA Evidence ─────────────────────────── */}
          {(() => {
            const fda = signal?.fdaAnalysis
            const fdaStatus = getFDAStatus(fda)
            if (!fda) return null
            const riskCol = fda.riskLevel === 'high' ? '#EF4444'
              : fda.riskLevel === 'moderate' ? '#F59E0B' : '#10B981'
            return (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <MdScience size={16} style={{ color: '#EF4444' }} />
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
                    letterSpacing: '.05em'
                  }}>FDA Evidence (openFDA)</span>
                  {fdaStatus === FDA_STATUS.MATCH_FOUND && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                      background: 'rgba(239,68,68,.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,.3)' }}>
                      MATCH FOUND
                    </span>
                  )}
                  {fdaStatus === FDA_STATUS.INSUFFICIENT_DATA && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                      background: 'rgba(148,163,184,.12)', color: '#94A3B8', border: '1px solid rgba(148,163,184,.3)' }}>
                      INSUFFICIENT DATA
                    </span>
                  )}
                </div>
                {fdaStatus === FDA_STATUS.INSUFFICIENT_DATA ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 12px',
                    background: 'rgba(148,163,184,.06)', borderRadius: 6, border: '1px solid rgba(148,163,184,.2)' }}>
                    FDA analysis could not run — no valid drug was detected in this record.
                  </div>
                ) : !fda.available ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 12px',
                    background: 'rgba(148,163,184,.06)', borderRadius: 6, border: '1px solid rgba(148,163,184,.2)' }}>
                    FDA data unavailable. AI analysis was not affected.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 12, color: 'var(--text2)', padding: '8px 12px',
                      background: fdaStatus === FDA_STATUS.MATCH_FOUND ? 'rgba(239,68,68,.05)' : 'rgba(16,185,129,.04)',
                      borderRadius: 6, lineHeight: 1.5,
                      border: `1px solid ${fdaStatus === FDA_STATUS.MATCH_FOUND ? 'rgba(239,68,68,.2)' : 'rgba(16,185,129,.15)'}` }}>
                      {fda.summary || '—'}
                    </div>
                    {fdaStatus === FDA_STATUS.MATCH_FOUND && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                          background: `${riskCol}18`, color: riskCol, border: `1px solid ${riskCol}40` }}>
                          {(fda.riskLevel || 'unknown').toUpperCase()} RISK
                        </span>
                        {fda.confidenceBoost > 0 && (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                            background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.25)' }}>
                            +{fda.confidenceBoost}% Confidence Boost
                          </span>
                        )}
                        {(fda.matchedSymptoms || []).map(sym => (
                          <span key={sym} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99,
                            background: 'rgba(239,68,68,.08)', color: '#EF4444',
                            border: '1px solid rgba(239,68,68,.2)', fontWeight: 600 }}>
                            {sym}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                      Source: {fda.evidenceSource || 'openFDA'} · APIs: {(fda.sourceApis || []).join(', ') || '—'}
                      {fda.cacheHit && ' · ⚡ Cached'}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Section 6: WHO-UMC Factors ──────────────────── */}
          {factors.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <MdBiotech size={16} style={{ color: '#3B82F6' }} />
                <span style={{
                  fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
                  letterSpacing: '.05em'
                }}>WHO-UMC Assessment Factors</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {factors.map((f, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 14px',
                    background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13
                  }}>
                    <span style={{ color: 'var(--blue)', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── PubMed Link ────────────────────────────────── */}
          {signal.pubmed_link && signal.pubmed_link !== 'N/A' && (
            <a href={signal.pubmed_link} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                background: 'var(--blue-bg)', border: '1px solid rgba(0,123,255,.2)', borderRadius: 'var(--radius)',
                color: 'var(--blue)', fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'all .2s'
              }}>
              <MdOpenInNew size={14} /> Verify on PubMed →
            </a>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end'
        }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => { onClose(); window.__exportE2B?.(signal.id) }}>
            <MdDownload size={16} /> Export E2B XML
          </button>
        </div>
      </div>
    </div>
  )
}


/* ══════════════════════════════════════════════════════════════
   MAIN — ALERTS COMMAND CENTER
   ══════════════════════════════════════════════════════════════ */
export default function Alerts({ openModal }) {
  // ── UI-only state ──────────────────────────────────────────
  const [trendData, setTrendData]     = useState([])
  const [exportingId, setExportingId] = useState(null)
  const [drawerSignal, setDrawerSignal] = useState(null)
  const [sevFilter, setSevFilter]     = useState('All')

  // ── Zustand store (single source of truth) ─────────────────
  const liveSignals         = useAyuStore(s => s.intelligenceRecords)
  const vaultLoading        = useAyuStore(s => s.vaultLoading)
  const refreshIntelligence = useAyuStore(s => s.refreshIntelligence)
  const loading = vaultLoading && liveSignals.length === 0

  // ── FDA Modal state ──────────────────────────────────────────
  const [fdaModal,   setFdaModal]   = useState(null)  // { signal, fda }
  const [fdaLoading, setFdaLoading] = useState(null)  // signal.id being fetched
  const [fdaResults, setFdaResults] = useState({})    // { [id]: fdaAnalysis }

  // ── FDA Modal open handler ───────────────────────────────────
  const handleOpenFdaModal = useCallback(async (signal) => {
    const existing = fdaResults[signal.id] || signal.fdaAnalysis
    if (existing) { setFdaModal({ signal, fda: existing }); return }
    setFdaLoading(signal.id)
    try {
      const res  = await fetch(`${API_BASE}/api/fda/analyze-record/${signal.id}`, { method: 'POST' })
      const data = await res.json()
      const fda  = data.fdaAnalysis || null
      setFdaResults(prev => ({ ...prev, [signal.id]: fda }))
      setFdaModal({ signal, fda })
    } catch { setFdaModal({ signal, fda: null }) }
    finally { setFdaLoading(null) }
  }, [fdaResults])

  const handleFdaRefresh = useCallback((id, newFda) => {
    setFdaResults(prev => ({ ...prev, [id]: newFda }))
  }, [])

  /* -- Fetch trend timeline (local — no global equivalent) -- */
  const fetchTrends = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/trends?days=7`)
      const data = await res.json()
      if (data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
        setTrendData(data.data)
      } else {
        const days = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i)
          days.push({ date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), signals: 0 })
        }
        setTrendData(days)
      }
    } catch { /* silently ignore */ }
  }, [])

  useEffect(() => {
    refreshIntelligence()
    fetchTrends()
    const onVisible = () => { if (document.visibilityState === 'visible') refreshIntelligence() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchTrends, refreshIntelligence])
  useDataRefresh(refreshIntelligence)

  /* ── E2B Export ───────────────────────────────────────────── */
  const handleExportE2B = async (recordId) => {
    setExportingId(recordId)
    try {
      const res = await fetch(`${API_BASE}/api/export-e2b/${recordId}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `E2B_ICSR_${recordId}.xml`
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      openModal?.({
        title: 'Export Failed',
        children: <p style={{ color: 'var(--danger)' }}>Failed to export E2B XML.</p>,
        footer: <button className="btn btn-primary" onClick={() => openModal(null)}>OK</button>
      })
    }
    setExportingId(null)
  }
  // Expose for drawer
  useEffect(() => { window.__exportE2B = handleExportE2B; return () => { delete window.__exportE2B } })

  /* ── Build timeline (use live trend data, fall back to signal distribution) ── */
  const timelineData = trendData.length > 0 ? trendData : (() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const base = Math.max(1, Math.floor(liveSignals.length / 7))
      days.push({ date: label, signals: Math.max(0, base + (i === 0 ? 2 : 0)) })
    }
    return days
  })()

  /* ── Filter signals ──────────────────────────────────────── */
  const filtered = sevFilter === 'All' ? liveSignals
    : liveSignals.filter(s => s.severity === sevFilter)

  /* ── KPIs ────────────────────────────────────────────────── */
  const criticalCount = liveSignals.filter(s => s.severity === 'Critical').length
  const highCount = liveSignals.filter(s => s.severity === 'High').length
  const certainCount = liveSignals.filter(s => (s.causality || '').toLowerCase().includes('certain')).length

  return (
    <>
      {/* ── Filter bar ──────────────────────────────────────── */}
      <div className="filter-bar">
        <MdFilterList size={18} style={{ color: 'var(--muted)' }} />
        <select className="filter-select" value={sevFilter} onChange={e => setSevFilter(e.target.value)}>
          <option value="All">All Severities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={refreshIntelligence} disabled={loading}>
          <MdRefresh size={16} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh Live'}
        </button>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => openModal?.({
          title: 'Create Alert Rule',
          children: <><div className="form-group"><label className="form-label">Alert Name</label>
            <input className="form-input" placeholder="Enter alert name" /></div>
            <div className="form-group"><label className="form-label">Condition</label>
              <select className="form-input"><option>PRR Score exceeds threshold</option><option>Sentiment spike</option></select></div>
            <div className="form-group"><label className="form-label">Threshold</label>
              <input className="form-input" type="number" placeholder="e.g. 3.0" /></div></>,
          footer: <><button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => openModal(null)}>Create Rule</button></>
        })}>+ Alert Rule</button>
      </div>

      {/* ── KPI Grid ─────────────────────────────────────────── */}
      <div className="kpi-grid">
        {[
          { label: 'Total Signals', value: String(liveSignals.length), change: 'Intelligence Vault', icon: '📊' },
          { label: 'Critical', value: String(criticalCount), change: 'Immediate action', icon: '🔴' },
          { label: 'High Severity', value: String(highCount), change: 'Active monitoring', icon: '🟠' },
          { label: 'Certain Causality', value: String(certainCount), change: 'WHO-UMC validated', icon: '✅' },
        ].map(k => (
          <div className="kpi-card" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{loading ? '…' : k.value}</div>
            <span className="kpi-change up"><MdArrowUpward size={14} />{k.change}</span>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════
          SIGNAL VOLUME TIMELINE (Recharts)
          ═══════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MdTimeline size={18} style={{ color: 'var(--blue)' }} />
            Signal Volume — 7 Day Trend
          </span>
          <span className="badge badge-info" style={{ fontSize: 10 }}>
            <MdTrendingUp size={12} style={{ marginRight: 4 }} /> LIVE
          </span>
        </div>
        <div className="card-body" style={{ padding: '12px 16px 8px' }}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={timelineData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="signalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="signals" stroke="#3B82F6" strokeWidth={2.5}
                fill="url(#signalGrad)" dot={{ r: 4, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2, fill: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          ALERTS TABLE WITH CONFIDENCE & TRACEABILITY
          ═══════════════════════════════════════════════════════ */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#10B981',
              display: 'inline-block', animation: 'pulse 2s infinite'
            }} />
            Live AI Signals ({filtered.length})
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>AyuScout V2 Intelligence Vault</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
              <span className="login-spinner" style={{ width: 24, height: 24, marginBottom: 12, display: 'inline-block' }} />
              <div>Loading signals from backend…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
              No signals match the current filter.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Drug</th>
                  <th>Adverse Event</th>
                  <th>Causality</th>
                  <th>Confidence</th>
                  <th>Severity</th>
                  <th>FDA Signal</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td><strong style={{ color: 'var(--blue)' }}>SIG-{String(s.id).padStart(3, '0')}</strong></td>
                    <td style={{ fontWeight: 600 }}>{s.drug}</td>
                    <td>{s.event}</td>
                    <td><span className={`badge badge-${sevColors[s.severity] || 'neutral'}`}>{s.causality}</span></td>
                    <td><ConfidencePill value={s.confidence} /></td>
                    <td><span className={`badge badge-${sevColors[s.severity] || 'neutral'}`}>{s.severity}</span></td>
                    {/* ── FDA Signal cell — canonical getFDAStatus ── */}
                    <td>
                      {(() => {
                        const effectiveFda = fdaResults[s.id] || s.fdaAnalysis
                        const isLoadingThis = fdaLoading === s.id

                        if (isLoadingThis) {
                          return (
                            <span style={{ fontSize: 10, color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <MdScience size={11} className="spin" /> Checking…
                            </span>
                          )
                        }

                        const status = getFDAStatus(effectiveFda)
                        const label  = getFDALabel(status)
                        const { bg, color, border } = getFDABadgeStyle(status)

                        return (
                          <button
                            onClick={() => handleOpenFdaModal(s)}
                            title={effectiveFda ? 'View FDA evidence' : 'Click to run FDA analysis'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                              background: bg, color, border: `1px solid ${border}`,
                              cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            <MdScience size={10} /> {label}
                          </button>
                        )
                      })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm"
                          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 10px' }}
                          onClick={() => setDrawerSignal(s)}>
                          <MdVisibility size={13} /> AI Traceability
                        </button>
                        <button className="btn btn-ghost btn-sm"
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}
                          onClick={() => handleExportE2B(s.id)}
                          disabled={exportingId === s.id} title="Export E2B XML">
                          <MdDownload size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Traceability Drawer ──────────────────────────────── */}
      {drawerSignal && (
        <TraceabilityDrawer signal={drawerSignal} onClose={() => setDrawerSignal(null)} />
      )}

      {/* ── FDA EVIDENCE MODAL — portal to escape .fade-in stacking context ── */}
      {fdaModal && (
        <FDAModalPortal>
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 99999,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 24,
            }}
            onClick={e => { if (e.target === e.currentTarget) setFdaModal(null) }}
          >
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, width: '100%', maxWidth: 560,
              maxHeight: '88vh', overflowY: 'auto',
              boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
              position: 'relative',
            }}>
              {/* Sticky header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0,
                background: 'var(--surface)', zIndex: 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MdScience size={18} style={{ color: '#EF4444' }} />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>FDA Evidence</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    SIG-{String(fdaModal.signal.id).padStart(3, '0')}
                  </span>
                </div>
                <button
                  onClick={() => setFdaModal(null)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--muted)', display: 'flex', padding: 4,
                    borderRadius: 6, transition: 'color .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
                >
                  <MdClose size={20} />
                </button>
              </div>
              <div style={{ padding: '20px' }}>
                <FDAEvidenceModal
                  fda={fdaModal.fda}
                  recordId={fdaModal.signal.id}
                  recordType="intelligence"
                  drug={fdaModal.signal.drug}
                  event={fdaModal.signal.event}
                  onClose={() => setFdaModal(null)}
                  onRefresh={handleFdaRefresh}
                />
              </div>
            </div>
          </div>
        </FDAModalPortal>
      )}
    </>
  )
}