/**
 * AyuScout V2 — Canonical FDA Status Utility
 * =============================================
 * Single source of truth for FDA badge/status logic.
 * Used in: Alerts, DataExplorer, Reports, FDAEvidenceModal.
 *
 * HARD RULES (from spec):
 *   - Drug is Unknown → insufficient_data (never match_found)
 *   - match_found requires: valid drug + valid event + openFDA queried + matchedSymptoms.length > 0
 *   - Treatment pattern (took drug FOR symptom) → not_applicable
 *   - API error → unavailable
 *   - No fdaAnalysis yet → pending
 */

/** All valid FDA status codes */
export const FDA_STATUS = {
  PENDING:           'pending',
  MATCH_FOUND:       'match_found',
  NO_MATCH:          'no_match',
  NOT_APPLICABLE:    'not_applicable',
  UNAVAILABLE:       'unavailable',
  INSUFFICIENT_DATA: 'insufficient_data',
  ERROR:             'error',
}

/**
 * Derive canonical FDA status from an fdaAnalysis object.
 * This is the ONLY function that decides the status — all tabs must use it.
 *
 * @param {object|null|undefined} fda - The fdaAnalysis object from backend
 * @returns {string} - one of FDA_STATUS values
 */
export function getFDAStatus(fda) {
  if (!fda) return FDA_STATUS.PENDING

  // Insufficient data — unknown/missing drug
  if (
    fda.apiStatus === 'insufficient_data' ||
    fda.apiStatus === 'no_drug' ||
    !fda.originalDrug && !fda.drug ||
    (fda.originalDrug || fda.drug || '').toLowerCase().trim() === 'unknown' ||
    (fda.originalDrug || fda.drug || '').toLowerCase().trim() === '' ||
    (fda.normalizedDrug || '').toLowerCase().trim() === 'unknown'
  ) {
    return FDA_STATUS.INSUFFICIENT_DATA
  }

  // API error or completely unavailable
  if (fda.available === false) return FDA_STATUS.UNAVAILABLE
  if (fda.apiStatus === 'error') return FDA_STATUS.ERROR

  // Treatment pattern — symptom is reason for drug, not adverse event
  if (fda.apiStatus === 'not_applicable') return FDA_STATUS.NOT_APPLICABLE

  // Match found: valid drug + openFDA queried + symptoms matched
  if (
    fda.applicable === true &&
    Array.isArray(fda.matchedSymptoms) &&
    fda.matchedSymptoms.length > 0
  ) {
    return FDA_STATUS.MATCH_FOUND
  }

  // openFDA was queried but no symptoms matched
  if (fda.available === true && fda.applicable === false) {
    return FDA_STATUS.NO_MATCH
  }

  // Fallback — shouldn't normally reach here
  return FDA_STATUS.PENDING
}

/**
 * Get display label for a given FDA status code.
 */
export function getFDALabel(status) {
  switch (status) {
    case FDA_STATUS.MATCH_FOUND:       return 'FDA Match'
    case FDA_STATUS.NO_MATCH:          return 'No Match'
    case FDA_STATUS.NOT_APPLICABLE:    return 'Not Applicable'
    case FDA_STATUS.UNAVAILABLE:       return 'Unavailable'
    case FDA_STATUS.INSUFFICIENT_DATA: return 'Insufficient Data'
    case FDA_STATUS.ERROR:             return 'FDA Error'
    case FDA_STATUS.PENDING:
    default:                           return 'Run FDA'
  }
}

/**
 * Get badge colors for a given FDA status.
 * Returns { bg, color, border } for inline styles.
 */
export function getFDABadgeStyle(status) {
  switch (status) {
    case FDA_STATUS.MATCH_FOUND:
      return { bg: 'rgba(239,68,68,.12)', color: '#EF4444', border: 'rgba(239,68,68,.3)' }
    case FDA_STATUS.NO_MATCH:
      return { bg: 'rgba(16,185,129,.10)', color: '#10B981', border: 'rgba(16,185,129,.25)' }
    case FDA_STATUS.NOT_APPLICABLE:
      return { bg: 'rgba(16,185,129,.10)', color: '#10B981', border: 'rgba(16,185,129,.25)' }
    case FDA_STATUS.UNAVAILABLE:
      return { bg: 'rgba(148,163,184,.12)', color: '#94A3B8', border: 'rgba(148,163,184,.3)' }
    case FDA_STATUS.INSUFFICIENT_DATA:
      return { bg: 'rgba(148,163,184,.12)', color: '#94A3B8', border: 'rgba(148,163,184,.3)' }
    case FDA_STATUS.ERROR:
      return { bg: 'rgba(239,68,68,.08)', color: '#EF4444', border: 'rgba(239,68,68,.2)' }
    case FDA_STATUS.PENDING:
    default:
      return { bg: 'rgba(59,130,246,.10)', color: '#3B82F6', border: 'rgba(59,130,246,.25)' }
  }
}

/**
 * Get report column label (used in Reports table + store normalizer).
 * Maps from full status to short display string.
 */
export function getFDAReportLabel(fda) {
  const status = getFDAStatus(fda)
  switch (status) {
    case FDA_STATUS.MATCH_FOUND:       return 'FDA Match Found'
    case FDA_STATUS.NO_MATCH:          return 'No FDA Match'
    case FDA_STATUS.NOT_APPLICABLE:    return 'Not Applicable'
    case FDA_STATUS.UNAVAILABLE:       return 'FDA Unavailable'
    case FDA_STATUS.INSUFFICIENT_DATA: return 'Insufficient Data'
    case FDA_STATUS.ERROR:             return 'FDA Error'
    case FDA_STATUS.PENDING:
    default:                           return 'Pending'
  }
}
