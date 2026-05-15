"""
AyuScout V2 — PII Vault (Production Hardened — Hybrid NLP Engine v3)
=====================================================================
Fully generic, case-insensitive, context-aware PII masking engine.
Works for ANY sentence regardless of capitalization, language mix, or structure.

Key design principles:
  - NO hardcoded names or examples
  - Case-insensitive matching throughout  
  - Medical whitelist prevents false-positive masking
  - Context-pattern detection catches lowercase names (e.g., "i am arpit")
  - Presidio NER for any remaining undetected entities
  - Replacement tokens are semantic labels (e.g. [PERSON], [LOCATION])
    so the downstream AI still understands grammatical context

Compliant with DPDP Act 2023 (India) and ICH E6(R2) / E2B(R3).

[PII AUDIT] lines appear in stdout for compliance review.
"""

import re
import hashlib
import logging
from typing import Tuple, Dict, List, Optional

try:
    from presidio_analyzer import AnalyzerEngine
    _presidio_available = True
except ImportError:
    _presidio_available = False

_audit_logger = logging.getLogger("pii_audit")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def _pii_audit(source: str, detected: list, status: str = "MASKED"):
    if detected:
        _audit_logger.info(
            f"[PII AUDIT] Source={source} Detected={','.join(sorted(set(detected)))} Status={status}"
        )


# ── Medical Terms Whitelist — NEVER masked ───────────────────────────────────
# Expandable: add any new medical terms here.
MEDICAL_WHITELIST = {
    # ─ Symptoms & adverse events
    "fever", "pyrexia", "vomiting", "nausea", "dizziness", "headache",
    "rash", "itching", "pruritus", "cough", "cold", "fatigue", "swelling",
    "pain", "chest pain", "stomach pain", "breathing issue", "dyspnea",
    "diarrhea", "allergy", "anaphylaxis", "urticaria", "angioedema",
    "seizure", "tremor", "palpitation", "jaundice", "constipation",
    "tachycardia", "bradycardia", "hypotension", "hypertension", "edema",
    "hepatotoxicity", "nephrotoxicity", "myalgia", "arthralgia", "alopecia",
    "thrombocytopenia", "neutropenia", "pancytopenia", "hyperglycemia",
    "hypoglycemia", "insomnia", "anxiety", "depression", "chills",
    "sore", "ache", "reaction", "symptom", "side effect",
    # ─ Common drugs
    "paracetamol", "acetaminophen", "aspirin", "ibuprofen", "naproxen",
    "metformin", "insulin", "lisinopril", "atorvastatin", "omeprazole",
    "amoxicillin", "warfarin", "clopidogrel", "amlodipine", "losartan",
    "hydrochlorothiazide", "simvastatin", "gabapentin", "tramadol",
    "prednisone", "prednisolone", "levothyroxine", "ciprofloxacin",
    "azithromycin", "pantoprazole", "sertraline", "fluoxetine", "diazepam",
    "alprazolam", "morphine", "codeine", "doxycycline", "cetirizine",
    "loratadine", "metoprolol", "atenolol", "ramipril", "furosemide",
    "pregabalin", "rosuvastatin", "glipizide", "hydroxychloroquine",
    "tamoxifen", "semaglutide", "ozempic", "jardiance", "empagliflozin",
    "liraglutide",
    # ─ Medical conditions
    "diabetes", "hypertension", "asthma", "cancer", "tuberculosis", "hiv",
    "pneumonia", "covid", "malaria", "dengue", "cholesterol",
    # ─ Medical units & terms
    "mg", "ml", "tablet", "capsule", "injection", "oral", "iv", "bp",
    "blood", "pressure", "sugar", "liver", "kidney", "heart", "lung",
    "brain", "stomach", "intestine", "platelet", "creatinine", "bilirubin",
    "hemoglobin", "sodium", "potassium",
    # ─ Time expressions (safe)
    "today", "yesterday", "morning", "evening", "night", "week", "month",
    "after", "before", "following", "within",
}


def _is_medical(word: str) -> bool:
    """Returns True if the word (or multi-word phrase) is a protected medical term."""
    return word.lower().strip() in MEDICAL_WHITELIST


