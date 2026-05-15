import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { MdRefresh, MdSearch, MdClose, MdScience, MdDataset } from 'react-icons/md'

import { API_BASE } from '../config';
import { useDataRefresh } from '../utils/dataEvents'
import useAyuStore from '../store/useAyuStore'
import FDAEvidenceModal from '../components/FDAEvidenceModal'
import FDAModalPortal from '../components/FDAModalPortal'
import { getFDAStatus, getFDALabel, getFDABadgeStyle, FDA_STATUS } from '../utils/fdaStatus'


// ============================================================
// EMOTION CATEGORIZER (Keyword-based NLP helper)
// Maps negative-sentiment post text to an emotion bucket.
// ============================================================
function categorizeEmotion(text = '') {
  const t = text.toLowerCase()
  if (/scared|worried|anxious|terrified|panic|fear|afraid|frightened|nervous|dread/i.test(t))
    return 'Fear / Anxiety'
  if (/angry|frustrat|ridiculous|unacceptable|outraged|annoyed|furious|hate|mad|disgusted/i.test(t))
    return 'Anger / Frustration'
  if (/sad|depressed|hopeless|crying|miserable|devastated|heartbroken|grief|lonely|despair/i.test(t))
    return 'Sadness / Depression'
  if (/pain|hurt|aching|agony|burning|cramp|sore|sting|throb|unbearable/i.test(t))
    return 'Pain / Discomfort'
  if (/confus|lost|overwhelm|don.*know|unsure|uncertain|strange|weird|odd/i.test(t))
    return 'Confusion / Distress'
  return 'General Negative'
}

// ============================================================
// FRONTEND PII SAFETY NET (last-resort display layer, §3)
// ONLY masks: emails, phones, Aadhaar, PAN.
// Does NOT mask names — backend PIIVault is source of truth for those.
// ============================================================
const _FE_PII_RX = [
  [/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,                    '[EMAIL]'],
  [/\b[6-9]\d{9}\b/g,                                                              '[PHONE]'],
  [/(?<!\d)(?:\+?1[\s\-.])?\(?\d{3}\)?[\s\-.]\d{3}[\s\-.]\d{4}(?!\d)/g,          '[PHONE]'],
  [/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,                                          '[AADHAAR]'],
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,                                                   '[PAN]'],
]
function frontendSanitize(text = '') {
  if (!text || typeof text !== 'string') return text
  let out = text
  for (const [rx, rep] of _FE_PII_RX) out = out.replace(rx, rep)
  return out
}
function hasPiiTokens(text = '') {
  return /\[(USER|PHONE|EMAIL|ADDR|AADHAAR|PAN)_\d+\]/i.test(text)
}
function PiiMaskedBadge() {
  return (
    <span title="This record contains masked patient identifiers" style={{
      display:'inline-flex',alignItems:'center',gap:3,fontSize:10,fontWeight:700,
      padding:'2px 7px',borderRadius:10,letterSpacing:'.04em',whiteSpace:'nowrap',
      background:'rgba(139,92,246,.15)',color:'#8B5CF6',border:'1px solid rgba(139,92,246,.3)',
    }}>🔒 PII Masked</span>
  )
}

// Sentiment colours
const SENT_COLORS = {
  Positive: '#10B981',
  Neutral:  '#F59E0B',
  Negative: '#EF4444',
  Unknown:  '#94A3B8',
}

// All emotion buckets — fixed order for consistent line chart X-axis
const ALL_EMOTIONS = [
  'Fear / Anxiety',
  'Anger / Frustration',
  'Sadness / Depression',
  'Pain / Discomfort',
  'Confusion / Distress',
  'General Negative',
]

