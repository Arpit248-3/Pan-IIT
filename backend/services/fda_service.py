"""
AyuScout V2 — FDA Adverse Event Analysis Service
==================================================
Queries real openFDA APIs (drug/event + drug/label) to validate
adverse event signals. No hardcoded FDA evidence — only normalization
aliases and synonym maps for matching are static.

Requirements:
  - Works without OPENFDA_API_KEY (public rate-limited endpoint)
  - Graceful fallback on network errors
  - In-memory TTL cache to avoid repeated API calls
  - False-positive prevention via relation detection
  - Fuzzy matching of symptoms to FDA reactions
"""

import os
import re
import time
import threading
import requests
from datetime import datetime, timezone
from difflib import SequenceMatcher

# ── Environment ──────────────────────────────────────────────────────────────
OPENFDA_BASE_URL = os.getenv("OPENFDA_BASE_URL", "https://api.fda.gov").rstrip("/")
OPENFDA_API_KEY  = os.getenv("OPENFDA_API_KEY", "").strip() or None  # None if empty/missing

# ── Invalid drug sentinel values (must never reach openFDA) ──────────────────
INVALID_DRUG_VALUES: frozenset = frozenset({
    "", "unknown", "n/a", "na", "none", "null",
    "drug", "medicine", "medication", "tablet", "pill",
    "adverse event", "not specified", "unspecified",
})

def _is_invalid_drug(raw: str) -> bool:
    """Return True when the drug string is missing or a known-bad sentinel."""
    return not raw or raw.strip().lower() in INVALID_DRUG_VALUES


def _insufficient_data_result(now_iso: str, raw_drug: str = "", record_id=None, record_type=None) -> dict:
    """Canonical 'insufficient data' FDA result — returned when drug is unknown."""
    return {
        "available":        True,
        "applicable":       False,
        "originalDrug":     raw_drug,
        "drug":             raw_drug,
        "normalizedDrug":   "",
        "extractedSymptoms":[],
        "matchedSymptoms":  [],
        "knownReactions":   [],
        "confidenceBoost":  0,
        "riskLevel":        "unknown",
        "evidenceSource":   "openFDA",
        "sourceApis":       [],
        "summary":          "FDA analysis could not run because no valid drug was detected.",
        "apiStatus":        "insufficient_data",
        "lastCheckedAt":    now_iso,
        "cacheHit":         False,
        "matchedRecordId":  record_id,
        "recordType":       record_type,
    }

# ── In-Memory TTL Cache ───────────────────────────────────────────────────────
_CACHE: dict = {}
_CACHE_LOCK  = threading.Lock()
CACHE_TTL_SECONDS = 3600  # 1 hour

def _cache_key(normalized_drug: str, api_type: str) -> str:
    return f"{normalized_drug.lower()}::{api_type}"

def _cache_get(key: str):
    with _CACHE_LOCK:
        entry = _CACHE.get(key)
        if entry and (time.time() - entry["ts"]) < CACHE_TTL_SECONDS:
            return entry["data"], True
        return None, False

def _cache_set(key: str, data):
    with _CACHE_LOCK:
        _CACHE[key] = {"data": data, "ts": time.time()}

# ── Drug Normalization Map ────────────────────────────────────────────────────
# Indian brand names + common aliases → FDA-recognized generic name
DRUG_NORMALIZATION: dict[str, str] = {
    # Paracetamol / Acetaminophen family
    "paracetamol":    "acetaminophen",
    "crocin":         "acetaminophen",
    "dolo":           "acetaminophen",
    "dolo 650":       "acetaminophen",
    "dolo650":        "acetaminophen",
    "calpol":         "acetaminophen",
    "tylenol":        "acetaminophen",
    "acetaminophen":  "acetaminophen",
    "paracetemol":    "acetaminophen",   # common misspelling
    # Ibuprofen family
    "brufen":         "ibuprofen",
    "combiflam":      "ibuprofen",
    "advil":          "ibuprofen",
    "nurofen":        "ibuprofen",
    "ibuprofen":      "ibuprofen",
    # Aspirin
    "aspirin":        "aspirin",
    "ecosprin":       "aspirin",
    "disprin":        "aspirin",
    "bayer aspirin":  "aspirin",
    # Metformin
    "metformin":      "metformin",
    "glycomet":       "metformin",
    "glucophage":     "metformin",
    # Lisinopril
    "lisinopril":     "lisinopril",
    # Atorvastatin
    "atorvastatin":   "atorvastatin",
    "lipitor":        "atorvastatin",
    "storvas":        "atorvastatin",
    # Omeprazole / PPI
    "omeprazole":     "omeprazole",
    "prilosec":       "omeprazole",
    "omez":           "omeprazole",
    # Amoxicillin
    "amoxicillin":    "amoxicillin",
    "amoxil":         "amoxicillin",
    # Ciprofloxacin
    "ciprofloxacin":  "ciprofloxacin",
    "cipro":          "ciprofloxacin",
    # Cetirizine
    "cetirizine":     "cetirizine",
    "cetzine":        "cetirizine",
    "zyrtec":         "cetirizine",
    # Azithromycin
    "azithromycin":   "azithromycin",
    "zithromax":      "azithromycin",
    "azee":           "azithromycin",
    # Pantoprazole
    "pantoprazole":   "pantoprazole",
    "pan 40":         "pantoprazole",
}