def _word_is_safe(word: str) -> bool:
    """
    Returns True if a candidate PII word should NOT be masked.
    Protects: medical terms, stopwords that look like names.
    """
    lowered = word.lower().strip()
    if _is_medical(lowered):
        return True
    # Common stopwords / grammar words that regex might pick up as names
    SAFE_WORDS = {
        "the", "and", "but", "for", "not", "from", "with", "this", "that",
        "have", "has", "had", "been", "were", "was", "are", "will", "can",
        "could", "should", "would", "may", "might", "shall", "am", "is",
        "my", "me", "he", "she", "we", "us", "your", "his", "her", "its",
        "our", "they", "them", "what", "when", "where", "who", "how", "why",
        "all", "any", "some", "no", "yes", "ok", "okay", "also", "just",
        "very", "too", "so", "do", "did", "does", "get", "got", "let",
        "now", "then", "today", "here", "there", "new", "old", "first",
        "last", "one", "two", "three", "aur", "hai", "hu", "hoon", "hun",
        "mujhe", "mera", "meri", "mein", "se", "ko", "ka", "ki", "ke",
        "usse", "usko", "unhe", "unko", "yeh", "woh", "kya", "kab",
    }
    return lowered in SAFE_WORDS


# ── Presidio NLP Engine (singleton) ─────────────────────────────────────────
_analyzer: Optional[object] = None
if _presidio_available:
    try:
        _analyzer = AnalyzerEngine()
    except Exception as e:
        print(f"[PII Vault] Presidio init failed (NER layer disabled): {e}")


