/**
 * FDAEvidenceModal — Canonical FDA Evidence Display Component
 * ============================================================
 * Used across: DataExplorer, Alerts, Reports
 *
 * Props:
 *   fda         — fdaAnalysis object (may be null/undefined)
 *   recordId    — integer ID of the source record
 *   recordType  — "intake" | "intelligence" | "report"
 *   drug        — optional drug display string (for title)
 *   event       — optional event display string (for title)
 *   onClose     — close handler
 *   onRefresh   — optional callback(recordId, newFdaAnalysis) after re-analyze
 *
 * STATUS RULES (enforced via getFDAStatus):
 *   insufficient_data → drug Unknown/missing — show info banner, NO match label
 *   match_found       → valid drug + real openFDA matchedSymptoms
 *   no_match          → valid drug + openFDA queried + no match
 *   not_applicable    → treatment pattern (took drug FOR symptom)
 *   unavailable       → API error / network failure
 *   pending           → not yet analyzed
 */

import { useState, useCallback } from 'react'
import {
  MdScience, MdRefresh, MdClose,
  MdWarning, MdCheckCircle, MdError,
  MdHourglassEmpty, MdInfoOutline,
} from 'react-icons/md'
import { API_BASE } from '../config'
import { getFDAStatus, FDA_STATUS } from '../utils/fdaStatus'

// ── Risk level → color ──────────────────────────────────────────────────────
function riskColor(level) {
  if (level === 'high')     return '#EF4444'
  if (level === 'moderate') return '#F59E0B'
  if (level === 'low')      return '#10B981'
  return '#94A3B8'
}

// ── Status banner — driven exclusively by getFDAStatus ──────────────────────
function StatusBanner({ status, fda }) {
  if (status === FDA_STATUS.PENDING) {
    return (
      <div style={bannerStyle('rgba(59,130,246,.08)', 'rgba(59,130,246,.2)')}>
        <MdHourglassEmpty size={16} style={{ color: '#3B82F6' }} />
        <span style={{ color: '#3B82F6', fontWeight: 600 }}>
          Not yet analyzed — click Re-Analyze to run openFDA check.
        </span>
      </div>
    )
  }

  if (status === FDA_STATUS.INSUFFICIENT_DATA) {
    return (
      <div style={bannerStyle('rgba(148,163,184,.08)', 'rgba(148,163,184,.2)')}>
        <MdInfoOutline size={16} style={{ color: '#94A3B8' }} />
        <span>
          <strong style={{ color: '#94A3B8' }}>Insufficient Data</strong>
          <span style={{ color: 'var(--text2)', marginLeft: 6 }}>
            FDA analysis could not run because no valid drug was detected.
            Drug must be a recognized pharmaceutical name.
          </span>
        </span>
      </div>
    )
  }

  if (status === FDA_STATUS.UNAVAILABLE) {
    return (
      <div style={bannerStyle('rgba(148,163,184,.08)', 'rgba(148,163,184,.2)')}>
        <MdError size={16} style={{ color: '#94A3B8' }} />
        <span>
          <strong style={{ color: '#94A3B8' }}>FDA Unavailable</strong>
          <span style={{ color: 'var(--muted)', marginLeft: 4 }}>
            {fda?.summary || 'Could not reach openFDA at this time.'}
          </span>
        </span>
      </div>
    )
  }

  if (status === FDA_STATUS.ERROR) {
    return (
      <div style={bannerStyle('rgba(239,68,68,.06)', 'rgba(239,68,68,.2)')}>
        <MdError size={16} style={{ color: '#EF4444' }} />
        <span>
          <strong style={{ color: '#EF4444' }}>FDA Error</strong>
          <span style={{ color: 'var(--text2)', marginLeft: 6 }}>
            {fda?.summary || 'An error occurred querying openFDA.'}
          </span>
        </span>
      </div>
    )
  }

  if (status === FDA_STATUS.NOT_APPLICABLE) {
    return (
      <div style={bannerStyle('rgba(16,185,129,.06)', 'rgba(16,185,129,.2)')}>
        <MdCheckCircle size={16} style={{ color: '#10B981' }} />
        <span>
          <strong style={{ color: '#10B981' }}>Not Applicable</strong>
          <span style={{ color: 'var(--text2)', marginLeft: 6 }}>
            {fda?.summary || 'Symptom is the reason for taking the drug, not a reaction to it.'}
          </span>
        </span>
      </div>
    )
  }

  if (status === FDA_STATUS.NO_MATCH) {
    return (
      <div style={bannerStyle('rgba(16,185,129,.06)', 'rgba(16,185,129,.2)')}>
        <MdCheckCircle size={16} style={{ color: '#10B981' }} />
        <span>
          <strong style={{ color: '#10B981' }}>No FDA Adverse Match</strong>
          <span style={{ color: 'var(--text2)', marginLeft: 6 }}>
            {fda?.summary || 'No adverse event match detected in openFDA database.'}
          </span>
        </span>
      </div>
    )
  }

  if (status === FDA_STATUS.MATCH_FOUND) {
    return (
      <div style={bannerStyle('rgba(239,68,68,.06)', 'rgba(239,68,68,.2)')}>
        <MdWarning size={16} style={{ color: '#EF4444' }} />
        <span>
          <strong style={{ color: '#EF4444' }}>FDA Match Found</strong>
          <span style={{ color: 'var(--text2)', marginLeft: 6 }}>{fda?.summary}</span>
        </span>
      </div>
    )
  }

  return null
}

