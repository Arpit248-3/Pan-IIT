import { useState, useEffect, useCallback, useRef } from 'react'
import { MdDownload, MdRefresh, MdVisibility, MdScience } from 'react-icons/md'

import { API_BASE } from '../config'
import { useDataRefresh } from '../utils/dataEvents'
import useAyuStore from '../store/useAyuStore'
import FDAEvidenceModalShared from '../components/FDAEvidenceModal'
import {
  getFDAStatus, getFDALabel, getFDABadgeStyle, getFDAReportLabel,
  FDA_STATUS,
} from '../utils/fdaStatus'

const sevColors = { Critical: 'danger', High: 'warning', Medium: 'info', Low: 'neutral' }

// ── Frontend PII safety net (email/phone/Aadhaar/PAN only) ──────────────────
const _RX = [
  [/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]'],
  [/\b[6-9]\d{9}\b/g, '[PHONE]'],
  [/(?<!\d)(?:\+?1[\s\-.])?(?:\d{3})?[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)/g, '[PHONE]'],
  [/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, '[AADHAAR]'],
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[PAN]'],
]
function reportSanitize(text = '') {
  if (!text || typeof text !== 'string') return text
  let out = text
  for (const [rx, rep] of _RX) out = out.replace(rx, rep)
  return out
}

// ── FDA label filter options (must match getFDAReportLabel output) ───────────
const FDA_FILTER_OPTIONS = [
  'All FDA',
  'FDA Match Found',
  'No FDA Match',
  'Insufficient Data',
  'Not Applicable',
  'FDA Unavailable',
  'Pending',
]