# ── Symptom Synonym Map ───────────────────────────────────────────────────────
# patient-term / layperson → normalized term + FDA MedDRA synonyms
SYMPTOM_SYNONYMS: dict[str, list[str]] = {
    "vomiting":        ["vomiting", "emesis", "nausea and vomiting"],
    "nausea":          ["nausea", "nausea and vomiting", "feeling sick"],
    "dizziness":       ["dizziness", "vertigo", "lightheadedness", "giddiness"],
    "rash":            ["rash", "skin rash", "eruption", "urticaria", "hives", "dermatitis"],
    "itching":         ["pruritus", "itching", "itch"],
    "swelling":        ["swelling", "oedema", "edema", "angioedema"],
    "chest pain":      ["chest pain", "chest discomfort", "chest tightness"],
    "stomach pain":    ["abdominal pain", "stomach pain", "epigastric pain", "gastric pain"],
    "abdominal pain":  ["abdominal pain", "stomach pain", "epigastric pain"],
    "headache":        ["headache", "cephalgia", "head pain", "migraine"],
    "breathing issue": ["dyspnea", "shortness of breath", "breathing difficulty", "breathlessness"],
    "diarrhea":        ["diarrhoea", "diarrhea", "loose stools", "loose motions"],
    "fatigue":         ["fatigue", "asthenia", "tiredness", "weakness", "malaise"],
    "fever":           ["pyrexia", "fever", "hyperthermia", "high temperature"],
    "liver damage":    ["hepatotoxicity", "liver injury", "hepatic failure", "elevated liver enzymes", "jaundice"],
    "liver":           ["hepatotoxicity", "liver injury", "hepatic failure"],
    "jaundice":        ["jaundice", "hepatic failure", "liver injury"],
    "anaphylaxis":     ["anaphylaxis", "anaphylactic reaction", "allergic reaction"],
    "allergy":         ["allergic reaction", "anaphylaxis", "hypersensitivity"],
    "heart attack":    ["myocardial infarction", "cardiac arrest", "heart attack"],
    "kidney":          ["renal failure", "acute kidney injury", "nephrotoxicity"],
}

# ── Known symptom keywords (for extraction) ───────────────────────────────────
KNOWN_SYMPTOMS = list(SYMPTOM_SYNONYMS.keys()) + [
    "pain", "ache", "cramps", "bleeding", "bruising", "tingling",
    "numbness", "confusion", "seizure", "tremor", "hair loss",
    "weight gain", "weight loss", "insomnia", "anxiety", "depression",
    "palpitation", "irregular heartbeat",
]

# ── Known drugs (for extraction) ──────────────────────────────────────────────
KNOWN_DRUGS = list(DRUG_NORMALIZATION.keys())

# ── Adverse-event relationship indicators ────────────────────────────────────
ADVERSE_PATTERNS = [
    r"\bafter\s+(taking|consuming|using|having|eating|drinking|starting|beginning)\b",
    r"\bafter\s+\w+\b",         # "after paracetamol"
    r"\bfollowing\b",
    r"\bcaused\s+by\b",
    r"\bdue\s+to\b",
    r"\breaction\s+(after|to|from)\b",
    r"\bside\s+effect\b",
    r"\bdeveloped\s+after\b",
    r"\bstarted\s+after\b",
    r"\bsince\s+(taking|starting|using)\b",
    r"\bbecause\s+of\s+(the\s+)?(medicine|drug|tablet|pill|medication)\b",
]

