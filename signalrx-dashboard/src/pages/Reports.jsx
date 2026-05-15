import { useState, useEffect } from 'react'
import { MdDownload, MdRefresh, MdVisibility, MdClose } from 'react-icons/md'

import { API_BASE } from '../config';

const sevColors = { Critical: 'danger', High: 'warning', Medium: 'info', Low: 'neutral' }

// ── Frontend PII safety net for Reports (email/phone/Aadhaar/PAN only) ──
// Per security req §3: does NOT aggressively mask names.
const _REPORTS_FE_RX = [
  [/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]'],
  [/\b[6-9]\d{9}\b/g, '[PHONE]'],
  [/(?<!\d)(?:\+?1[\s\-.])?\(?\d{3}\)?[\s\-.]\d{3}[\s\-.]\d{4}(?!\d)/g, '[PHONE]'],
  [/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, '[AADHAAR]'],
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[PAN]'],
]
function reportSanitize(text = '') {
  if (!text || typeof text !== 'string') return text
  let out = text
  for (const [rx, rep] of _REPORTS_FE_RX) out = out.replace(rx, rep)
  return out
}

export default function Reports({ openModal }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(null)
  const [typeFilter, setTypeFilter] = useState('All Types')
  const [statusFilter, setStatusFilter] = useState('All Status')

  const fetchReports = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/reports`)
      const data = await res.json()
      if (data.status === 'success') setReports(data.reports || [])
    } catch (err) {
      console.error('Failed to fetch reports:', err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchReports() }, [])

  // ── E2B R3 Export ─────────────────────────────────────────────
  const handleExportE2B = async (report, format = 'r3') => {
    setExporting(report.record_id)
    const endpoint = format === 'r2'
      ? `${API_BASE}/api/export-e2b-r2/${report.record_id}`
      : `${API_BASE}/api/export-e2b/${report.record_id}`
    const fmtLabel = format === 'r2' ? 'R2' : 'R3'
    try {
      const res = await fetch(endpoint)
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || 'Export failed')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `E2B_${fmtLabel}_ICSR_${report.record_id}_${report.drug || 'unknown'}.xml`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('E2B export failed:', err)
      openModal({
        title: 'Export Failed',
        children: <div style={{ color: 'var(--danger)', fontSize: 14 }}>
          Failed to export E2B {fmtLabel} XML. Make sure the backend is running.<br /><br />
          <small style={{ color: 'var(--muted)' }}>Error: {err.message}</small>
        </div>,
        footer: <button className="btn btn-primary" onClick={() => openModal(null)}>OK</button>
      })
    } finally {
      setExporting(null)
    }
  }

  // ── View Details ─────────────────────────────────────────────
  const handleViewReport = (r) => {
    openModal({
      title: `Report: ${r.id}`,
      children: (
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
            <div><strong>ID:</strong> {r.id}</div>
            <div><strong>Type:</strong> {r.type}</div>
            <div><strong>Drug:</strong> {r.drug}</div>
            <div><strong>Adverse Event:</strong> {r.event}</div>
            <div><strong>WHO-UMC Causality:</strong>
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
      footer: <button className="btn btn-ghost" onClick={() => openModal(null)}>Close</button>
    })
  }

  // ── Generate Report Modal ────────────────────────────────────
  const handleGenerateReport = () => {
    let reportType = 'Signal Analysis'
    let project = 'Diabetes Monitoring'
    let notes = ''

    const handleSubmit = () => {
      // Generate and download a summary report
      const now = new Date().toISOString()
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
        ...reports.slice(0, 10).map(r =>
          `${r.id}  ${r.drug.padEnd(20)} ${r.event.padEnd(20)} ${r.causality.padEnd(15)} ${r.severity}`
        ),
        '',
        '='.repeat(60),
        '  Powered by AyuScout V2 | Requires human review before submission',
        '='.repeat(60),
      ].join('\n')

      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `AyuScout_${reportType.replace(/\s+/g, '_')}_${Date.now()}.txt`
      document.body.appendChild(a)
      a.click()
      a.remove()
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
              <option>Diabetes Monitoring</option>
              <option>Cardio Safety</option>
              <option>All Projects</option>
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
            <textarea className="form-input" rows={3} onChange={e => notes = e.target.value} placeholder="Optional notes for the report..." />
          </div>
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 10, fontSize: 12, color: 'var(--text2)' }}>
            📊 Report will include {reports.length} signals from the Intelligence Vault.
          </div>
        </>
      ),
      footer: (
        <>
          <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={handleSubmit}>
            <MdDownload size={15} /> Generate & Download
          </button>
        </>
      )
    })
  }

  // ── Filtered reports ─────────────────────────────────────────
  const filtered = reports.filter(r => {
    if (typeFilter !== 'All Types' && r.type !== typeFilter) return false
    if (statusFilter !== 'All Status' && r.status !== statusFilter) return false
    return true
  })

  return (
    <>
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
        <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={fetchReports} disabled={loading}>
          <MdRefresh size={16} className={loading ? 'spin' : ''} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleGenerateReport}>Generate Report</button>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Reports</span>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{filtered.length} of {reports.length} reports from Intelligence Vault</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading reports from backend...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              No reports yet. Run AI analysis or seed the database first.
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
                  <th>Status</th>
                  <th>Author</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.id}</strong></td>
                    <td style={{ maxWidth: 240 }}>{reportSanitize(r.title)}</td>
                    <td><span className="badge badge-neutral">{r.type}</span></td>
                    <td><span className={`badge badge-${sevColors[r.severity] || 'neutral'}`}>{r.causality}</span></td>
                    <td><span className={`badge badge-${sevColors[r.severity] || 'neutral'}`}>{r.severity}</span></td>
                    <td><span className={`badge badge-${r.statusColor || 'neutral'}`}>{r.status}</span></td>
                    <td>{r.author}</td>
                    <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {/* Download E2B R3 */}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleExportE2B(r, 'r3')}
                        disabled={exporting === r.record_id}
                        title="Export E2B (R3) XML — Modern format"
                        style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}
                      >
                        {exporting === r.record_id ? '⏳' : <><MdDownload size={14} /><span>R3</span></>}
                      </button>
                      {/* Download E2B R2 */}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleExportE2B(r, 'r2')}
                        disabled={exporting === r.record_id}
                        title="Export E2B (R2) XML — Legacy/SGML format"
                        style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text2)' }}
                      >
                        {exporting === r.record_id ? '' : <><MdDownload size={14} /><span>R2</span></>}
                      </button>
                      {/* View Details */}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleViewReport(r)}
                        title="View Details"
                        style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}
                      >
                        <MdVisibility size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
