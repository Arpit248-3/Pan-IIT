/**
 * AyuScout V2 — Frontend PII Sanitizer (sanitizePII.js)
 * ======================================================
 * Client-side FIRST LAYER of PII protection.
 * Runs synchronously BEFORE any API call or store update.
 *
 * Architecture:
 *   RAW USER INPUT
 *     → sanitizePII()        ← THIS FILE (runs in browser, instant)
 *     → sanitizedInput
 *     → POST /api/analyze-case   ← backend masks again as second layer
 *     → global store
 *     → all tabs (Alerts, Reports, DataExplorer, Notifications, Logs)
 *
 * Design principles:
 *   - No hardcoded names or examples
 *   - Case-insensitive throughout
 *   - Medical whitelist prevents false-positive masking
 *   - Context patterns detect names/locations from natural language
 *   - Works for English, Hinglish, mixed-case, pasted paragraphs
 */

// ─────────────────────────────────────────────────────────────────────────────
// MEDICAL WHITELIST — these words/phrases are NEVER masked
// Expand this list as needed (just add lowercase strings)
// ─────────────────────────────────────────────────────────────────────────────
const MEDICAL_WHITELIST = new Set([
  // Symptoms & adverse events
  'fever', 'pyrexia', 'vomiting', 'nausea', 'dizziness', 'headache',
  'rash', 'itching', 'pruritus', 'cough', 'cold', 'fatigue', 'swelling',
  'pain', 'chest pain', 'stomach pain', 'breathing issue', 'dyspnea',
  'diarrhea', 'allergy', 'anaphylaxis', 'urticaria', 'angioedema',
  'seizure', 'tremor', 'palpitation', 'jaundice', 'constipation',
  'tachycardia', 'bradycardia', 'hypotension', 'hypertension', 'edema',
  'hepatotoxicity', 'nephrotoxicity', 'myalgia', 'arthralgia', 'alopecia',
  'thrombocytopenia', 'neutropenia', 'hyperglycemia', 'hypoglycemia',
  'insomnia', 'anxiety', 'depression', 'chills', 'sore', 'ache',
  'reaction', 'symptom', 'side effect', 'adverse event', 'adverse reaction',
  // Drugs
  'paracetamol', 'acetaminophen', 'aspirin', 'ibuprofen', 'naproxen',
  'metformin', 'insulin', 'lisinopril', 'atorvastatin', 'omeprazole',
  'amoxicillin', 'warfarin', 'clopidogrel', 'amlodipine', 'losartan',
  'hydrochlorothiazide', 'simvastatin', 'gabapentin', 'tramadol',
  'prednisone', 'prednisolone', 'levothyroxine', 'ciprofloxacin',
  'azithromycin', 'pantoprazole', 'sertraline', 'fluoxetine', 'diazepam',
  'alprazolam', 'morphine', 'codeine', 'doxycycline', 'cetirizine',
  'loratadine', 'metoprolol', 'atenolol', 'ramipril', 'furosemide',
  'pregabalin', 'rosuvastatin', 'glipizide', 'hydroxychloroquine',
  'tamoxifen', 'semaglutide', 'ozempic', 'jardiance', 'empagliflozin',
  'liraglutide',
  // Medical conditions
  'diabetes', 'hypertension', 'asthma', 'cancer', 'tuberculosis', 'hiv',
  'pneumonia', 'covid', 'malaria', 'dengue', 'cholesterol',
  // Units & generic medical words
  'mg', 'ml', 'tablet', 'capsule', 'injection', 'oral', 'iv', 'bp',
  'blood', 'pressure', 'sugar', 'liver', 'kidney', 'heart', 'lung',
  'brain', 'stomach', 'platelet', 'creatinine', 'hemoglobin',
  // Safe time words
  'today', 'yesterday', 'morning', 'evening', 'night', 'week', 'month',
  'after', 'before', 'following', 'within', 'daily', 'once', 'twice',
])

// Words that look like names but are actually grammar/stopwords
const SAFE_WORDS = new Set([
  'the', 'and', 'but', 'for', 'not', 'from', 'with', 'this', 'that',
  'have', 'has', 'had', 'been', 'were', 'was', 'are', 'will', 'can',
  'could', 'should', 'would', 'may', 'might', 'shall', 'am', 'is',
  'my', 'me', 'he', 'she', 'we', 'us', 'your', 'his', 'her', 'its',
  'our', 'they', 'them', 'what', 'when', 'where', 'who', 'how', 'why',
  'all', 'any', 'some', 'no', 'yes', 'ok', 'okay', 'also', 'just',
  'very', 'too', 'so', 'do', 'did', 'does', 'get', 'got', 'let',
  'now', 'then', 'here', 'there', 'new', 'old', 'first', 'last',
  'one', 'two', 'three', 'zero',
  // Hindi/Hinglish grammar words
  'aur', 'hai', 'hu', 'hoon', 'hun', 'mujhe', 'mera', 'meri',
  'mein', 'se', 'ko', 'ka', 'ki', 'ke', 'ne', 'bhi', 'usse', 'usko',
  'unhe', 'unko', 'yeh', 'woh', 'kya', 'kab', 'mai', 'main',
  // Common relational words that should not become [PERSON]
  'mother', 'father', 'brother', 'sister', 'wife', 'husband',
  'son', 'daughter', 'uncle', 'aunt', 'cousin', 'friend', 'patient',
  'doctor', 'dr',
])