# ── Treatment/indication patterns (NOT adverse events) ────────────────────────
TREATMENT_PATTERNS = [
    r"\bfor\s+(fever|pain|headache|cold|cough|flu|infection|diarrhea|vomiting|nausea)\b",
    r"\bbecause\s+(i\s+had|of\s+(the\s+)?fever)\b",
    r"\bso\s+i\s+took\b",
    r"\bsuffering\s+from\b",
    r"\bhad\s+(fever|pain|headache)\s+and\s+took\b",
    r"\btook\s+.{0,40}\bfor\b",
    r"\b(treating|treatment\s+for|to\s+treat)\b",
    r"\bto\s+(relieve|reduce|cure|treat|manage)\b",
]


# ── Core Functions ────────────────────────────────────────────────────────────

def normalize_drug(drug: str) -> str:
    """Return FDA-recognized generic name for a drug, or original if unknown."""
    if not drug:
        return drug
    key = drug.strip().lower()
    return DRUG_NORMALIZATION.get(key, drug.strip())


def extract_drug_from_text(text: str) -> str | None:
    """Extract the first known drug name from text."""
    t = text.lower()
    # Check normalization map first (most comprehensive)
    for known_drug in sorted(KNOWN_DRUGS, key=len, reverse=True):
        if re.search(r'\b' + re.escape(known_drug) + r'\b', t):
            return known_drug
    return None


def extract_symptoms_from_text(text: str) -> list[str]:
    """Extract known symptom keywords from sanitized text."""
    t = text.lower()
    found = []
    for sym in sorted(KNOWN_SYMPTOMS, key=len, reverse=True):
        if re.search(r'\b' + re.escape(sym) + r'\b', t):
            if sym not in found:
                found.append(sym)
    return found


def detect_relation_type(text: str) -> str:
    """
    Returns 'adverse' if text indicates an adverse-event relationship,
    'treatment' if symptom is the reason for taking the drug,
    or 'unknown' otherwise.
    """
    t = text.lower()

    # Check treatment patterns first (higher priority for false-positive prevention)
    for pat in TREATMENT_PATTERNS:
        if re.search(pat, t):
            return "treatment"

    # Then check adverse patterns
    for pat in ADVERSE_PATTERNS:
        if re.search(pat, t):
            return "adverse"

    return "unknown"


