import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { MdRefresh, MdSearch, MdClose, MdScience, MdDataset } from 'react-icons/md'

import { API_BASE } from '../config';


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
  // ── State ──────────────────────────────────────────────────
  const [keyword, setKeyword]           = useState('')
  const [searchInput, setSearchInput]   = useState('')
  const [isScouting, setIsScouting]     = useState(false)
  const [isAnalyzing, setIsAnalyzing]   = useState(false)
  const [intakeRecords, setIntakeRecords] = useState([])
  const [loading, setLoading]           = useState(true)
  const [sourceFilter, setSourceFilter] = useState('All')
  const [sentFilter, setSentFilter]     = useState('All')

  // ── Fetch intake vault (drug_keyword + sentiment from backend) ──
  const fetchIntake = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/intake-vault`)
      const data = await res.json()
      if (data.status === 'success') {
        setIntakeRecords(data.records || [])
      }
    } catch (err) {
      console.error('Failed to fetch intake vault:', err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchIntake() }, [])

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
      setTimeout(fetchIntake, 2000)
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
      const res = await fetch(`${API_BASE}/api/process-vault`)
      const data = await res.json()
      alert(`AI Intelligence Success: Processed ${data.total_processed} new safety signals.`)
      fetchIntake()
    } catch {
      alert('Analysis failed. Check your Python terminal for agent logs.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ── Filtering logic ────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    let list = intakeRecords
    // Drug search filter
    if (searchInput.trim()) {
      const q = searchInput.trim().toLowerCase()
      list = list.filter(r =>
        (r.drug_keyword || '').toLowerCase().includes(q) ||
        (r.content || '').toLowerCase().includes(q)
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

  // ── Chart 2: Emotion line chart — emotion category → user count ─
  const emotionLineData = useMemo(() => {
    const negativeRecords = filteredRecords.filter(r => r.sentiment === 'Negative')
    const counts = {}
    negativeRecords.forEach(r => {
      const emo = categorizeEmotion(r.content || '')
      counts[emo] = (counts[emo] || 0) + 1
    })
    // Use fixed order so the line is always continuous and meaningful
    return ALL_EMOTIONS.map(emo => ({
      emotion: emo.split(' / ')[0], // Short label for X-axis
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

        <button className="btn btn-ghost btn-sm" onClick={fetchIntake} disabled={loading}
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
                  <th>Drug</th>
                  <th>Sentiment</th>
                  <th>Emotion</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(p => {
                  const sentiment = p.sentiment || 'Unknown'
                  const emotion = sentiment === 'Negative' ? categorizeEmotion(p.content || '') : '—'
                  const sentBadge = sentiment === 'Positive' ? 'success'
                    : sentiment === 'Neutral' ? 'warning'
                    : sentiment === 'Negative' ? 'danger'
                    : 'neutral'
                  return (
                    <tr key={p.id}>
                      <td><strong>INT-{String(p.id).padStart(3, '0')}</strong></td>
                      <td style={{ maxWidth: 280, lineHeight: 1.4 }}>
                        <span title={p.content}>{p.content}</span>
                      </td>
                      <td><span className="badge badge-neutral">{(p.platform || 'Unknown').split('(')[0].trim()}</span></td>
                      <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{p.drug_keyword || '—'}</td>
                      <td>
                        <span className={`badge badge-${sentBadge}`}>{sentiment}</span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text2)' }}>
                        {emotion !== '—'
                          ? <span style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>{emotion}</span>
                          : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td>
                        <span className={`badge badge-${p.has_analysis ? 'success' : 'warning'}`}>
                          {p.has_analysis ? '✓ Analyzed' : '⏳ Pending'}
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
    </>
  )
}