/**
 * Returns true if the candidate word/phrase is safe (medical or stopword).
 * @param {string} word
 */
function isSafeWord(word) {
  const lower = word.toLowerCase().trim()
  return MEDICAL_WHITELIST.has(lower) || SAFE_WORDS.has(lower)
}

/**
 * Returns true if the candidate string should be masked
 * (not a medical term, not a stopword, at least 2 chars).
 * @param {string} candidate
 */
function shouldMask(candidate) {
  if (!candidate || candidate.length < 2) return false
  // Split multi-word candidates and check each word
  const words = candidate.trim().split(/\s+/)
  for (const word of words) {
    if (isSafeWord(word)) return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER A — Deterministic Regex for Structured PII
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace all regex-detectable PII in one pass.
 * Uses non-overlapping replacements by processing left-to-right.
 */
function applyRegexLayer(text) {
  let result = text

  // 1. Emails (before any name pattern runs)
  result = result.replace(
    /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/gi,
    '[EMAIL]'
  )

  // 2. URLs
  result = result.replace(/https?:\/\/\S+|www\.\S+/gi, '[URL]')

  // 3. Social media handles (@username)
  result = result.replace(/(?<!\w)@[A-Za-z0-9_]{2,30}\b/g, '[HANDLE]')

  // 4. IP addresses
  result = result.replace(
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    '[IP]'
  )

  // 5. Aadhaar (12 digits, optional spaces/hyphens)
  result = result.replace(/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, '[AADHAAR]')

  // 6. PAN card
  result = result.replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[PAN]')

  // 7. Indian mobile numbers (10 digits, starts 6-9)
  result = result.replace(/\b[6-9]\d{9}\b/g, '[PHONE]')

  // 8. International phone (+1-xxx, (xxx) xxx-xxxx etc.)
  result = result.replace(
    /(?<!\d)(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)/g,
    '[PHONE]'
  )

  // 9. Indian pin codes (6 digits starting with non-zero)
  result = result.replace(/\b[1-9]\d{5}\b/g, '[PINCODE]')

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER B — Context-Aware Name & Location Detection
// Case-insensitive. Captures person names and locations based on surrounding
// linguistic context. Works for any name dynamically.
// ─────────────────────────────────────────────────────────────────────────────

// Each entry: { pattern: RegExp, captureGroup: number, label: string }
// The pattern must have a capturing group for the PII candidate.
const PERSON_CONTEXT_PATTERNS = [
  // "i am arpit" / "i'm arpit" / "myself arpit"
  { pattern: /(?:i\s+am|i'm|myself)\s+([a-z][a-z]+)/i, group: 1 },
  // "my name is arpit", "name is arpit", "patient name is arpit"
  { pattern: /(?:my\s+name\s+is|name\s+is|patient\s+name\s+is?)\s+([a-z][a-z]+)/i, group: 1 },
  // "this is arpit" (also "this is dr/mr arpit")
  { pattern: /this\s+is\s+(?:dr\.?\s+|mr\.?\s+|ms\.?\s+|mrs\.?\s+)?([a-z][a-z]+)/i, group: 1 },
  // "mera naam arpit" / "mera naam arpit hai"
  { pattern: /mera\s+naam\s+([a-z][a-z]+)/i, group: 1 },
  // "mai arpit hu" / "main arpit hoon"
  { pattern: /(?:mai|main)\s+([a-z][a-z]+)\s+(?:hu|hoon|hun|hoon)\b/i, group: 1 },
  // "mai arpit" followed by Hinglish continuations
  { pattern: /(?:mai|main)\s+([a-z][a-z]+)(?=\s+(?:se|aur|mein|ko|ka|ki|ne|bhi))/i, group: 1 },
  // "arpit had fever" / "arpit suffered" / "arpit experienced"
  {
    pattern: /\b([a-z][a-z]+)\s+(?:had|has|have|suffered|experienced|developed|reported|got|is\s+suffering|complained)\b/i,
    group: 1
  },
  // Possessive: "arpit's mother" / "rahul's father"
  { pattern: /\b([a-z][a-z]+)'s?\s+(?:mother|father|brother|sister|wife|husband|son|daughter|uncle|aunt)\b/i, group: 1 },
  // Relation + name: "brother rahul", "friend arpit"
  {
    pattern: /(?:brother|sister|cousin|friend|uncle|aunt|son|daughter|wife|husband)\s+([a-z][a-z]+)/i,
    group: 1
  },
  // "patient arpit" / "patient mr arpit"
  { pattern: /patient\s+(?:mr\.?\s+|ms\.?\s+|mrs\.?\s+)?([a-z][a-z]+)/i, group: 1 },
]

const LOCATION_CONTEXT_PATTERNS = [
  // "from bangalore had" / "from delhi suffered" — location before a verb
  { pattern: /from\s+([a-z][a-z]+)(?=\s+(?:had|has|is|was|suffered|and\b))/i, group: 1 },
  // "arpit from bangalore" — the location after "from"
  { pattern: /[a-z][a-z]+\s+from\s+([a-z][a-z]+)/i, group: 1 },
  // "living in bangalore", "based in mumbai", "residing in delhi"
  {
    pattern: /(?:living\s+in|based\s+in|residing\s+in|staying\s+in)\s+([a-z][a-z]+)/i,
    group: 1
  },
  // Hinglish: "bangalore se hu", "delhi mein rehta"
  {
    pattern: /([a-z][a-z]+)\s+(?:se\s+hu|se\s+hoon|mein\s+rehta|mein\s+hoon|mein\s+rehti)/i,
    group: 1
  },
  // "in delhi had" / "at mumbai is"
  { pattern: /(?:in|at)\s+([a-z][a-z]+)(?=\s+(?:had|has|is|was))/i, group: 1 },
]

/**
 * Apply context patterns to detect and mask a PII type.
 * Recurses until no more matches are found (handles multiple entities per sentence).
 *
 * @param {string} text
 * @param {{ pattern: RegExp, group: number }[]} patterns
 * @param {string} label  e.g. '[PERSON]' or '[LOCATION]'
 * @returns {string}
 */
function applyContextPatterns(text, patterns, label) {
  let changed = true
  while (changed) {
    changed = false
    for (const { pattern, group } of patterns) {
      const match = pattern.exec(text)
      if (!match) continue
      const candidate = match[group]
      if (!candidate || !shouldMask(candidate)) continue

      // Replace only the captured group (not the surrounding context words)
      const start = match.index + match[0].indexOf(candidate)
      const end = start + candidate.length
      text = text.slice(0, start) + label + text.slice(end)
      changed = true
      break  // restart loop after any substitution
    }
  }
  return text
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize raw user input — mask all PII while preserving medical meaning.
 *
 * Call this FIRST, before any API call or store update.
 *
 * @param {string} rawText  - Raw text from the user input
 * @returns {{ sanitized: string, hadPII: boolean, detectedTypes: string[] }}
 *
 * @example
 *   const { sanitized } = sanitizePII("i am arpit and had fever after paracetamol")
 *   // sanitized → "i am [PERSON] and had fever after paracetamol"
 */
export function sanitizePII(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { sanitized: rawText || '', hadPII: false, detectedTypes: [] }
  }

  const original = rawText
  let text = rawText

  const detectedTypes = []

  // ── Layer A: Deterministic structured PII (regex) ──────────────────────
  const afterRegex = applyRegexLayer(text)
  if (afterRegex !== text) {
    // Detect which types were found
    if (/\[EMAIL\]/.test(afterRegex)) detectedTypes.push('EMAIL')
    if (/\[PHONE\]/.test(afterRegex)) detectedTypes.push('PHONE')
    if (/\[URL\]/.test(afterRegex)) detectedTypes.push('URL')
    if (/\[HANDLE\]/.test(afterRegex)) detectedTypes.push('HANDLE')
    if (/\[AADHAAR\]/.test(afterRegex)) detectedTypes.push('AADHAAR')
    if (/\[PAN\]/.test(afterRegex)) detectedTypes.push('PAN')
    if (/\[PINCODE\]/.test(afterRegex)) detectedTypes.push('PINCODE')
    if (/\[IP\]/.test(afterRegex)) detectedTypes.push('IP')
  }
  text = afterRegex

  // ── Layer B: Context-aware person name detection ───────────────────────
  const afterPersons = applyContextPatterns(text, PERSON_CONTEXT_PATTERNS, '[PERSON]')
  if (afterPersons !== text) detectedTypes.push('PERSON')
  text = afterPersons

  // ── Layer C: Context-aware location detection ─────────────────────────
  const afterLocations = applyContextPatterns(text, LOCATION_CONTEXT_PATTERNS, '[LOCATION]')
  if (afterLocations !== text) detectedTypes.push('LOCATION')
  text = afterLocations

  return {
    sanitized:     text,
    hadPII:        text !== original,
    detectedTypes: [...new Set(detectedTypes)],  // deduplicate
  }
}

/**
 * Quick boolean check — does this text appear to contain PII?
 * Used for UI warnings / badge display.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasPII(text) {
  const { hadPII } = sanitizePII(text)
  return hadPII
}

export default sanitizePII