def fuzzy_score(a: str, b: str) -> float:
    """Simple SequenceMatcher ratio between two lowercased strings."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def match_symptoms_to_reactions(symptoms: list[str], fda_reactions: list[str]) -> list[str]:
    """
    Match extracted symptoms against FDA known reactions using:
    1. Exact match
    2. Case-insensitive match
    3. Partial phrase match
    4. Synonym map
    5. Fuzzy matching (threshold 0.78)
    """
    matched = []
    reactions_lower = [r.lower() for r in fda_reactions]

    for sym in symptoms:
        sym_lower = sym.lower()
        # Build candidate list: symptom itself + all synonyms
        candidates = [sym_lower] + [s.lower() for s in SYMPTOM_SYNONYMS.get(sym_lower, [])]

        hit = False
        for cand in candidates:
            # 1 & 2: exact / case-insensitive
            if cand in reactions_lower:
                hit = True
                break
            # 3: partial phrase match
            for r in reactions_lower:
                if cand in r or r in cand:
                    hit = True
                    break
            if hit:
                break
            # 5: fuzzy
            for r in reactions_lower:
                if fuzzy_score(cand, r) >= 0.78:
                    hit = True
                    break
            if hit:
                break

        if hit and sym not in matched:
            matched.append(sym)

    return matched


def _build_request_params(search_query: str, limit: int = 15) -> dict:
    """Build openFDA request params, optionally including api_key."""
    params = {"search": search_query, "limit": limit}
    if OPENFDA_API_KEY:
        params["api_key"] = OPENFDA_API_KEY
    return params


def _fetch_fda_event_reactions(normalized_drug: str) -> tuple[list[str], str]:
    """
    Query openFDA drug/event endpoint for known adverse reactions.
    Returns (reactions_list, status).
    """
    cache_key = _cache_key(normalized_drug, "event")
    cached, hit = _cache_get(cache_key)
    if hit:
        return cached, "success_cached"

    url = f"{OPENFDA_BASE_URL}/drug/event.json"
    search = f'patient.drug.medicinalproduct:"{normalized_drug}"'
    params = _build_request_params(search, limit=1)
    # Add count param to get reaction frequencies
    params["count"] = "patient.reaction.reactionmeddrapt.exact"
    # Remove "limit" when using "count"
    params.pop("limit", None)

    try:
        resp = requests.get(url, params=params, timeout=12)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])
            reactions = [r.get("term", "").lower() for r in results if r.get("term")]
            reactions = [r for r in reactions if r][:50]  # top 50
            _cache_set(cache_key, reactions)
            return reactions, "success"
        elif resp.status_code == 404:
            _cache_set(cache_key, [])
            return [], "not_found"
        else:
            return [], f"http_{resp.status_code}"
    except Exception as e:
        return [], f"error:{type(e).__name__}"


def _fetch_fda_label_reactions(normalized_drug: str) -> tuple[list[str], str]:
    """
    Query openFDA drug/label endpoint for adverse reactions section.
    Returns (reactions_list, status).
    """
    cache_key = _cache_key(normalized_drug, "label")
    cached, hit = _cache_get(cache_key)
    if hit:
        return cached, "success_cached"

    url = f"{OPENFDA_BASE_URL}/drug/label.json"
    search = f'openfda.generic_name:"{normalized_drug}"'
    params = _build_request_params(search, limit=3)

    try:
        resp = requests.get(url, params=params, timeout=12)
        if resp.status_code == 200:
            data = resp.json()
            reactions = []
            for result in data.get("results", []):
                # Parse adverse_reactions free text
                for section in result.get("adverse_reactions", []):
                    # Split on commas, semicolons, newlines
                    tokens = re.split(r'[,;\n•\(\)]+', section)
                    for tok in tokens:
                        tok = tok.strip().lower()
                        # Remove non-alphabetic junk
                        tok = re.sub(r'[^a-z\s\-]', '', tok).strip()
                        if 2 < len(tok) < 60:
                            reactions.append(tok)
            reactions = list(set(reactions))[:60]
            _cache_set(cache_key, reactions)
            return reactions, "success"
        elif resp.status_code == 404:
            _cache_set(cache_key, [])
            return [], "not_found"
        else:
            return [], f"http_{resp.status_code}"
    except Exception as e:
        return [], f"error:{type(e).__name__}"


def _determine_risk_level(matched_count: int, total_known: int) -> str:
    if matched_count == 0:
        return "low"
    if total_known == 0:
        return "moderate"
    ratio = matched_count / max(total_known, 1)
    if matched_count >= 3 or ratio >= 0.5:
        return "high"
    if matched_count >= 1:
        return "moderate"
    return "low"


def _confidence_boost(matched_count: int) -> int:
    if matched_count >= 3:
        return 30
    if matched_count == 2:
        return 20
    if matched_count == 1:
        return 10
    return 0


# ── Public API ────────────────────────────────────────────────────────────────

def analyze_fda(
    text: str,
    drug_hint: str | None = None,
    symptoms_hint: list[str] | None = None
) -> dict:
    """
    Main FDA analysis entry point.

    Args:
        text: Sanitized (PII-masked) patient text.
        drug_hint: Optional pre-extracted drug name.
        symptoms_hint: Optional pre-extracted symptoms.

    Returns:
        FDA analysis result object (see spec).
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    # ── 1. Extract drug ──────────────────────────────────────────────────────
    raw_drug = drug_hint or extract_drug_from_text(text) or ""
    # Guard: reject unknown/sentinel drug values before touching openFDA
    if _is_invalid_drug(raw_drug):
        return _insufficient_data_result(now_iso, raw_drug=raw_drug)

    normalized_drug = normalize_drug(raw_drug)

    # ── 2. Extract symptoms ──────────────────────────────────────────────────
    extracted_symptoms = symptoms_hint or extract_symptoms_from_text(text)

    # ── 3. Relation detection (false-positive prevention) ────────────────────
    relation = detect_relation_type(text)
    if relation == "treatment":
        return {
            "available": True,
            "applicable": False,
            "drug": raw_drug,
            "normalizedDrug": normalized_drug,
            "extractedSymptoms": extracted_symptoms,
            "matchedSymptoms": [],
            "knownReactions": [],
            "confidenceBoost": 0,
            "riskLevel": "low",
            "evidenceSource": "openFDA",
            "sourceApis": [],
            "summary": (
                "FDA adverse event analysis was not applied because the symptom "
                "appears to be the reason for taking the medicine, not a reaction to it."
            ),
            "apiStatus": "not_applicable",
            "lastCheckedAt": now_iso,
            "cacheHit": False,
        }

    if not extracted_symptoms:
        return {
            "available": True,
            "applicable": False,
            "drug": raw_drug,
            "normalizedDrug": normalized_drug,
            "extractedSymptoms": [],
            "matchedSymptoms": [],
            "knownReactions": [],
            "confidenceBoost": 0,
            "riskLevel": "low",
            "evidenceSource": "openFDA",
            "sourceApis": [],
            "summary": "No adverse symptoms detected in the input text.",
            "apiStatus": "no_symptoms",
            "lastCheckedAt": now_iso,
            "cacheHit": False,
        }

    # ── 4. Query openFDA APIs ────────────────────────────────────────────────
    event_reactions, event_status = _fetch_fda_event_reactions(normalized_drug)
    label_reactions, label_status = _fetch_fda_label_reactions(normalized_drug)

    # Track if any result was from cache
    cache_hit = "cached" in event_status or "cached" in label_status

    # If both failed with actual errors (not 404), mark unavailable
    if ("error:" in event_status and "error:" in label_status):
        return {
            "available": False,
            "applicable": False,
            "drug": raw_drug,
            "normalizedDrug": normalized_drug,
            "extractedSymptoms": extracted_symptoms,
            "matchedSymptoms": [],
            "knownReactions": [],
            "confidenceBoost": 0,
            "riskLevel": "unknown",
            "evidenceSource": "openFDA",
            "sourceApis": [],
            "summary": "FDA evidence could not be retrieved at this time.",
            "apiStatus": "error",
            "lastCheckedAt": now_iso,
            "cacheHit": False,
        }

    # ── 5. Merge + deduplicate reactions ─────────────────────────────────────
    all_known = list(set(event_reactions + label_reactions))

    # Track which APIs contributed
    source_apis = []
    if event_reactions:
        source_apis.append("drug/event")
    if label_reactions:
        source_apis.append("drug/label")

    # ── 6. Match symptoms ────────────────────────────────────────────────────
    matched = match_symptoms_to_reactions(extracted_symptoms, all_known)

    # ── 7. Risk + confidence ─────────────────────────────────────────────────
    risk_level    = _determine_risk_level(len(matched), len(all_known))
    conf_boost    = _confidence_boost(len(matched))
    applicable    = len(matched) > 0

    # ── 8. Summary ───────────────────────────────────────────────────────────
    if applicable:
        sym_str = ", ".join(matched)
        summary = (
            f"{sym_str.capitalize()} appear(s) in FDA adverse event/label data "
            f"for {normalized_drug}. Evidence retrieved from openFDA."
        )
    else:
        summary = (
            f"Symptoms {', '.join(extracted_symptoms)} were not matched in "
            f"FDA adverse event data for {normalized_drug}."
        )

    return {
        "available": True,
        "applicable": applicable,
        "originalDrug": raw_drug,
        "drug": raw_drug,                       # kept for backward-compat
        "normalizedDrug": normalized_drug,
        "extractedSymptoms": extracted_symptoms,
        "matchedSymptoms": matched,
        "knownReactions": all_known[:20],
        "confidenceBoost": conf_boost,
        "riskLevel": risk_level,
        "evidenceSource": "openFDA",
        "sourceApis": source_apis,
        "summary": summary,
        "apiStatus": "success",
        "lastCheckedAt": now_iso,
        "cacheHit": cache_hit,
    }


