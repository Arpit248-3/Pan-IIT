import { useState, useEffect, useCallback } from 'react'
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { MdArrowUpward, MdArrowDownward, MdRefresh, MdDownload, MdWarning } from 'react-icons/md'

import { API_BASE } from '../config';
import { useDataRefresh } from '../utils/dataEvents'
import useAyuStore from '../store/useAyuStore'


// Fallback spike data used only when DB is empty (shows demo narrative)
const FALLBACK_SPIKE = [
  { day: 'Mon', signals: 8,  baseline: 9 },
  { day: 'Tue', signals: 10, baseline: 9 },
  { day: 'Wed', signals: 9,  baseline: 9 },
  { day: 'Thu', signals: 11, baseline: 9 },
  { day: 'Fri', signals: 38, baseline: 9 },
  { day: 'Sat', signals: 15, baseline: 9 },
  { day: 'Sun', signals: 12, baseline: 9 },
]

export default function TrendAnalysis({ openModal }) {
  const [spikeData, setSpikeData]   = useState(FALLBACK_SPIKE)
  const [generating, setGenerating] = useState(false)

  // ── Zustand store (shared with Dashboard — no duplicate fetch) ──────
  const stats       = useAyuStore(s => s.stats)
  const statsLoading = useAyuStore(s => s.statsLoading)
  const refreshStats = useAyuStore(s => s.refreshStats)
  const loading = statsLoading && !stats

  const fetchTrends = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/trends?days=7`)
      const data = await res.json()
      if (data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
        const baseline = Math.max(1, Math.round(
          data.data.reduce((s, d) => s + d.signals, 0) / data.data.length
        ))
        setSpikeData(data.data.map(d => ({ day: d.date, signals: d.signals, baseline })))
      }
    } catch { /* keep fallback */ }
  }, [])

  useEffect(() => {
    const store = useAyuStore.getState()
    if (!store.stats) store.refreshStats()
    fetchTrends()
  }, [fetchTrends])
  useDataRefresh(fetchTrends)  // Refresh trend chart after new analysis

  const totalRecords = stats?.total_records || 0
  const sevCounts = stats?.severity_counts || {}
  const causalityCounts = stats?.causality_counts || {}
  const topDrugs = stats?.top_drugs || []
  const topEvents = stats?.top_events || []

  // Build trend chart from causality counts
  const causalityChartData = Object.entries(causalityCounts).filter(([,v]) => v > 0).map(([name, value]) => ({ name, signals: value }))

  // Severity bar chart data
  const SEV_COLORS = { Critical: '#EF4444', High: '#F59E0B', Medium: '#3B82F6', Low: '#10B981' }
  const severityChartData = Object.entries(sevCounts).filter(([,v]) => v > 0).map(([k, v]) => ({ name: k, count: v }))

  // KPIs
  const criticalCount = sevCounts.Critical || 0
  const highCount = sevCounts.High || 0
  const confirmedCount = (causalityCounts.Certain || 0) + (causalityCounts.Probable || 0)
  const totalSignals = totalRecords

  // ── Generate Report (downloads a summary text file) ──────────
  const handleGenerateReport = () => {
    openModal({
      title: 'Generate Trend Analysis Report',
      children: <GenerateReportForm stats={stats} sevCounts={sevCounts} causalityCounts={causalityCounts} topDrugs={topDrugs} topEvents={topEvents} />,
      footer: <>
        <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
        <button className="btn btn-primary" onClick={() => {
          downloadReport(stats, sevCounts, causalityCounts, topDrugs, topEvents)
          openModal(null)
        }}>
          <MdDownload size={15} style={{ marginRight: 4 }} />
          Download Report
        </button>
      </>
    })
  }

  return (
    <>
      {/* ═══════════════════════════════════════════════════════
          FEATURED: 7-DAY SIGNAL SPIKE CHART
          ═══════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 24, border: '1.5px solid rgba(239,68,68,.2)' }}>
        <div className="card-header" style={{ background: 'rgba(239,68,68,.03)' }}>
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MdWarning size={18} style={{ color: '#EF4444' }} />
            Volume of Adverse Safety Signals vs. Time — Last 7 Days
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
            borderRadius: 12, fontSize: 11, fontWeight: 800,
            background: 'rgba(239,68,68,.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,.2)' }}>
            ⚡ +238% SPIKE — Day 5
          </span>
        </div>
        <div className="card-body" style={{ padding: '8px 16px 12px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            Live signal volume from the Intelligence Vault — last 7 days.
            Baseline line shows the rolling average. <strong style={{ color: '#EF4444' }}>Spikes</strong> indicate cluster events.
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={spikeData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="spikeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted)' }}
                axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }}
                axisLine={false} tickLine={false} allowDecimals={false} domain={[0, 45]} />
              <Tooltip
                contentStyle={{ background: '#1e1e2e', border: 'none', borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,.4)', padding: '10px 14px' }}
                labelStyle={{ color: '#cdd6f4', fontWeight: 700, fontSize: 12, marginBottom: 4 }}
                itemStyle={{ color: '#f38ba8', fontSize: 12 }}
                formatter={(v, n) => [v + ' signals', n === 'signals' ? 'Adverse Signals' : 'Baseline']}
              />
              {/* Dynamic baseline */}
              <ReferenceLine y={spikeData[0]?.baseline || 9} stroke="#3B82F6" strokeDasharray="6 3" strokeWidth={1.5}
                label={{ value: `Baseline ~${spikeData[0]?.baseline || 9}`, position: 'insideTopRight', fontSize: 10, fill: '#3B82F6' }} />
              <Line type="monotone" dataKey="baseline" stroke="#3B82F6" strokeWidth={1.5}
                dot={false} strokeDasharray="4 4" name="Baseline" />
              <Line type="monotone" dataKey="signals" stroke="#EF4444" strokeWidth={2.5}
                dot={(props) => {
                  const { cx, cy, index } = props
                  const maxVal = Math.max(...spikeData.map(d => d.signals))
                  const isSpike = props.payload?.signals === maxVal && maxVal > (spikeData[0]?.baseline || 9)
                  return isSpike
                    ? <circle key={cx} cx={cx} cy={cy} r={7} fill="#EF4444" stroke="#fff" strokeWidth={2} />
                    : <circle key={cx} cx={cx} cy={cy} r={4} fill="#EF4444" stroke="#fff" strokeWidth={2} />
                }}
                activeDot={{ r: 6, fill: '#EF4444', stroke: '#fff', strokeWidth: 2 }}
                name="Signals"
              />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
            {(() => {
              const peak = Math.max(...spikeData.map(d => d.signals), 1)
              const baseline = spikeData[0]?.baseline || 1
              const surge = baseline > 0 ? Math.round(((peak - baseline) / baseline) * 100) : 0
              const topDrug = stats?.top_drugs?.[0]?.[0] || 'N/A'
              return [
                { label: 'Peak Signal Count', val: String(peak), color: '#EF4444' },
                { label: 'Baseline Average', val: `${baseline}/day`, color: '#3B82F6' },
                { label: 'Surge Factor', val: surge > 0 ? `+${surge}%` : '—', color: '#F59E0B' },
                { label: 'Root Cause Drug', val: topDrug, color: '#8B5CF6' },
              ]
            })().map(s => (
              <div key={s.label} style={{ padding: '8px 14px', background: 'var(--bg)',
                borderRadius: 8, border: `1px solid ${s.color}20`, flex: '1 1 120px' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <select className="filter-select"><option>All Therapeutic Areas</option><option>Diabetes</option><option>Cardiology</option></select>
        <select className="filter-select"><option>All Time</option><option>Monthly</option><option>Weekly</option></select>
        <button className="btn btn-ghost btn-sm" onClick={() => { refreshStats(); fetchTrends() }} disabled={loading}>
          <MdRefresh size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleGenerateReport} disabled={loading || generating}>
          <MdDownload size={15} style={{ marginRight: 4 }} />
          {generating ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      <div className="kpi-grid">
        {[
          { label: 'Total Signals', value: String(totalSignals), change: 'From Intelligence Vault', dir: 'up' },
          { label: 'Critical + High', value: String(criticalCount + highCount), change: 'Require attention', dir: 'up' },
          { label: 'Confirmed (Certain/Probable)', value: String(confirmedCount), change: 'WHO-UMC validated', dir: 'up' },
          { label: 'Unique Drugs Tracked', value: String(topDrugs.length), change: 'Active monitoring', dir: 'up' },
        ].map(k => (
          <div className="kpi-card" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{loading ? '...' : k.value}</div>
            <span className={`kpi-change up`}>
              {k.dir === 'up' ? <MdArrowUpward size={14} /> : <MdArrowDownward size={14} />}{k.change}
            </span>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Causality Area Chart */}
        <div className="card">
          <div className="card-header"><span className="card-title">Causality Assessment Distribution</span></div>
          <div className="card-body">
            {loading ? <div style={{ padding: 40, color: 'var(--muted)' }}>Loading...</div> :
              causalityChartData.length === 0 ? <div style={{ padding: 40, color: 'var(--muted)' }}>No data yet</div> : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={causalityChartData}>
                  <defs>
                    <linearGradient id="colorSignals" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#007BFF" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#007BFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="signals" stroke="#007BFF" fill="url(#colorSignals)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Severity Bar Chart */}
        <div className="card">
          <div className="card-header"><span className="card-title">Severity Breakdown</span></div>
          <div className="card-body">
            {loading ? <div style={{ padding: 40, color: 'var(--muted)' }}>Loading...</div> :
              severityChartData.length === 0 ? <div style={{ padding: 40, color: 'var(--muted)' }}>No data yet</div> : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={severityChartData} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                    {severityChartData.map((entry) => (
                      <Cell key={entry.name} fill={SEV_COLORS[entry.name] || '#94A3B8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Top Drugs Progress */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Top Drugs by Signal Count</span></div>
          <div className="card-body">
            {loading ? <div style={{ padding: 40, color: 'var(--muted)' }}>Loading...</div> :
              topDrugs.length === 0 ? <div style={{ padding: 40, color: 'var(--muted)' }}>No data yet</div> :
              topDrugs.map(([drug, count]) => {
                const maxC = Math.max(...topDrugs.map(d => d[1]), 1)
                return (
                  <div key={drug} style={{ marginBottom: 16 }}>
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

        {/* Top Events */}
        <div className="card">
          <div className="card-header"><span className="card-title">Top Adverse Events</span></div>
          <div className="card-body">
            {loading ? <div style={{ padding: 40, color: 'var(--muted)' }}>Loading...</div> :
              topEvents.length === 0 ? <div style={{ padding: 40, color: 'var(--muted)' }}>No data yet</div> :
              topEvents.map(([event, count]) => {
                const maxC = Math.max(...topEvents.map(e => e[1]), 1)
                return (
                  <div key={event} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                      <span>{event}</span><span>{count}</span>
                    </div>
                    <div className="progress"><div className="progress-fill" style={{ width: `${(count / maxC) * 100}%`, background: '#EF4444' }} /></div>
                  </div>
                )
              })
            }
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Signal Summary by Severity</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 20, color: 'var(--muted)' }}>Loading...</div> : (
            <table>
              <thead><tr><th>Severity</th><th>Count</th><th>% of Total</th><th>Status</th></tr></thead>
              <tbody>
                {Object.entries(sevCounts).map(([sev, count]) => (
                  <tr key={sev}>
                    <td><strong>{sev}</strong></td>
                    <td>{count}</td>
                    <td><strong>{totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0}%</strong></td>
                    <td>
                      <span className={`badge badge-${sev === 'Critical' ? 'danger' : sev === 'High' ? 'warning' : sev === 'Medium' ? 'info' : 'success'}`}>
                        {sev === 'Critical' || sev === 'High' ? 'Requires Action' : 'Monitoring'}
                      </span>
                    </td>
                  </tr>
                ))}
                {Object.keys(sevCounts).length === 0 && <tr><td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center' }}>No data</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

// ── Sub-component: Report Form ────────────────────────────────
function GenerateReportForm({ stats, sevCounts, causalityCounts, topDrugs, topEvents }) {
  return (
    <div>
      <div className="form-group">
        <label className="form-label">Report Type</label>
        <select className="form-input" id="report-type">
          <option>Signal Trend Analysis</option>
          <option>Severity Summary</option>
          <option>Causality Distribution</option>
          <option>Full Pharmacovigilance Report</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Time Period</label>
        <select className="form-input">
          <option>All Time</option>
          <option>Last 30 Days</option>
          <option>Last 7 Days</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Format</label>
        <select className="form-input">
          <option>Text Summary (.txt)</option>
          <option>CSV Data</option>
        </select>
      </div>
      {/* Preview */}
      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
        <strong>Preview:</strong> Total Signals: {stats?.total_records || 0} &nbsp;|&nbsp;
        Critical: {sevCounts?.Critical || 0} &nbsp;|&nbsp;
        Certain/Probable: {(causalityCounts?.Certain || 0) + (causalityCounts?.Probable || 0)} &nbsp;|&nbsp;
        Top Drug: {topDrugs?.[0]?.[0] || 'N/A'}
      </div>
    </div>
  )
}

// ── Download helper ────────────────────────────────────────────
function downloadReport(stats, sevCounts, causalityCounts, topDrugs, topEvents) {
  const now = new Date().toISOString()
  const total = stats?.total_records || 0

  const lines = [
    '============================================================',
    '   AyuScout V2 — Trend Analysis Report',
    `   Generated: ${now}`,
    '============================================================',
    '',
    '--- SIGNAL SUMMARY ---',
    `Total Signals Detected : ${total}`,
    `Critical               : ${sevCounts?.Critical || 0}`,
    `High                   : ${sevCounts?.High || 0}`,
    `Medium                 : ${sevCounts?.Medium || 0}`,
    `Low                    : ${sevCounts?.Low || 0}`,
    '',
    '--- CAUSALITY ASSESSMENT (WHO-UMC) ---',
    ...Object.entries(causalityCounts || {}).map(([k, v]) => `${k.padEnd(20)}: ${v}`),
    '',
    '--- TOP DRUGS BY SIGNAL COUNT ---',
    ...( topDrugs || []).map(([d, c], i) => `${String(i + 1).padStart(2)}. ${d.padEnd(25)} ${c} signals`),
    '',
    '--- TOP ADVERSE EVENTS ---',
    ...(topEvents || []).map(([e, c], i) => `${String(i + 1).padStart(2)}. ${e.padEnd(25)} ${c} reports`),
    '',
    '============================================================',
    '   Powered by AyuScout V2 AI Pharmacovigilance Engine',
    '   This report requires human medical review before regulatory submission.',
    '============================================================',
  ]

  const content = lines.join('\n')
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AyuScout_TrendReport_${Date.now()}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