function bannerStyle(bg, border) {
  return {
    display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16,
    padding: '10px 14px', borderRadius: 8, fontSize: 13,
    background: bg, border: `1px solid ${border}`,
  }
}

// ── Main component ──────────────────────────────────────────────────────────
export default function FDAEvidenceModal({
  fda,
  recordId,
  recordType = 'intelligence',
  drug,
  event,
  onClose,
  onRefresh,
}) {
  const [loading,  setLoading]  = useState(false)
  const [localFda, setLocalFda] = useState(fda)
  const [error,    setError]    = useState(null)

  // Derive status from canonical function — never hardcode status
  const status = getFDAStatus(localFda)

  // ── Re-analyze handler ────────────────────────────────────────────────────
  const handleReanalyze = useCallback(async () => {
    if (!recordId) return
    setLoading(true)
    setError(null)
    try {
      const endpoint = recordType === 'intake'
        ? `${API_BASE}/api/fda/analyze-intake/${recordId}`
        : `${API_BASE}/api/fda/analyze-record/${recordId}`

      const res  = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()

      if (data.fdaAnalysis) {
        setLocalFda(data.fdaAnalysis)
        if (onRefresh) onRefresh(recordId, data.fdaAnalysis)
      } else {
        setError(data.reason || data.message || 'Analysis returned no result.')
      }
    } catch (err) {
      setError(`Network error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [recordId, recordType, onRefresh])

  const displayFda = localFda

  // ── Detail rows — only shown when openFDA was actually queried ───────────
  // NEVER render detail rows for insufficient_data — no fake drug display
  const showDetailGrid = displayFda && status !== FDA_STATUS.PENDING && status !== FDA_STATUS.INSUFFICIENT_DATA

  const rows = showDetailGrid ? [
    {
      label: 'Detected Drug',
      value: displayFda.originalDrug || displayFda.drug || '—',
    },
    {
      label: 'Normalized Drug',
      value: displayFda.normalizedDrug || '—',
    },
    {
      label: 'Extracted Symptoms',
      value: (displayFda.extractedSymptoms || []).join(', ') || '—',
    },
    {
      label: 'Matched FDA Symptoms',
      value: (displayFda.matchedSymptoms || []).join(', ') || '—',
      highlight: (displayFda.matchedSymptoms || []).length > 0,
    },
    {
      label: 'Known FDA Reactions',
      value: (displayFda.knownReactions || []).slice(0, 10).join(', ') || '—',
      muted: true,
    },
    {
      label: 'Risk Level',
      value: (displayFda.riskLevel || 'unknown').toUpperCase(),
      color: riskColor(displayFda.riskLevel),
      bold: true,
    },
    {
      label: 'Confidence Boost',
      value: displayFda.confidenceBoost > 0 ? `+${displayFda.confidenceBoost}%` : 'None',
    },
    { label: 'Evidence Source',  value: displayFda.evidenceSource || 'openFDA' },
    { label: 'APIs Used',        value: (displayFda.sourceApis || []).join(', ') || '—' },
    { label: 'API Status',       value: displayFda.apiStatus || '—' },
    { label: 'Cache Hit',        value: displayFda.cacheHit ? 'Yes (cached)' : 'No' },
    {
      label: 'Last Checked',
      value: displayFda.lastCheckedAt
        ? new Date(displayFda.lastCheckedAt).toLocaleString()
        : '—',
    },
  ] : []

  // ── Insufficient data: show plain info grid (no openFDA data to display) ──
  const insufficientRows = status === FDA_STATUS.INSUFFICIENT_DATA ? [
    { label: 'Detected Drug',        value: displayFda?.originalDrug || displayFda?.drug || 'Unknown' },
    { label: 'Normalized Drug',       value: '—' },
    { label: 'Matched FDA Symptoms',  value: '—' },
    { label: 'Known FDA Reactions',   value: '—' },
    { label: 'Risk Level',            value: 'Unknown' },
  ] : []

  const allRows = showDetailGrid ? rows : insufficientRows

  return (
    <div style={{ fontSize: 13 }}>

      {/* ── Header: drug / event context ── */}
      {(drug || event) && (
        <div style={{
          marginBottom: 12, padding: '8px 12px', borderRadius: 6,
          background: 'rgba(59,130,246,.07)', border: '1px solid rgba(59,130,246,.15)',
          display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12,
        }}>
          {drug  && <span><strong style={{ color: 'var(--muted)' }}>Drug:</strong>{' '}<strong style={{ color: 'var(--blue)' }}>{drug}</strong></span>}
          {event && <span><strong style={{ color: 'var(--muted)' }}>Event:</strong>{' '}<span>{event}</span></span>}
          {recordId && <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>ID: {recordId}</span>}
        </div>
      )}

      {/* ── Status banner — canonical, never faked ── */}
      <StatusBanner status={status} fda={displayFda} />

      {/* ── Error display ── */}
      {error && (
        <div style={{
          marginBottom: 12, padding: '8px 12px', borderRadius: 6,
          background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.2)',
          color: '#EF4444', fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* ── Loading state ── */}
      {loading && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 6,
          background: 'rgba(59,130,246,.07)', border: '1px solid rgba(59,130,246,.2)',
          color: 'var(--blue)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <MdScience size={14} className="spin" />
          Querying openFDA APIs…
        </div>
      )}

      {/* ── Detail grid ── */}
      {allRows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '4px 0' }}>
          {allRows.map(({ label, value, highlight, color, muted, bold }) => (
            <div key={label} style={{ display: 'contents' }}>
              <div style={{
                padding: '5px 10px 5px 0', fontWeight: 700,
                color: 'var(--muted)', fontSize: 11,
                textTransform: 'uppercase', letterSpacing: '.04em',
                borderBottom: '1px solid var(--border)',
              }}>
                {label}
              </div>
              <div style={{
                padding: '5px 0',
                borderBottom: '1px solid var(--border)',
                color: highlight ? '#EF4444' : color || (muted ? 'var(--text2)' : 'var(--text)'),
                fontWeight: highlight || bold ? 700 : 400,
                wordBreak: 'break-word',
                fontSize: 12,
              }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Footer actions ── */}
      <div style={{
        marginTop: 18, paddingTop: 14,
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap',
      }}>
        {recordId && (
          <button
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={handleReanalyze}
            disabled={loading}
          >
            <MdRefresh size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Analyzing…' : 'Re-Analyze'}
          </button>
        )}
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  )
}