export default function Reports({ openModal }) {
  const [exporting,     setExporting]     = useState(null)
  const [typeFilter,    setTypeFilter]    = useState('All Types')
  const [statusFilter,  setStatusFilter]  = useState('All Status')
  const [fdaFilter,     setFdaFilter]     = useState('All FDA')

  // ── Zustand store ─────────────────────────────────────────────────────────
  const reports       = useAyuStore(s => s.reports)
  const vaultLoading  = useAyuStore(s => s.vaultLoading)
  const refreshReports = useAyuStore(s => s.refreshReports)
  const loading = vaultLoading && reports.length === 0

  // ── Local FDA overrides (on-demand fetches not yet persisted to store) ────
  const [fdaLoading,  setFdaLoading]  = useState(null)   // record_id being fetched
  const [fdaResults,  setFdaResults]  = useState({})     // { [record_id]: fdaAnalysis }
  const [backfilling, setBackfilling] = useState(false)  // auto-backfill in progress
  const backfillRanRef = useRef(false)                   // run once per mount

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const store = useAyuStore.getState()
    if (store.reports.length === 0) store.refreshReports()
  }, [])
  useDataRefresh(refreshReports)

  // ── Auto-backfill: trigger FDA analysis for Pending rows on first load ────
  // Runs once after reports arrive. Throttled — max 5 concurrent via batch.
  useEffect(() => {
    if (backfillRanRef.current) return
    if (reports.length === 0) return
    backfillRanRef.current = true

    const pendingIds = reports
      .filter(r => {
        const effectiveFda = fdaResults[r.record_id] || r.fdaAnalysis
        return !effectiveFda && r.drug && r.drug !== 'Unknown'
      })
      .slice(0, 10)  // cap at 10 per load to avoid hammering openFDA
      .map(r => r.record_id)

    if (pendingIds.length === 0) return

    setBackfilling(true)
    fetch(`${API_BASE}/api/fda/analyze-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record_ids: pendingIds, record_type: 'intelligence' }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.results) {
          const updates = {}
          data.results.forEach(r => {
            if (r.fdaAnalysis) updates[r.record_id] = r.fdaAnalysis
          })
          if (Object.keys(updates).length > 0) {
            setFdaResults(prev => ({ ...prev, ...updates }))
          }
        }
      })
      .catch(() => {})
      .finally(() => setBackfilling(false))
  }, [reports])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── E2B Export ────────────────────────────────────────────────────────────
  const handleExportE2B = async (report, format = 'r3') => {
    setExporting(report.record_id)
    const endpoint = format === 'r2'
      ? `${API_BASE}/api/export-e2b-r2/${report.record_id}`
      : `${API_BASE}/api/export-e2b/${report.record_id}`
    const fmtLabel = format === 'r2' ? 'R2' : 'R3'
    try {
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error((await res.text()) || 'Export failed')
      const blob = await res.blob()
      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `E2B_${fmtLabel}_ICSR_${report.record_id}_${report.drug || 'unknown'}.xml`
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      openModal({
        title: 'Export Failed',
        children: (
          <div style={{ color: 'var(--danger)', fontSize: 14 }}>
            Failed to export E2B {fmtLabel} XML.<br /><br />
            <small style={{ color: 'var(--muted)' }}>Error: {err.message}</small>
          </div>
        ),
        footer: <button className="btn btn-primary" onClick={() => openModal(null)}>OK</button>,
      })
    } finally {
      setExporting(null)
    }
  }

  // ── Open FDA Evidence Modal ───────────────────────────────────────────────
  // Always uses the exact record_id — never shares FDA result across rows.
  const handleViewFDA = useCallback(async (r) => {
    const effectiveFda = fdaResults[r.record_id] || r.fdaAnalysis

    const showModal = (fda) => openModal({
      title: `FDA Evidence — ${r.id}`,
      children: (
        <FDAEvidenceModalShared
          fda={fda}
          recordId={r.record_id}
          recordType="intelligence"
          drug={r.drug}
          event={r.event}
          onClose={() => openModal(null)}
          onRefresh={(id, newFda) => {
            setFdaResults(prev => ({ ...prev, [id]: newFda }))
          }}
        />
      ),
      footer: <button className="btn btn-ghost" onClick={() => openModal(null)}>Close</button>,
    })

    // If we already have data (cached or persisted), show immediately
    if (effectiveFda) { showModal(effectiveFda); return }

    // Otherwise fetch on-demand from backend (record-specific endpoint)
    setFdaLoading(r.record_id)
    let fda = null
    try {
      const res  = await fetch(`${API_BASE}/api/fda/analyze-record/${r.record_id}`, { method: 'POST' })
      const data = await res.json()
      fda = data.fdaAnalysis || null
      setFdaResults(prev => ({ ...prev, [r.record_id]: fda }))
    } catch { /* fda stays null — modal will show pending/error state */ }
    finally { setFdaLoading(null) }

    showModal(fda)
  }, [fdaResults, openModal])

  // ── View Details modal ───────────────────────────────────────────────────
  const handleViewReport = (r) => {
    const effectiveFda = fdaResults[r.record_id] || r.fdaAnalysis
    const fdaStatus    = getFDAStatus(effectiveFda)

    openModal({
      title: `Report: ${r.id}`,
      children: (
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
            <div><strong>ID:</strong> {r.id}</div>
            <div><strong>Type:</strong> {r.type}</div>
            <div><strong>Drug:</strong> {r.drug}</div>
            <div><strong>Adverse Event:</strong> {r.event}</div>
            <div><strong>Causality:</strong>
              <span className={`badge badge-${sevColors[r.severity] || 'neutral'}`} style={{ marginLeft: 6 }}>{r.causality}</span>
            </div>
            <div><strong>Severity:</strong>
              <span className={`badge badge-${sevColors[r.severity] || 'neutral'}`} style={{ marginLeft: 6 }}>{r.severity}</span>
            </div>
            <div><strong>Status:</strong>
              <span className={`badge badge-${r.statusColor || 'neutral'}`} style={{ marginLeft: 6 }}>{r.status}</span>
            </div>
            <div><strong>Author:</strong> {r.author}</div>
          </div>
          {r.created_at && (
            <div style={{ marginTop: 12, color: 'var(--muted)', fontSize: 12 }}>
              Created: {new Date(r.created_at).toLocaleString()}
            </div>
          )}
          {/* FDA quick summary — canonical status */}
          {effectiveFda && fdaStatus !== FDA_STATUS.PENDING && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8,
              background: fdaStatus === FDA_STATUS.MATCH_FOUND ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.05)',
              border: `1px solid ${fdaStatus === FDA_STATUS.MATCH_FOUND ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.15)'}`,
              fontSize: 12 }}>
              <strong>🏛️ FDA Evidence:</strong>{' '}
              <span style={{ color: 'var(--text2)' }}>
                {effectiveFda.summary || getFDAReportLabel(effectiveFda)}
              </span>
            </div>
          )}
          <div style={{ marginTop: 16, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
            <strong style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' }}>Export Formats</strong>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => { openModal(null); handleExportE2B(r, 'r3') }}>
                <MdDownload size={14} /> E2B (R3) XML — Modern
              </button>
              <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)' }}
                onClick={() => { openModal(null); handleExportE2B(r, 'r2') }}>
                <MdDownload size={14} /> E2B (R2) XML — Legacy
              </button>
            </div>
          </div>
        </div>
      ),
      footer: <button className="btn btn-ghost" onClick={() => openModal(null)}>Close</button>,
    })
  }

  // ── Generate Report ───────────────────────────────────────────────────────
  const handleGenerateReport = () => {
    let reportType = 'Signal Analysis'
    let project    = 'All Projects'
    let notes      = ''

    const handleSubmit = () => {
      const now     = new Date().toISOString()
      const content = [
        '='.repeat(60),
        `  AyuScout V2 — ${reportType} Report`,
        `  Project: ${project}`,
        `  Generated: ${now}`,
        '='.repeat(60),
        '',
        `Report Type    : ${reportType}`,
        `Project        : ${project}`,
        `Total Reports  : ${reports.length}`,
        `Notes          : ${notes || 'None'}`,
        '',
        '--- SIGNAL BREAKDOWN ---',
        ...reports.slice(0, 10).map(r => {
          const effectiveFda = fdaResults[r.record_id] || r.fdaAnalysis
          const fdaLbl = getFDAReportLabel(effectiveFda)
          return `${r.id}  ${(r.drug || '').padEnd(20)} ${(r.event || '').padEnd(20)} ` +
                 `${(r.causality || '').padEnd(15)} ${r.severity}  [FDA: ${fdaLbl}]`
        }),
        '',
        '='.repeat(60),
        '  Powered by AyuScout V2 | Requires human review before submission',
        '='.repeat(60),
      ].join('\n')

      const blob = new Blob([content], { type: 'text/plain' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `AyuScout_${reportType.replace(/\s+/g, '_')}_${Date.now()}.txt`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      openModal(null)
    }

    openModal({
      title: 'Generate Report',
      children: (
        <>
          <div className="form-group">
            <label className="form-label">Report Type</label>
            <select className="form-input" onChange={e => reportType = e.target.value}>
              <option>Signal Analysis</option>
              <option>Sentiment Summary</option>
              <option>Safety Overview</option>
              <option>WHO-UMC Causality Report</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Project</label>
            <select className="form-input" onChange={e => project = e.target.value}>
              <option>All Projects</option>
              <option>Diabetes Monitoring</option>
              <option>Cardio Safety</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Date Range</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" type="date" />
              <input className="form-input" type="date" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={3} onChange={e => notes = e.target.value}
              placeholder="Optional notes for the report..." />
          </div>
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 10, fontSize: 12, color: 'var(--text2)' }}>
            Report will include {reports.length} signals from the Intelligence Vault.
          </div>
        </>
      ),
      footer: (
        <>
          <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={handleSubmit}>
            <MdDownload size={15} /> Generate &amp; Download
          </button>
        </>
      ),
    })
  }

  // ── Filtering — uses canonical getFDAReportLabel for the FDA column ────────
  const filtered = reports.filter(r => {
    if (typeFilter   !== 'All Types'  && r.type   !== typeFilter)   return false
    if (statusFilter !== 'All Status' && r.status !== statusFilter) return false
    if (fdaFilter    !== 'All FDA') {
      const effectiveFda = fdaResults[r.record_id] || r.fdaAnalysis
      const label = getFDAReportLabel(effectiveFda)
      if (label !== fdaFilter) return false
    }
    return true
  })

  return (
    <>
      {/* ── Filter + action bar ─────────────────────────────────── */}
      <div className="filter-bar">
        <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option>All Types</option>
          <option>Signal</option>
          <option>Analytics</option>
        </select>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option>All Status</option>
          <option>Flagged</option>
          <option>Reviewed</option>
        </select>
        <select className="filter-select" value={fdaFilter} onChange={e => setFdaFilter(e.target.value)}>
          {FDA_FILTER_OPTIONS.map(o => <option key={o}>{o}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={refreshReports} disabled={loading}>
          <MdRefresh size={16} className={loading || backfilling ? 'spin' : ''} />
          {backfilling ? 'Analyzing FDA…' : loading ? 'Loading…' : 'Refresh'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleGenerateReport}>Generate Report</button>
      </div>

      {/* ── Backfill banner ──────────────────────────────────────── */}
      {backfilling && (
        <div style={{
          marginBottom: 12, padding: '8px 14px', borderRadius: 8, fontSize: 12,
          background: 'rgba(59,130,246,.07)', border: '1px solid rgba(59,130,246,.2)',
          color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <MdScience size={14} className="spin" />
          Running FDA analysis on pending records… status will update automatically.
        </div>
      )}

      {/* ── Reports table ────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Reports</span>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>
            {filtered.length} of {reports.length} reports from Intelligence Vault
          </span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              Loading reports from backend…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              No reports yet. Run AI analysis to generate records.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Causality</th>
                  <th>Severity</th>
                  <th>FDA Analysis</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  // Always derive FDA status from the canonical function
                  const effectiveFda = fdaResults[r.record_id] || r.fdaAnalysis
                  const fdaStatus    = getFDAStatus(effectiveFda)
                  const fdaLabel     = getFDALabel(fdaStatus)
                  const { bg, color, border } = getFDABadgeStyle(fdaStatus)
                  const isLoading    = fdaLoading === r.record_id

                  return (
                    <tr key={r.id}>
                      <td><strong>{r.id}</strong></td>
                      <td style={{ maxWidth: 220 }}>{reportSanitize(r.title)}</td>
                      <td><span className="badge badge-neutral">{r.type}</span></td>
                      <td>
                        <span className={`badge badge-${sevColors[r.severity] || 'neutral'}`}>
                          {r.causality}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${sevColors[r.severity] || 'neutral'}`}>
                          {r.severity}
                        </span>
                      </td>

                      {/* ── FDA Analysis column — canonical getFDAStatus ── */}
                      <td>
                        <button
                          onClick={() => handleViewFDA(r)}
                          disabled={isLoading}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                            cursor: isLoading ? 'wait' : 'pointer',
                            border: `1px solid ${border}`,
                            background: bg, color,
                            whiteSpace: 'nowrap',
                            opacity: isLoading ? 0.65 : 1,
                          }}
                          title={effectiveFda ? 'View FDA evidence' : 'Click to run FDA analysis'}
                        >
                          <MdScience size={12} className={isLoading ? 'spin' : ''} />
                          {isLoading ? 'Analyzing…' : fdaLabel}
                        </button>
                      </td>

                      <td>
                        <span className={`badge badge-${r.statusColor || 'neutral'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => handleExportE2B(r, 'r3')}
                          disabled={exporting === r.record_id}
                          title="Export E2B (R3) XML"
                          style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                          {exporting === r.record_id ? '⏳' : <><MdDownload size={14} /><span>R3</span></>}
                        </button>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => handleExportE2B(r, 'r2')}
                          disabled={exporting === r.record_id}
                          title="Export E2B (R2) XML"
                          style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text2)' }}>
                          {exporting === r.record_id ? '' : <><MdDownload size={14} /><span>R2</span></>}
                        </button>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => handleViewReport(r)}
                          title="View Details"
                          style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                          <MdVisibility size={14} />
                        </button>
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