# ── Structured-record entry point ─────────────────────────────────────────────

def analyze_fda_structured(
    drug: str,
    event: str,
    record_id: int | None = None,
    record_type: str | None = None,
) -> dict:
    """
    FDA analysis for STRUCTURED records from the DB (alerts / reports /
    intelligence vault).  Drug and event are already AI-extracted — NO
    relation-detection step is performed, because the AI pipeline has already
    decided this combination is an adverse event.

    Args:
        drug:        Suspect drug (e.g. "Paracetamol", "Ibuprofen").
        event:       Adverse event / MedDRA term (e.g. "Cephalalgia",
                     "Skin Rash", "Angioedema").
        record_id:   Optional ID of the source record (for metadata).
        record_type: Optional type label ("intelligence" | "intake" | ...).

    Returns:
        Standard FDA analysis result object.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    raw_drug   = (drug or "").strip()
    raw_event  = (event or "").strip()

    # Guard: reject Unknown/empty/sentinel drug values — never call openFDA
    if _is_invalid_drug(raw_drug):
        return _insufficient_data_result(
            now_iso,
            raw_drug=raw_drug,
            record_id=record_id,
            record_type=record_type,
        )

    normalized_drug = normalize_drug(raw_drug)

    # ── Extract symptom candidates from the event field ─────────────────────
    # For structured records, the event IS the symptom/MedDRA term.
    # We build a synonym-expanded candidate list from it directly.
    event_lower = raw_event.lower()
    extracted_symptoms = []

    # Check if the event itself (or any synonym) is in our known symptoms
    for sym, synonyms in SYMPTOM_SYNONYMS.items():
        all_forms = [sym] + synonyms
        if any(f in event_lower or event_lower in f for f in all_forms):
            if sym not in extracted_symptoms:
                extracted_symptoms.append(sym)

    # Also run the text extractor on the raw_event string for additional hits
    text_extracted = extract_symptoms_from_text(raw_event)
    for s in text_extracted:
        if s not in extracted_symptoms:
            extracted_symptoms.append(s)

    # If nothing found via synonyms, use the raw event string as a symptom
    if not extracted_symptoms and raw_event:
        extracted_symptoms = [event_lower]

    if not extracted_symptoms:
        return {
            "available": True,
            "applicable": False,
            "originalDrug": raw_drug,
            "drug": raw_drug,
            "normalizedDrug": normalized_drug,
            "extractedSymptoms": [],
            "matchedSymptoms": [],
            "knownReactions": [],
            "confidenceBoost": 0,
            "riskLevel": "low",
            "evidenceSource": "openFDA",
            "sourceApis": [],
            "summary": f"No adverse symptom could be derived from event '{raw_event}'.",
            "apiStatus": "no_symptoms",
            "lastCheckedAt": now_iso,
            "cacheHit": False,
            "matchedRecordId": record_id,
            "recordType": record_type,
        }

    # ── Query openFDA ────────────────────────────────────────────────────────
    event_reactions, event_status = _fetch_fda_event_reactions(normalized_drug)
    label_reactions, label_status = _fetch_fda_label_reactions(normalized_drug)

    cache_hit = "cached" in event_status or "cached" in label_status

    if "error:" in event_status and "error:" in label_status:
        return {
            "available": False,
            "applicable": False,
            "originalDrug": raw_drug,
            "drug": raw_drug,
            "normalizedDrug": normalized_drug,
            "extractedSymptoms": extracted_symptoms,
            "matchedSymptoms": [],
            "knownReactions": [],
            "confidenceBoost": 0,
            "riskLevel": "unknown",
            "evidenceSource": "openFDA",
            "sourceApis": [],
            "summary": "FDA evidence could not be retrieved at this time.",
            "apiStatus": "error",
            "lastCheckedAt": now_iso,
            "cacheHit": False,
            "matchedRecordId": record_id,
            "recordType": record_type,
        }

    all_known = list(set(event_reactions + label_reactions))

    source_apis = []
    if event_reactions:
        source_apis.append("drug/event")
    if label_reactions:
        source_apis.append("drug/label")

    # ── For structured records: also match the raw_event string directly ────
    # This handles MedDRA terms like "Cephalalgia" that might not be in our
    # SYMPTOM_SYNONYMS map but ARE in the FDA reaction list.
    extended_symptoms = list(extracted_symptoms)
    if event_lower not in [s.lower() for s in extended_symptoms]:
        extended_symptoms.append(event_lower)

    matched = match_symptoms_to_reactions(extended_symptoms, all_known)

    risk_level = _determine_risk_level(len(matched), len(all_known))
    conf_boost = _confidence_boost(len(matched))
    applicable = len(matched) > 0

    if applicable:
        sym_str = ", ".join(matched)
        summary = (
            f"{sym_str.capitalize()} appear(s) in FDA adverse event/label data "
            f"for {normalized_drug} (structured record: {raw_event}). "
            f"Evidence retrieved from openFDA."
        )
    else:
        summary = (
            f"Adverse event '{raw_event}' for {normalized_drug} was not matched "
            f"in FDA adverse event data (checked {len(all_known)} known reactions)."
        )

    return {
        "available": True,
        "applicable": applicable,
        "originalDrug": raw_drug,
        "drug": raw_drug,
        "normalizedDrug": normalized_drug,
        "extractedSymptoms": extracted_symptoms,
        "matchedSymptoms": matched,
        "knownReactions": all_known[:20],
        "confidenceBoost": conf_boost,
        "riskLevel": risk_level,
        "evidenceSource": "openFDA",
        "sourceApis": source_apis,
        "summary": summary,
        "apiStatus": "success",
        "lastCheckedAt": now_iso,
        "cacheHit": cache_hit,
        "matchedRecordId": record_id,
        "recordType": record_type,
    }

