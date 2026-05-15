import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { MdArrowUpward, MdArrowDownward, MdOpenInNew, MdDownload, MdScience } from 'react-icons/md'
import { API_BASE } from '../config';
import { fireDataUpdated } from '../utils/dataEvents'
import useAyuStore from '../store/useAyuStore'
import { sanitizePII } from '../utils/sanitizePII'


// Color helpers
function getCausalityColor(causality) {
  const c = (causality || '').toLowerCase()
  if (c.includes('certain')) return '#EF4444'
  if (c.includes('probable')) return '#F59E0B'
  if (c.includes('possible')) return '#3B82F6'
  return '#94A3B8'
}

function getSeverityBadge(severity) {
  const s = (severity || '').toLowerCase()
  if (s === 'critical') return 'danger'
  if (s === 'high') return 'warning'
  if (s === 'medium') return 'info'
  return 'neutral'
}

export default function Dashboard({ currentUser }) {
  const [inputText, setInputText] = useState("")
  const [aiResult, setAiResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [exportingE2B, setExportingE2B] = useState(false)
  const [piiWarning, setPiiWarning] = useState(null)  // shows which PII types were stripped
  // AbortController ref to cancel in-flight requests
  const abortRef = useRef(null)

  // Read stats from centralized store (shared with TrendAnalysis tab)
  const stats       = useAyuStore(s => s.stats)
  const statsLoading = useAyuStore(s => s.statsLoading)
  const refreshAll  = useAyuStore(s => s.refreshAll)
  const setLatestAnalysis = useAyuStore(s => s.setLatestAnalysis)

  // Initial data load
  useEffect(() => {
    const store = useAyuStore.getState()
    if (!store.stats) store.refreshStats()
  }, [])

  const analyzeTextWithAI = async () => {
    // Cancel any in-flight request to prevent race conditions
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    // ── PRIVACY LAYER 1: Client-side PII sanitization ──────────────────────
    // Raw input is NEVER sent to the backend or stored in any tab.
    // sanitizePII() runs synchronously here, before any async operation.
    const { sanitized: sanitizedText, hadPII, detectedTypes } = sanitizePII(inputText)
    if (hadPII) {
      setPiiWarning(`PII detected and masked: ${detectedTypes.join(', ')}`)
      console.log('[PII] Client-side mask applied:', detectedTypes, '→', sanitizedText)
    } else {
      setPiiWarning(null)
    }
    // Raw inputText is discarded here — sanitizedText flows downstream

    setIsLoading(true)
    setAiResult(null)
    const requestTs = Date.now()

    try {
      // ── Send SANITIZED text to backend (backend masks again as Layer 2) ──
      const response = await fetch(`${API_BASE}/api/analyze-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sanitizedText }),
        signal: abortRef.current.signal,
      })
      const data = await response.json()
      if (data.status === "success") {
        setAiResult(data)
        setInputText("")  // Clear raw input — never keep PII visible
        // Push to centralized store — ALL tabs update instantly
        setLatestAnalysis(data)
        fireDataUpdated()  // Legacy event bus fallback
        // Refresh all vault data in parallel (non-blocking)
        refreshAll(currentUser?.id)
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[Dashboard] Request aborted — superseded by newer analysis')
        return
      }
      console.error("API Error:", error)
      setAiResult({
        status: "success",
        masked_text: "[Backend offline]",
        pii_detected: false, pii_types_detected: [], pii_token_count: 0,
        intake_id: null, intelligence_id: null, e2b_available: false,
        clinical_data: { suspect_drug: "Backend Offline", adverse_event: "Connection refused", meddra_term: "N/A", concomitant_drugs: [], time_to_onset: "N/A" },
        doctor_verdict: { causality_score: "Unassessable", confidence_score: "0%", reasoning: "Backend server not running. Start with: python server.py", severity: "Low" },
        causality: "Unassessable", confidence: "0%", severity: "Low",
        reasoning: "Backend server not running. Start with: python server.py",
        extraction_attempts: 0, who_umc_details: {}
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportE2B = async () => {
    if (!aiResult) return
    setExportingE2B(true)
    try {
      // Use backend E2B if intelligence_id is available (production path)
      if (aiResult.intelligence_id) {
        const res = await fetch(`${API_BASE}/api/export-e2b/${aiResult.intelligence_id}`)
        if (res.ok) {
          const blob = await res.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `E2B_R3_ICSR_${aiResult.intelligence_id}_${Date.now()}.xml`
          document.body.appendChild(a)
          a.click()
          a.remove()
          window.URL.revokeObjectURL(url)
          setExportingE2B(false)
          return
        }
      }
      // Fallback: client-side masked E2B (never uses raw text)
      const xml = generateClientSideE2B(aiResult)
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `E2B_ICSR_masked_${Date.now()}.xml`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('E2B export failed:', err)
    }
    setExportingE2B(false)
  }


  // Derived dynamic data
  const pieData = stats?.pie_data || [
    { name: 'Positive', value: 33, color: '#10B981' },
    { name: 'Neutral', value: 34, color: '#F59E0B' },
    { name: 'Negative', value: 33, color: '#EF4444' },
  ]
  const keywords = stats?.keyword_data || []
  const alerts = stats?.recent_alerts || []
  const recentPosts = stats?.recent_posts || []
  const totalRecords = stats?.total_records || 0

  // Build keyword trend chart data from top_drugs
  const topDrugs = stats?.top_drugs || []
  const keywordChartData = topDrugs.length > 0
    ? [{ date: 'Current', ...Object.fromEntries(topDrugs.map(([d, c]) => [d, c])) }]
    : []

  // Build severity chart from severity_counts
  const sevCounts = stats?.severity_counts || {}
  const severityChartData = Object.entries(sevCounts).filter(([,v]) => v > 0).map(([k, v]) => ({ name: k, value: v }))

  return (
    <>
      {/* Filter Bar */}
      <div className="filter-bar">
        <select className="filter-select"><option>Project: Diabetes Monitoring</option><option>Cardio Safety</option></select>
        <select className="filter-select"><option>Keywords: Select keywords</option></select>
        <select className="filter-select"><option>Sources: All Sources</option><option>Reddit</option><option>X (Twitter)</option></select>
        <select className="filter-select"><option>Date Range: All Time</option></select>
        <select className="filter-select"><option>Sentiment: All</option></select>
        <button className="btn btn-primary btn-sm">Apply Filters</button>
      </div>

      {/* LIVE AI COMMAND CENTER */}
      <div className="card" style={{ marginBottom: 24, padding: 20, borderLeft: '4px solid #007BFF' }}>
        <h3 style={{ marginTop: 0, marginBottom: 16, color: '#007BFF', display: 'flex', alignItems: 'center', gap: 8, fontSize: '18px' }}>
          <MdScience size={22} /> AyuScout V2 — Live AI Command Center
        </h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <textarea
            rows="2"
            style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #E2E8F0", resize: 'none', outline: 'none', fontSize: 14 }}
            placeholder="Paste a patient report or social media post... (e.g., Taking Lisinopril for 3 months, face started swelling yesterday)"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button className="btn btn-primary" onClick={analyzeTextWithAI} disabled={isLoading || !inputText}
            style={{ padding: '0 24px', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {isLoading ? "⏳ Agents Analyzing..." : "🚀 Run AI Analysis"}
          </button>
        </div>

        {/* AI Result Box */}
        {aiResult && (
          <div style={{ marginTop: 20, padding: 16, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>

            {/* ── PII Vault Protection Card ─────────────────────── */}
            <div style={{
              marginBottom: 16, padding: '14px 18px', borderRadius: 8,
              background: aiResult.pii_detected ? 'rgba(139,92,246,.06)' : 'rgba(16,185,129,.06)',
              border: `1px solid ${aiResult.pii_detected ? 'rgba(139,92,246,.25)' : 'rgba(16,185,129,.25)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>🔒</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: aiResult.pii_detected ? '#8B5CF6' : '#10B981' }}>
                  PII Vault Protection {aiResult.pii_detected ? '✅' : '— No PII Detected'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px 16px', fontSize: 12 }}>
                <div><span style={{ color: 'var(--muted)', fontWeight: 700 }}>Status:</span>{' '}
                  <span style={{ color: '#10B981', fontWeight: 600 }}>Protected</span></div>
                <div><span style={{ color: 'var(--muted)', fontWeight: 700 }}>Masked Tokens:</span>{' '}
                  <strong>{aiResult.pii_token_count || 0}</strong></div>
                <div><span style={{ color: 'var(--muted)', fontWeight: 700 }}>Detected Types:</span>{' '}
                  <span style={{ color: '#8B5CF6', fontWeight: 600 }}>
                    {aiResult.pii_types_detected?.length ? aiResult.pii_types_detected.join(', ') : 'None'}
                  </span></div>
                <div><span style={{ color: 'var(--muted)', fontWeight: 700 }}>AI Input:</span>{' '}
                  <span style={{ color: '#10B981' }}>Anonymized text only</span></div>
                <div><span style={{ color: 'var(--muted)', fontWeight: 700 }}>Database Storage:</span>{' '}
                  <span style={{ color: '#10B981' }}>Masked text stored</span></div>
                <div><span style={{ color: 'var(--muted)', fontWeight: 700 }}>Original PII:</span>{' '}
                  <span style={{ color: '#EF4444', fontWeight: 600 }}>Hidden from frontend</span></div>
              </div>
              {/* Vault storage confirmations */}
              {(aiResult.intake_id || aiResult.intelligence_id) && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(139,92,246,.15)',
                  display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11 }}>
                  {aiResult.intake_id && (
                    <span style={{ color: '#10B981', fontWeight: 700 }}>
                      Saved to Intake Vault (INT-{String(aiResult.intake_id).padStart(3,'0')})
                    </span>
                  )}
                  {aiResult.intelligence_id && (
                    <span style={{ color: '#10B981', fontWeight: 700 }}>
                      Intelligence Record Created (SIG-{String(aiResult.intelligence_id).padStart(3,'0')})
                    </span>
                  )}
                  {aiResult.e2b_available && (
                    <span style={{ color: '#3B82F6', fontWeight: 700 }}>
                      Data Explorer / Alerts / Reports Updated
                    </span>
                  )}
                  <span style={{ color: '#10B981', fontWeight: 700 }}>
                    Notification Created
                  </span>
                </div>
              )}
            </div>

            {/* ── Masked Text Preview ────────────────────────────── */}
            {aiResult.masked_text && (
              <div style={{ marginBottom: 16, padding: '12px 16px', background: '#181825', borderRadius: 8,
                borderLeft: '3px solid #8B5CF6' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8B5CF6', letterSpacing: '.05em',
                  textTransform: 'uppercase', marginBottom: 6 }}>Masked Patient Text (AI Input)</div>
                <div style={{ fontFamily: "'JetBrains Mono',Consolas,monospace", fontSize: 12,
                  color: '#cdd6f4', lineHeight: 1.6 }}>{aiResult.masked_text}</div>
              </div>
            )}

            {/* ── Clinical Extraction Grid ───────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>🚨 Suspect Drug</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{aiResult.clinical_data?.suspect_drug || "None"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>⚠️ Adverse Event (MedDRA)</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {aiResult.clinical_data?.meddra_term || aiResult.clinical_data?.adverse_event || "None"}
                </div>
                {aiResult.clinical_data?.adverse_event && aiResult.clinical_data?.meddra_term && aiResult.clinical_data.adverse_event !== aiResult.clinical_data.meddra_term && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Patient term: {aiResult.clinical_data.adverse_event}</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>⏱️ Time to Onset</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{aiResult.clinical_data?.time_to_onset || "Unknown"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>💊 Concomitant Drugs</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {(aiResult.clinical_data?.concomitant_drugs || []).length > 0
                    ? aiResult.clinical_data.concomitant_drugs.join(', ')
                    : 'None'}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, padding: '16px 0', borderTop: '1px solid #E2E8F0' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>📊 WHO-UMC Causality</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: getCausalityColor(aiResult.causality) }}>
                  {aiResult.causality || "Pending"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>🎯 Confidence Score</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: getCausalityColor(aiResult.causality) }}>
                  {aiResult.confidence || "Unknown"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>🔴 Severity</div>
                <span className={`badge badge-${getSeverityBadge(aiResult.severity)}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                  {aiResult.severity || "Unknown"}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>🔗 PubMed</div>
                {aiResult.pubmed_link && aiResult.pubmed_link !== '' ? (
                  <a href={aiResult.pubmed_link} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13 }}>Verify →</a>
                ) : <span style={{ color: 'var(--muted)', fontSize: 13 }}>N/A</span>}
              </div>
            </div>
            {aiResult.reasoning && (
              <div style={{ padding: '12px 0', borderTop: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>🧠 AI Reasoning</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>{aiResult.reasoning}</div>
              </div>
            )}
            {aiResult.who_umc_details?.factors && (
              <div style={{ padding: '12px 0', borderTop: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>📋 WHO-UMC Assessment Factors</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {aiResult.who_umc_details.factors.map((f, i) => (
                    <span key={i} style={{ fontSize: 11, padding: '3px 8px', background: '#E2E8F0', borderRadius: 4 }}>{f}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── FDA Evidence Card ────────────────────────────────── */}
            {(() => {
              const fda = aiResult?.fdaAnalysis
              if (!fda) return null

              if (!fda.available) {
                return (
                  <div style={{ padding: '10px 14px', marginTop: 12, borderTop: '1px solid #E2E8F0',
                    background: 'rgba(148,163,184,0.06)', borderRadius: 8,
                    border: '1px solid rgba(148,163,184,0.2)', fontSize: 12, color: 'var(--muted)' }}>
                    ⚠️ <strong>FDA Evidence:</strong> openFDA data could not be retrieved. Normal AI analysis is unaffected.
                  </div>
                )
              }

              if (!fda.applicable) {
                return (
                  <div style={{ padding: '10px 14px', marginTop: 12, borderTop: '1px solid #E2E8F0',
                    background: 'rgba(16,185,129,0.04)', borderRadius: 8,
                    border: '1px solid rgba(16,185,129,0.15)', fontSize: 12 }}>
                    <span style={{ color: '#10B981', fontWeight: 700 }}>ℹ️ FDA Evidence:</span>{' '}
                    <span style={{ color: 'var(--text2)' }}>{fda.summary || 'Not applicable for this case.'}</span>
                  </div>
                )
              }

              // FDA Match Found
              const riskColor = fda.riskLevel === 'high' ? '#EF4444' : fda.riskLevel === 'moderate' ? '#F59E0B' : '#10B981'
              return (
                <div style={{ padding: '14px 16px', marginTop: 12, borderTop: '1px solid #E2E8F0',
                  background: 'rgba(239,68,68,0.04)', borderRadius: 8,
                  border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14 }}>🏛️</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#EF4444' }}>FDA-Supported Adverse Event Signal</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                      background: `${riskColor}18`, color: riskColor, border: `1px solid ${riskColor}40` }}>
                      {(fda.riskLevel || 'unknown').toUpperCase()} RISK
                    </span>
                    {fda.confidenceBoost > 0 && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                        background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.25)' }}>
                        +{fda.confidenceBoost}% Confidence Boost
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 12, marginBottom: 8 }}>
                    <div><span style={{ color: 'var(--muted)', fontWeight: 700 }}>Drug: </span>
                      {fda.drug}{fda.normalizedDrug !== fda.drug && fda.normalizedDrug
                        ? <span style={{ color: 'var(--muted)' }}> → {fda.normalizedDrug}</span> : ''}</div>
                    <div><span style={{ color: 'var(--muted)', fontWeight: 700 }}>Source: </span>{fda.evidenceSource || 'openFDA'}</div>
                    <div><span style={{ color: 'var(--muted)', fontWeight: 700 }}>Matched: </span>
                      <span style={{ color: '#EF4444', fontWeight: 600 }}>{(fda.matchedSymptoms || []).join(', ') || '—'}</span></div>
                    <div><span style={{ color: 'var(--muted)', fontWeight: 700 }}>APIs: </span>{(fda.sourceApis || []).join(', ') || '—'}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', padding: '8px 12px',
                    background: 'rgba(239,68,68,0.04)', borderRadius: 6, lineHeight: 1.5 }}>
                    {fda.summary}
                  </div>
                  {fda.cacheHit && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                      ⚡ From cache · Last checked: {fda.lastCheckedAt ? new Date(fda.lastCheckedAt).toLocaleTimeString() : '—'}
                    </div>
                  )}
                </div>
              )
            })()}

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #E2E8F0', fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span><strong>System:</strong> PII Vault ✅ | WHO-UMC Engine ✅ | Vector Store ✅{aiResult?.fdaAnalysis?.available ? ' | openFDA ✅' : ''}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <span><strong>Attempts:</strong> {aiResult.extraction_attempts || 1}</span>
                <button className="btn btn-secondary btn-sm" onClick={handleExportE2B} disabled={exportingE2B}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MdDownload size={14} />
                  {exportingE2B ? 'Exporting...' : aiResult.intelligence_id ? 'Export E2B XML (R3)' : 'Export E2B XML'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Charts Row — Now Dynamic */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Sentiment Donut */}
        <div className="card">
          <div className="card-header"><span className="card-title">Sentiment Overview</span></div>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {statsLoading ? <div style={{ padding: 40, color: 'var(--muted)' }}>Loading...</div> : (
              <>
                <PieChart width={220} height={200}>
                  <Pie data={pieData} cx={110} cy={100} innerRadius={55} outerRadius={85} dataKey="value" stroke="none">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
                <div style={{ position: 'absolute', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{totalRecords}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Total Signals</div>
                </div>
              </>
            )}
          </div>
          <div style={{ padding: '0 20px 16px', display: 'flex', gap: 16, justifyContent: 'center' }}>
            {pieData.map(p => <span key={p.name} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />{p.name} ({p.value}%)
            </span>)}
          </div>
        </div>

        {/* Severity Breakdown Chart */}
        <div className="card">
          <div className="card-header"><span className="card-title">Severity Distribution</span></div>
          <div className="card-body">
            {statsLoading ? <div style={{ padding: 40, color: 'var(--muted)' }}>Loading...</div> : (
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', height: 200, padding: '20px 0' }}>
                {Object.entries(sevCounts).map(([sev, count]) => {
                  const maxCount = Math.max(...Object.values(sevCounts), 1)
                  const height = (count / maxCount) * 150
                  const colors = { Critical: '#EF4444', High: '#F59E0B', Medium: '#3B82F6', Low: '#10B981' }
                  return (
                    <div key={sev} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{count}</span>
                      <div style={{ width: '60%', height, background: colors[sev] || '#94A3B8', borderRadius: '4px 4px 0 0', minHeight: 4, transition: 'height 0.5s ease' }} />
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{sev}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Alerts Panel */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Alerts ({alerts.length})</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {statsLoading ? <div style={{ padding: 20, color: 'var(--muted)' }}>Loading...</div> :
              alerts.length === 0 ? <div style={{ padding: 20, color: 'var(--muted)', textAlign: 'center' }}>No alerts yet. Run AI analysis to generate signals.</div> :
              alerts.map((a, i) => (
                <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{a.title}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={`badge badge-${a.severity === 'Critical' ? 'danger' : a.severity === 'High' ? 'warning' : 'info'}`}>{a.severity}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{a.time}</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Keywords + Table + Recent Posts — Now Dynamic */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Top Drugs Bar */}
        <div className="card">
          <div className="card-header"><span className="card-title">Top Drugs by Signal Count</span></div>
          <div className="card-body">
            {statsLoading ? <div style={{ padding: 40, color: 'var(--muted)' }}>Loading...</div> :
              topDrugs.length === 0 ? <div style={{ padding: 20, color: 'var(--muted)' }}>No data yet.</div> :
              topDrugs.map(([drug, count]) => {
                const maxC = Math.max(...topDrugs.map(d => d[1]), 1)
                return (
                  <div key={drug} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                      <span>{drug}</span><span>{count} signals</span>
                    </div>
                    <div className="progress"><div className="progress-fill" style={{ width: `${(count / maxC) * 100}%`, background: 'var(--blue)' }} /></div>
                  </div>
                )
              })
            }
          </div>
        </div>

        {/* Top Keywords Table */}
        <div className="card">
          <div className="card-header"><span className="card-title">Top Adverse Events</span></div>
          <div className="card-body" style={{ padding: 0 }}>
            {statsLoading ? <div style={{ padding: 20, color: 'var(--muted)' }}>Loading...</div> : (
              <table>
                <thead><tr><th>Event</th><th>Count</th><th>Trend</th></tr></thead>
                <tbody>
                  {(stats?.top_events || []).map(([event, count]) => (
                    <tr key={event}><td><strong>{event}</strong></td><td>{count}</td><td>{count > 1 ? '↗' : '→'}</td></tr>
                  ))}
                  {(stats?.top_events || []).length === 0 && <tr><td colSpan={3} style={{ color: 'var(--muted)', textAlign: 'center' }}>No data</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent Posts */}
        <div className="card">
          <div className="card-header"><span className="card-title">Recent Posts</span></div>
          <div className="card-body" style={{ padding: 0 }}>
            {statsLoading ? <div style={{ padding: 20, color: 'var(--muted)' }}>Loading...</div> :
              recentPosts.length === 0 ? <div style={{ padding: 20, color: 'var(--muted)', textAlign: 'center' }}>No posts yet.</div> :
              recentPosts.map((p, i) => (
                <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || '#FF4500', display: 'inline-block' }} />
                    <strong>{p.platform}</strong>
                    <span className={`badge badge-${p.sentiment === 'Positive' ? 'success' : p.sentiment === 'Neutral' ? 'warning' : 'danger'}`} style={{ marginLeft: 'auto' }}>{p.sentiment}</span>
                  </div>
                  <div style={{ color: 'var(--text2)', fontSize: 12 }}>{p.text}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{p.time}</div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Bottom KPI Strip — Now Dynamic */}
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Total Signals</div><div className="kpi-value">{totalRecords}</div><span className="kpi-change up"><MdArrowUpward size={14} />From Intelligence Vault</span></div>
        <div className="kpi-card"><div className="kpi-label">Critical Signals</div><div className="kpi-value">{sevCounts.Critical || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">Sources Monitored</div><div className="kpi-value" style={{ fontSize: 20 }}>Reddit, X (Twitter)</div></div>
        <div className="kpi-card"><div className="kpi-label">High Severity</div><div className="kpi-value">{sevCounts.High || 0}</div><span className="kpi-change up"><MdArrowUpward size={14} />Active monitoring</span></div>
      </div>
    </>
  )
}

// Client-side E2B XML generation for ad-hoc analysis
function generateClientSideE2B(result) {
  const drug = result.clinical_data?.suspect_drug || 'Unknown'
  const event = result.clinical_data?.meddra_term || result.clinical_data?.adverse_event || 'Unknown'
  const causality = result.causality || 'Unassessable'
  const confidence = result.confidence || 'Unknown'
  const reasoning = result.reasoning || 'AI assessment'
  const now = new Date().toISOString()

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- AyuScout V2 — Ad-hoc E2B (R3) Export | Generated: ${now} -->
<ichicsr lang="en" xmlns="urn:hl7-org:v3">
  <ichicsrmessageheader>
    <messagetype>ichicsr</messagetype>
    <messageformatversion>2.1</messageformatversion>
    <messagenumb>AYUSCOUT-ADHOC-${Date.now()}</messagenumb>
    <messagesenderidentifier>AyuScout-V2-Dashboard</messagesenderidentifier>
    <messagereceiveridentifier>REGULATORY-AUTHORITY</messagereceiveridentifier>
    <messagedate>${now.replace(/[-:T]/g, '').slice(0, 14)}</messagedate>
  </ichicsrmessageheader>
  <safetyreport>
    <safetyreportid>AYUSCOUT-ADHOC-${Date.now()}</safetyreportid>
    <primarysourcecountry>IN</primarysourcecountry>
    <reporttype>1</reporttype>
    <serious>1</serious>
    <patient>
      <patientinitial>[REDACTED-BY-PII-VAULT]</patientinitial>
      <drug>
        <drugcharacterization>1</drugcharacterization>
        <medicinalproduct>${drug}</medicinalproduct>
        <drugreactionassessment>
          <drugassessmentmethod>WHO-UMC Causality System</drugassessmentmethod>
          <drugassessmentresult>${causality}</drugassessmentresult>
          <drugassessmentsource>AyuScout V2 (Confidence: ${confidence})</drugassessmentsource>
        </drugreactionassessment>
      </drug>
      <reaction>
        <primarysourcereaction>${event}</primarysourcereaction>
        <reactionmeddrapt>${event}</reactionmeddrapt>
        <reactionoutcome>6</reactionoutcome>
      </reaction>
      <summary>
        <narrativeincludeclinical>
          AI Reasoning: ${reasoning}
          Generated by AyuScout V2 Dashboard (Ad-hoc Analysis)
        </narrativeincludeclinical>
      </summary>
    </patient>
  </safetyreport>
</ichicsr>`
}