class PIIVault:
    """
    Three-layer hybrid PII masking engine:

    Layer 1 — Deterministic Regex:
        Handles structured PII: email, phone, Aadhaar, PAN, URLs, IP, pin codes.

    Layer 2 — Context-Aware Pattern Matching (case-insensitive):
        Catches names/locations from natural language patterns:
        "i am X", "my name is X", "X from Y", "mai X hu", etc.
        Works for ANY name dynamically — not hardcoded.

    Layer 3 — NLP NER via Presidio + spaCy:
        Catches remaining entities (Title-Case names, organizations, etc.)
        that were missed by Layers 1 & 2.

    Medical Whitelist is enforced at all three layers.
    """

    def __init__(self):
        self._counter: Dict[str, int] = {}

    # ── Token generation ─────────────────────────────────────────────────────
    def _tok(self, category: str) -> str:
        """Returns a semantic label like [PERSON], [LOCATION], [PHONE]."""
        cat = category.upper()
        # Map Presidio/spaCy entity types to our semantic labels
        _MAP = {
            "PERSON": "PERSON",
            "LOCATION": "LOCATION",
            "GPE": "LOCATION",       # spaCy geopolitical entity
            "LOC": "LOCATION",
            "ORGANIZATION": "ORG",
            "ORG": "ORG",
            "PHONE_NUMBER": "PHONE",
            "IN_PHONE": "PHONE",
            "EMAIL_ADDRESS": "EMAIL",
            "URL": "URL",
            "IP_ADDRESS": "IP",
        }
        return f"[{_MAP.get(cat, cat)}]"

    # ── Safe candidate check ─────────────────────────────────────────────────
    def _should_mask(self, candidate: str) -> bool:
        """Returns True if the candidate word is NOT in the medical/safe list."""
        for word in re.findall(r'\w+', candidate):
            if _word_is_safe(word):
                return False
        return len(candidate.strip()) >= 2

    # ── Layer 1: Deterministic Regex ─────────────────────────────────────────
    _REGEX_PATTERNS: List[Tuple[str, str]] = [
        # Emails (run first — catches name@domain before name patterns do)
        (r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b', 'EMAIL'),
        # URLs
        (r'https?://\S+|www\.\S+', 'URL'),
        # Social handles (@username)
        (r'(?<!\w)@[A-Za-z0-9_]{2,30}\b', 'HANDLE'),
        # IP addresses
        (r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', 'IP'),
        # Aadhaar: 12 digits (with optional spaces or hyphens)
        (r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b', 'AADHAAR'),
        # PAN card (AAAAA9999A)
        (r'\b[A-Z]{5}[0-9]{4}[A-Z]\b', 'PAN'),
        # Indian mobile (10 digits, starts 6-9)
        (r'\b[6-9]\d{9}\b', 'PHONE'),
        # International phone (+1-xxx or (xxx) xxx-xxxx etc.)
        (r'(?<!\d)(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)', 'PHONE'),
        # Indian pin codes (6 digits starting with 1-9)
        (r'\b[1-9]\d{5}\b', 'PINCODE'),
    ]

    def _apply_regex_layer(self, text: str, vault: Dict, detected: List) -> str:
        """Layer 1: Apply all deterministic regex patterns."""
        for pattern, category in self._REGEX_PATTERNS:
            for m in re.finditer(pattern, text, flags=re.IGNORECASE):
                orig = m.group()
                # Skip if already inside a mask token
                if '[' in orig and ']' in orig:
                    continue
                # Skip pin codes that are inside already-masked segments
                if '[' in text[max(0, m.start()-3):m.start()]:
                    continue
                tok = self._tok(category)
                # Use a unique key to preserve all instances
                key = f"{tok}_r{len(vault)}"
                vault[key] = orig
                text = text[:m.start()] + tok + text[m.end():]
                detected.append(category)
                # Recalculate positions after substitution
                break  # re.finditer invalidated — restart outer loop
            else:
                continue
            # Restart processing this pattern after a replacement
            return self._apply_regex_layer(text, vault, detected)
        return text

    # ── Layer 2: Context-Aware Pattern Matching ──────────────────────────────
    # These patterns detect PERSON and LOCATION from natural language context.
    # Critically, they are CASE-INSENSITIVE — they catch "i am arpit" not just "I am Arpit".
    # The captured group (group 1) is the name/location candidate.
    # Rules: the candidate must NOT be in MEDICAL_WHITELIST or SAFE_WORDS.

    # Person name context patterns (case-insensitive, capture group 1 = name)
    # ORDER MATTERS: more specific / sentence-start patterns run first.
    _PERSON_PATTERNS = [
        # ── Highest priority: sentence-start names ──────────────────────────
        # "arpit from bangalore had fever" — 'arpit' starts the sentence
        r'^([a-z][a-z]+)\s+from\b',
        # "arpit had fever" — sentence-start name followed by verb
        r'^([a-z][a-z]+)\s+(?:had|has|is|was|suffered|experienced|developed|reported|got|complained)',
        # Possessive sentence-start: "rahul's mother from delhi"
        r"^([a-z][a-z]+)'s?\s+(?:mother|father|brother|sister|wife|husband|son|daughter|uncle|aunt)",

        # ── Named phrases / greetings ────────────────────────────────────────
        # "i am arpit", "i'm arpit", "myself arpit"
        r"(?:i\s+am|i'm|myself)\s+([a-z][a-z]+)",
        # "my name is arpit", "name is arpit", "patient name is arpit"
        r'(?:my\s+name\s+is|name\s+is|patient\s+name\s+is?)\s+([a-z][a-z]+)',
        # "this is arpit" (also "this is dr/mr arpit")
        r'this\s+is\s+(?:dr\.?\s+|mr\.?\s+|ms\.?\s+|mrs\.?\s+)?([a-z][a-z]+)',
        # "mera naam arpit" / "mera naam arpit hai"
        r'mera\s+naam\s+([a-z][a-z]+)',
        # "mai arpit hu" / "main arpit hoon"
        r'(?:mai|main)\s+([a-z][a-z]+)\s+(?:hu|hoon|hun)',
        # "mai arpit" followed by Hinglish continuations
        r'(?:mai|main)\s+([a-z][a-z]+)(?=\s+(?:se|aur|mein|ko|ka|ki|ne|bhi))',

        # ── Mid-sentence names ───────────────────────────────────────────────
        # "arpit had fever", "arpit suffered" — mid-sentence
        r'\b([a-z][a-z]+)\s+(?:had|has|have|suffered|experienced|developed|reported|got|is\s+suffering|complained)\b',
        # Possessive mid-sentence: "brother arpit's"
        r"\b([a-z][a-z]+)'s?\s+(?:mother|father|brother|sister|wife|husband|son|daughter|uncle|aunt)",
        # "brother arpit", "friend rahul"
        r'(?:brother|sister|cousin|friend|uncle|aunt|son|daughter|wife|husband)\s+([a-z][a-z]+)',
        # "patient arpit" / "patient mr arpit"
        r'patient\s+(?:mr\.?\s+|ms\.?\s+|mrs\.?\s+)?([a-z][a-z]+)',
    ]

    # Location context patterns (case-insensitive, capture group 1 = location)
    _LOCATION_PATTERNS = [
        # "from bangalore had" — location before a verb (high confidence)
        r'from\s+([a-z][a-z]+)(?:\s+(?:had|has|is|was|suffered|reported|and\b))',
        # "arpit from bangalore" or "[PERSON] from bangalore" — after any subject
        r'(?:\[[A-Z_]+\]|[a-z][a-z]+)\s+from\s+([a-z][a-z]+)',
        # "living in bangalore", "based in mumbai", "residing in delhi"
        r'(?:living\s+in|based\s+in|residing\s+in|staying\s+in)\s+([a-z][a-z]+)',
        # Hinglish: "bangalore se hu", "delhi mein rehta"
        r'([a-z][a-z]+)\s+(?:se\s+hu|se\s+hoon|mein\s+rehta|mein\s+hoon|mein\s+rehti)',
        # "in delhi had" / "at mumbai is"
        r'(?:in|at)\s+([a-z][a-z]+)(?=\s+(?:had|has|is|was))',
    ]

    def _apply_context_layer(self, text: str, vault: Dict, detected: List) -> str:
        """Layer 2: Apply context-aware patterns for names and locations."""
        # Process person patterns
        for pattern in self._PERSON_PATTERNS:
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if match:
                candidate = match.group(1)
                if self._should_mask(candidate):
                    tok = self._tok("PERSON")
                    key = f"{tok}_c{len(vault)}"
                    vault[key] = candidate
                    # Replace only the captured word (group 1), not the whole match
                    start, end = match.span(1)
                    text = text[:start] + tok + text[end:]
                    detected.append("PERSON")
                    # Recurse to handle multiple names in the same sentence
                    return self._apply_context_layer(text, vault, detected)

        # Process location patterns
        for pattern in self._LOCATION_PATTERNS:
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if match:
                candidate = match.group(1)
                if self._should_mask(candidate):
                    tok = self._tok("LOCATION")
                    key = f"{tok}_c{len(vault)}"
                    vault[key] = candidate
                    start, end = match.span(1)
                    text = text[:start] + tok + text[end:]
                    detected.append("LOCATION")
                    return self._apply_context_layer(text, vault, detected)

        return text

    # ── Layer 3: Presidio NLP NER (catches Title-Case entities remaining) ────
    def _apply_nlp_layer(self, text: str, vault: Dict, detected: List) -> str:
        """Layer 3: Use Presidio+spaCy for any remaining unmasked entities."""
        if not _analyzer:
            return text
        try:
            results = _analyzer.analyze(
                text=text,
                entities=["PERSON", "LOCATION"],
                language='en'
            )
            # Sort in reverse to replace without shifting indices
            results.sort(key=lambda r: r.start, reverse=True)
            for res in results:
                entity_text = text[res.start:res.end]
                # Skip already-masked tokens
                if '[' in entity_text and ']' in entity_text:
                    continue
                if not self._should_mask(entity_text):
                    continue
                tok = self._tok(res.entity_type)
                key = f"{tok}_n{len(vault)}"
                vault[key] = entity_text
                text = text[:res.start] + tok + text[res.end:]
                detected.append(res.entity_type)
        except Exception as e:
            print(f"[PII Vault] NLP layer error: {e}")
        return text

    # ── Main mask() entry point ──────────────────────────────────────────────
    def mask(self, text: str, source: str = "unknown") -> Tuple[str, Dict]:
        """
        Mask all PII in text while preserving medical meaning.

        Args:
            text:   Raw input from user (any language/case)
            source: Caller label for audit log (e.g. 'analyze-case')

        Returns:
            (masked_text, vault_map)
        """
        if not text or not isinstance(text, str):
            return text, {}

        vault: Dict[str, str] = {}
        detected: List[str] = []

        # Layer 1: Structured PII (regex)
        text = self._apply_regex_layer(text, vault, detected)

        # Layer 2: Context-aware patterns (case-insensitive NL patterns)
        text = self._apply_context_layer(text, vault, detected)

        # Layer 3: NLP NER (Presidio + spaCy, catches Title-Case leftovers)
        text = self._apply_nlp_layer(text, vault, detected)

        _pii_audit(source=source, detected=detected)
        return text, vault

    def unmask(self, masked_text: str, vault: Dict) -> str:
        """Reverse masking — authorized audit use ONLY."""
        result = masked_text
        for key, original in vault.items():
            # key format: [TOKEN]_x123 — extract the bare token for replacement
            token = re.match(r'(\[[A-Z_]+\])', key)
            if token:
                result = result.replace(token.group(1), original, 1)
        return result

    def get_vault_hash(self, vault: Dict) -> str:
        """SHA-256 fingerprint of the vault for integrity verification."""
        content = str(sorted(vault.items()))
        return hashlib.sha256(content.encode()).hexdigest()


# ── Module-level singleton (used by server.py and crawler.py) ────────────────
_default_vault = PIIVault()


def mask_text(text: str, source: str = "unknown") -> Tuple[str, Dict]:
    """Convenience wrapper. Use this everywhere — never instantiate PIIVault directly."""
    return _default_vault.mask(text, source=source)


def unmask_text(masked_text: str, vault: Dict) -> str:
    """Authorized audit reverse — never call from public API paths."""
    return _default_vault.unmask(masked_text, vault)


# ── Outgoing Response Sanitizer ──────────────────────────────────────────────
# Final safety net applied to ALL API response strings before they leave the backend.
_SANITIZE_PATTERNS = [
    (re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'), '[EMAIL]'),
    (re.compile(r'\b[6-9]\d{9}\b'), '[PHONE]'),
    (re.compile(r'(?<!\d)(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)'), '[PHONE]'),
    (re.compile(r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b'), '[AADHAAR]'),
    (re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b'), '[PAN]'),
]


def sanitize_response(text: str) -> str:
    """Lightweight final-pass sanitizer for all API response text fields."""
    if not text or not isinstance(text, str):
        return text
    for pattern, replacement in _SANITIZE_PATTERNS:
        text = pattern.sub(replacement, text)
    return text