export default function DataExplorer() {
  // ── UI state only (data lives in Zustand store) ───────────────────────
  const [keyword, setKeyword]         = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [isScouting, setIsScouting]   = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('All')
  const [sentFilter, setSentFilter]     = useState('All')

  // ── FDA Modal state ─────────────────────────────────────────
  const [fdaModal,   setFdaModal]   = useState(null)   // { record, fda }
  const [fdaLoading, setFdaLoading] = useState(null)   // record.id being fetched
  // Local overrides for freshly fetched FDA results (by intake id)
  const [fdaResults, setFdaResults] = useState({})     // { [id]: fdaAnalysis }

  // ── Zustand store subscriptions ─────────────────────────────
  const intakeRecords  = useAyuStore(s => s.intakeRecords)
  const vaultLoading   = useAyuStore(s => s.vaultLoading)
  const refreshIntake  = useAyuStore(s => s.refreshIntake)
  const loading = vaultLoading && intakeRecords.length === 0

  // ── FDA modal open handler ──────────────────────────────────
  const handleOpenFdaModal = useCallback(async (record) => {
    const existing = fdaResults[record.id] || record.fdaAnalysis
    if (existing) {
      setFdaModal({ record, fda: existing })
      return
    }
    // Fetch on demand — triggers /api/fda/analyze-intake/{id}
    setFdaLoading(record.id)
    try {
      const res  = await fetch(`${API_BASE}/api/fda/analyze-intake/${record.id}`, { method: 'POST' })
      const data = await res.json()
      const fda  = data.fdaAnalysis || null
      setFdaResults(prev => ({ ...prev, [record.id]: fda }))
      setFdaModal({ record, fda })
    } catch (err) {
      setFdaModal({ record, fda: null })
    } finally {
      setFdaLoading(null)
    }
  }, [fdaResults])

  const handleFdaRefresh = useCallback((id, newFda) => {
    setFdaResults(prev => ({ ...prev, [id]: newFda }))
  }, [])

  // ── Initial load + auto-refresh ───────────────────────────
  useEffect(() => {
    const store = useAyuStore.getState()
    if (store.intakeRecords.length === 0) store.refreshIntake()
  }, [])
  useDataRefresh(refreshIntake)  // Safety net: legacy event bus

  // ── Scout handler ──────────────────────────────────────────
  const handleFetchSignals = async () => {
    if (!keyword.trim()) return alert('Please enter a drug keyword (e.g., Paracetamol)')
    setIsScouting(true)
    try {
      const res = await fetch(`${API_BASE}/api/run-scout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim() })
      })
      const data = await res.json()
      alert(`Scout Status: ${data.status}`)
      setTimeout(refreshIntake, 2000)  // Refresh store after scout
    } catch {
      alert('Backend connection failed. Is server.py running?')
    } finally {
      setIsScouting(false)
    }
  }

  // ── Analyze handler ────────────────────────────────────────
  const handleAnalyzeVault = async () => {
    setIsAnalyzing(true)
    try {
      // Use repair-pending-intake: full workflow (AI + save intelligence + notifications)
      const res = await fetch(`${API_BASE}/api/repair-pending-intake`, { method: 'POST' })
      const data = await res.json()
      const msg = data.repaired !== undefined
        ? `Processed: ${data.repaired} repaired, ${data.failed} failed.`
        : `Status: ${data.status}`
      alert(`AI Intelligence: ${msg}`)
      refreshIntake()
    } catch {
      // Fallback to process-vault
      try {
        const res2 = await fetch(`${API_BASE}/api/process-vault`)
        const data2 = await res2.json()
        alert(`AI Intelligence: Processed ${data2.total_processed} signals.`)
        refreshIntake()
      } catch {
        alert('Analysis failed. Check your Python terminal for agent logs.')
      }
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ── Filtering logic ────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    let list = intakeRecords
    // Drug search filter — also matches normalized FDA drug and matched symptoms
    if (searchInput.trim()) {
      const q = searchInput.trim().toLowerCase()
      list = list.filter(r =>
        (r.drug_keyword || '').toLowerCase().includes(q) ||
        (r.content || '').toLowerCase().includes(q) ||
        (r.fdaAnalysis?.normalizedDrug || '').toLowerCase().includes(q) ||
        (r.fdaAnalysis?.matchedSymptoms || []).some(s => s.toLowerCase().includes(q))
      )
    }
    // Source filter
    if (sourceFilter !== 'All') {
      list = list.filter(r => (r.platform || '').includes(sourceFilter))
    }
    // Sentiment filter
    if (sentFilter !== 'All') {
      list = list.filter(r => (r.sentiment || 'Unknown') === sentFilter)
    }
    return list
  }, [intakeRecords, searchInput, sourceFilter, sentFilter])

  // ── Chart 1: Sentiment distribution (filtered) ─────────────
  const sentimentChartData = useMemo(() => {
    const counts = { Positive: 0, Neutral: 0, Negative: 0, Unknown: 0 }
    filteredRecords.forEach(r => {
      const s = r.sentiment || 'Unknown'
      counts[s] = (counts[s] || 0) + 1
    })
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, count]) => ({ name, count, fill: SENT_COLORS[name] }))
  }, [filteredRecords])

  // ── Chart 2: Emotion line chart — uses backend emotion field if present ─
  const emotionLineData = useMemo(() => {
    const negativeRecords = filteredRecords.filter(r => r.sentiment === 'Negative')
    const counts = {}
    negativeRecords.forEach(r => {
      // Prefer backend emotion; fall back to frontend keyword categorization
      const emo = r.emotion || categorizeEmotion(r.content || '')
      counts[emo] = (counts[emo] || 0) + 1
    })
    return ALL_EMOTIONS.map(emo => ({
      emotion: emo.split(' / ')[0],
      fullName: emo,
      users: counts[emo] || 0,
    }))
  }, [filteredRecords])

  // ── Unique platforms for filter dropdown ───────────────────
  const platforms = useMemo(() => {
    const set = new Set()
    intakeRecords.forEach(r => {
      const p = (r.platform || '').split('(')[0].trim()
      if (p) set.add(p)
    })
    return ['All', ...Array.from(set)]
  }, [intakeRecords])

  // ── Summary KPIs (from filtered) ──────────────────────────
  const totalFiltered    = filteredRecords.length
  const negCount         = filteredRecords.filter(r => r.sentiment === 'Negative').length
  const analyzedCount    = filteredRecords.filter(r => r.has_analysis).length
  const uniqueDrugs      = new Set(filteredRecords.map(r => r.drug_keyword)).size

  const isSearchActive = searchInput.trim() !== ''

  return (
    <>
      {/* ── COMMAND BAR ─────────────────────────────────────── */}
      <div className="filter-bar" style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '10px 16px', marginBottom: 20, gap: 10, flexWrap: 'wrap'
      }}>
        {/* Drug keyword scout input */}
        <input
          className="form-input"
          placeholder="Drug keyword to scout (e.g., Paracetamol)"
          style={{ maxWidth: 240, padding: '8px 12px', fontSize: 13 }}
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleFetchSignals()}
        />
        <button className="btn btn-primary btn-sm" onClick={handleFetchSignals} disabled={isScouting}>
          {isScouting ? '📡 Scouting...' : '📡 Fetch Signals'}
        </button>
        <button
          className="btn btn-sm"
          style={{ background: '#10b981', color: 'white', border: 'none' }}
          onClick={handleAnalyzeVault} disabled={isAnalyzing}
        >
          {isAnalyzing ? '🧠 Processing...' : '🧠 Run AI Analysis'}
        </button>

        <div style={{ borderLeft: '1px solid var(--border)', height: 24, margin: '0 4px' }} />

        {/* Dynamic drug search filter */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <MdSearch size={16} style={{ position: 'absolute', left: 10, color: 'var(--muted)', pointerEvents: 'none' }} />
          <input
            className="form-input"
            placeholder="Filter by drug name..."
            style={{ paddingLeft: 32, paddingRight: searchInput ? 32 : 12, maxWidth: 200, fontSize: 13,
              border: isSearchActive ? '1.5px solid var(--blue)' : undefined }}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')} style={{
              position: 'absolute', right: 8, background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center'
            }}>
              <MdClose size={14} />
            </button>
          )}
        </div>

        <select className="filter-select" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          {platforms.map(p => <option key={p} value={p}>{p === 'All' ? 'Source: All' : p}</option>)}
        </select>

        <select className="filter-select" value={sentFilter} onChange={e => setSentFilter(e.target.value)}>
          {['All', 'Positive', 'Neutral', 'Negative', 'Unknown'].map(s => (
            <option key={s} value={s}>{s === 'All' ? 'Sentiment: All' : s}</option>
          ))}
        </select>

        <button className="btn btn-ghost btn-sm" onClick={refreshIntake} disabled={loading}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <MdRefresh size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── ACTIVE FILTER BANNER ────────────────────────────── */}
      {isSearchActive && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
          padding: '8px 14px', background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, fontSize: 13
        }}>
          <MdScience size={16} style={{ color: 'var(--blue)' }} />
          <span>Showing <strong>{totalFiltered}</strong> records for drug: <strong style={{ color: 'var(--blue)' }}>"{searchInput}"</strong></span>
          <button onClick={() => setSearchInput('')} style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--blue)', fontSize: 12, fontWeight: 600
          }}>Clear filter ✕</button>
        </div>
      )}

      {/* ── KPI STRIP ───────────────────────────────────────── */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        {[
          { label: isSearchActive ? 'Filtered Records' : 'Total Records', value: totalFiltered, icon: <MdDataset size={18} /> },
          { label: 'Negative Signals',  value: negCount,       icon: '⚠️' },
          { label: 'AI Analyzed',       value: analyzedCount,  icon: '🧠' },
          { label: 'Unique Drugs',      value: uniqueDrugs,    icon: '💊' },
        ].map(k => (
          <div className="kpi-card" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{loading ? '...' : k.value}</div>
            <span className="kpi-change up">{k.icon}</span>
          </div>
        ))}
      </div>

      {/* ── CHARTS ROW ──────────────────────────────────────── */}
      <div className="grid-2" style={{ marginBottom: 24 }}>

        {/* Chart 1: Sentiment Distribution (dynamic — filtered) */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Sentiment Distribution
              {isSearchActive && (
                <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, color: 'var(--blue)' }}>
                  — "{searchInput}"
                </span>
              )}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {totalFiltered} record{totalFiltered !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="card-body">
            {sentimentChartData.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sentimentChartData} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v, n) => [v, 'Records']}
                  />
                  <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                    {sentimentChartData.map((entry, i) => (
                      <Cell key={i} fill={SENT_COLORS[entry.name] || '#94A3B8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Negative Emotion Line Chart — emotion category → users */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Emotion → User Count
              {isSearchActive && (
                <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, color: 'var(--blue)' }}>
                  — "{searchInput}"
                </span>
              )}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {negCount} negative record{negCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="card-body">
            {negCount === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                No negative records in current filter
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={emotionLineData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="emotionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="emotion"
                    tick={{ fontSize: 10, fontWeight: 600 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={40}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    allowDecimals={false}
                    label={{ value: 'Users', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--muted)' }}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v, n, props) => [v, `Users with "${props.payload.fullName}"`]}
                    labelFormatter={label => `Emotion: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="users"
                    stroke="#EF4444"
                    strokeWidth={2.5}
                    dot={{ r: 5, fill: '#EF4444', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 7, fill: '#EF4444' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── INTAKE TABLE ────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MdDataset size={18} />
            {isSearchActive
              ? `Filtered Records: "${searchInput}" (${totalFiltered})`
              : `Intake Vault Records (${intakeRecords.length})`}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Live from SQLite · PII Masked</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading intake vault...</div>
          ) : filteredRecords.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              {intakeRecords.length === 0
                ? 'No records yet. Use "Fetch Signals" to crawl data, then "Run AI Analysis".'
                : `No records match "${searchInput}". Try a different drug name.`}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Content (PII Masked)</th>
                  <th>Platform</th>
                  <th>Drug / Event</th>
                  <th>Sentiment</th>
                  <th>Emotion</th>
                  <th>FDA Match</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(p => {
                  const rawContent  = p.content || ''
                  const safeContent = frontendSanitize(rawContent)
                  const hasMasked   = hasPiiTokens(safeContent) || p.pii_masked

                  const sentiment = p.sentiment || 'Unknown'
                  // Use backend emotion directly; fall back to keyword categorizer on masked text
                  const backendEmotion = p.emotion || ''
                  const emotion = backendEmotion ||
                    (sentiment === 'Negative' ? categorizeEmotion(safeContent) : '')

                  const sentBadge = sentiment === 'Positive' ? 'success'
                    : sentiment === 'Neutral'  ? 'warning'
                    : sentiment === 'Negative' ? 'danger'
                    : 'neutral'

                  // Status: prefer p.status, fall back to has_analysis
                  const statusLabel = p.status === 'analyzed' ? 'Analyzed'
                    : p.status === 'failed' ? 'Failed'
                    : p.has_analysis ? 'Analyzed'
                    : 'Pending'
                  const statusBadge = statusLabel === 'Analyzed' ? 'success'
                    : statusLabel === 'Failed' ? 'danger' : 'warning'

                  // Drug: prefer joined intelligence drug, fall back to drug_keyword
                  const drugDisplay = p.drug && p.drug !== 'Unknown' ? p.drug : (p.drug_keyword || '—')
                  const eventDisplay = p.event && p.event !== 'Unknown' ? p.event : ''

                  return (
                    <tr key={p.id}>
                      <td><strong>INT-{String(p.id).padStart(3, '0')}</strong></td>
                      <td style={{ maxWidth: 280, lineHeight: 1.5 }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <span title={safeContent} style={{ fontSize:13 }}>{safeContent}</span>
                          {hasMasked && <PiiMaskedBadge />}
                        </div>
                      </td>
                      <td><span className="badge badge-neutral">{(p.platform || 'Unknown').split('(')[0].trim()}</span></td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13 }}>{drugDisplay}</div>
                        {eventDisplay && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{eventDisplay}</div>}
                      </td>
                      <td>
                        <span className={`badge badge-${sentBadge}`}>{sentiment}</span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text2)' }}>
                        {emotion
                          ? <span style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>{emotion}</span>
                          : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      {/* ── FDA Match cell — canonical getFDAStatus ── */}
                      <td>
                        {(() => {
                          const effectiveFda  = fdaResults[p.id] || p.fdaAnalysis
                          const isLoadingThis = fdaLoading === p.id

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
                              onClick={() => handleOpenFdaModal(p)}
                              title={effectiveFda ? 'View FDA evidence' : 'Click to run FDA analysis'}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                                background: bg, color, border: `1px solid ${border}`,
                                cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              <MdScience size={10} /> {label}
                            </button>
                          )
                        })()}
                      </td>
                      {/* ── FDA Risk cell — only shown for real matches ── */}
                      <td>
                        {(() => {
                          const effectiveFda = fdaResults[p.id] || p.fdaAnalysis
                          const status = getFDAStatus(effectiveFda)
                          // Never show a risk pill for insufficient_data or non-matches
                          if (status !== FDA_STATUS.MATCH_FOUND || !effectiveFda?.riskLevel) {
                            return <span style={{ fontSize: 10, color: 'var(--muted)' }}>—</span>
                          }
                          const rc = effectiveFda.riskLevel === 'high' ? '#EF4444'
                            : effectiveFda.riskLevel === 'moderate' ? '#F59E0B' : '#10B981'
                          return (
                            <span
                              onClick={() => handleOpenFdaModal(p)}
                              style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                                background: `${rc}18`, color: rc, border: `1px solid ${rc}40`,
                                cursor: 'pointer', display: 'inline-block',
                              }}
                            >
                              {effectiveFda.riskLevel.toUpperCase()}
                            </span>
                          )
                        })()}
                      </td>
                      <td>
                        <span className={`badge badge-${statusBadge}`}>
                          {statusLabel === 'Analyzed' ? '✓ Analyzed' : statusLabel === 'Failed' ? '✕ Failed' : '⏳ Pending'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── FDA EVIDENCE MODAL — rendered via portal to escape stacking context ── */}
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
              {/* Header */}
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
                    INT-{String(fdaModal.record.id).padStart(3, '0')}
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
              {/* Body */}
              <div style={{ padding: '20px' }}>
                <FDAEvidenceModal
                  fda={fdaModal.fda}
                  recordId={fdaModal.record.id}
                  recordType="intake"
                  drug={fdaModal.record.drug || fdaModal.record.drug_keyword}
                  event={fdaModal.record.event}
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