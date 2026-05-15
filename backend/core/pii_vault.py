"""
AyuScout V2 — PII Vault (Production Hardened)
==============================================
Deterministic PII masking engine for pharmacovigilance data.
Masks: Names, Emails, Phone Numbers (Indian + International),
       Street Addresses (Indian + Western), Aadhaar, PAN,
       Ages — while preserving ALL medical terminology.

Compliant with:
  - DPDP Act 2023 (India)
  - ICH E6(R2) GCP guidelines on patient privacy
  - ICH E2B pharmacovigilance reporting standards

PII Audit logging: [PII AUDIT] lines are written to stdout
so they appear in server logs for compliance review.
"""

import re
import hashlib
import logging
from typing import Tuple

# ── Audit logger ────────────────────────────────────────────────
_audit_logger = logging.getLogger("pii_audit")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def _pii_audit(source: str, detected: list, status: str = "MASKED"):
    """Emit a PII audit log line."""
    if detected:
        detected_str = ",".join(detected)
        _audit_logger.info(
            f"[PII AUDIT] Source={source} Detected={detected_str} Status={status}"
        )


# ── Medical terms whitelist — NEVER masked ───────────────────────
MEDICAL_WHITELIST = {
    # Common drugs
    "metformin", "lisinopril", "atorvastatin", "insulin", "omeprazole",
    "amoxicillin", "ibuprofen", "aspirin", "paracetamol", "acetaminophen",
    "warfarin", "clopidogrel", "amlodipine", "losartan", "hydrochlorothiazide",
    "simvastatin", "gabapentin", "tramadol", "prednisone", "levothyroxine",
    "ciprofloxacin", "azithromycin", "pantoprazole", "sertraline", "fluoxetine",
    "diazepam", "alprazolam", "morphine", "codeine", "naproxen", "doxycycline",
    "cetirizine", "loratadine", "metoprolol", "atenolol", "ramipril",
    "furosemide", "prednisolone", "fluoxetine", "gabapentin", "pregabalin",
    "rosuvastatin", "glipizide", "hydroxychloroquine", "tamoxifen",
    "semaglutide", "ozempic", "jardiance", "empagliflozin", "liraglutide",
    # Common adverse events / symptoms
    "nausea", "dizziness", "headache", "rash", "angioedema", "vomiting",
    "diarrhea", "fatigue", "insomnia", "anxiety", "depression", "seizure",
    "tachycardia", "bradycardia", "hypotension", "hypertension", "edema",
    "hepatotoxicity", "nephrotoxicity", "anaphylaxis", "dyspnea", "cough",
    "myalgia", "arthralgia", "pruritus", "urticaria", "alopecia",
    "thrombocytopenia", "neutropenia", "pancytopenia", "hyperglycemia",
    "hypoglycemia", "swelling", "metallic", "taste", "itching", "fever",
    "chills", "tremor", "palpitation", "jaundice", "constipation",
    # Medical / dosage terms
    "mg", "ml", "tablet", "capsule", "injection", "oral", "iv", "bp",
    "blood", "pressure", "sugar", "cholesterol", "liver", "kidney",
    "heart", "lung", "brain", "stomach", "intestine", "platelet",
    "creatinine", "bilirubin", "hemoglobin", "sodium", "potassium",
}


class PIIVault:
    """
    Production-grade deterministic PII masking engine.

    Masks PII entities and replaces them with unique identifiers.
    Maintains a vault dictionary for authorized de-masking.
    Emits [PII AUDIT] log lines for compliance.
    """

    def __init__(self):
        self._counter = {
            "USER": 0, "PHONE": 0, "EMAIL": 0,
            "ADDR": 0, "AADHAAR": 0, "PAN": 0,
        }

    def _tok(self, category: str) -> str:
        """Generate next token like [USER_001]."""
        self._counter[category] += 1
        return f"[{category}_{self._counter[category]:03d}]"

    def _is_medical(self, word: str) -> bool:
        return word.lower().strip() in MEDICAL_WHITELIST

    # ────────────────────────────────────────────────────────────
    def mask(self, text: str, source: str = "unknown") -> Tuple[str, dict]:
        """
        Mask PII in text, preserving medical terms.

        Args:
            text:   Raw input text
            source: Caller label for audit log (e.g. 'Twitter', 'analyze-case')

        Returns:
            (masked_text, vault_map)
        """
        vault_map: dict = {}
        t = text
        detected: list = []

        # ── 1. Emails (must run before name scan) ──────────────
        email_rx = r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'
        for m in re.finditer(email_rx, t):
            orig = m.group()
            tok = self._tok("EMAIL")
            vault_map[tok] = orig
            t = t.replace(orig, tok, 1)
        if "EMAIL" in str(vault_map):
            detected.append("EMAIL")

        # ── 2. Aadhaar (12-digit, spaced or plain) ─────────────
        aadhaar_rx = r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b'
        for m in re.finditer(aadhaar_rx, t):
            orig = m.group()
            if '[' in orig:
                continue
            tok = self._tok("AADHAAR")
            vault_map[tok] = orig
            t = t.replace(orig, tok, 1)
        if any(k.startswith("[AADHAAR") for k in vault_map):
            detected.append("AADHAAR")

        # ── 3. PAN card (AAAAA9999A format) ────────────────────
        pan_rx = r'\b[A-Z]{5}[0-9]{4}[A-Z]\b'
        for m in re.finditer(pan_rx, t):
            orig = m.group()
            tok = self._tok("PAN")
            vault_map[tok] = orig
            t = t.replace(orig, tok, 1)
        if any(k.startswith("[PAN") for k in vault_map):
            detected.append("PAN")

        # ── 4. Indian mobile numbers (starts 6-9, 10 digits) ───
        indian_mobile_rx = r'\b[6-9]\d{9}\b'
        for m in re.finditer(indian_mobile_rx, t):
            orig = m.group()
            if '[' in orig:
                continue
            tok = self._tok("PHONE")
            vault_map[tok] = orig
            t = t.replace(orig, tok, 1)

        # ── 5. International / formatted phone numbers ──────────
        intl_phone_rx = r'(?<!\d)(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)'
        for m in re.finditer(intl_phone_rx, t):
            orig = m.group().strip()
            if '[' in orig or len(re.sub(r'\D', '', orig)) < 7:
                continue
            tok = self._tok("PHONE")
            vault_map[tok] = orig
            t = t.replace(orig, tok, 1)
        if any(k.startswith("[PHONE") for k in vault_map):
            detected.append("PHONE")

        # ── 6. Indian street addresses ──────────────────────────
        # Matches: "45 MG Road Bangalore", "12 Anna Salai Chennai",
        #          "Plot 7 Sector 18 Noida", "B-203 Vasant Kunj"
        indian_addr_rx = (
            r'\b(?:\d+[\-/]?\d*\s+)?'                     # optional number prefix
            r'[A-Z][A-Za-z\s\-\.]{2,40}'                  # area/street name
            r'(?:Road|Rd|Nagar|Colony|Marg|Street|St|'
            r'Lane|Ln|Layout|Extension|Ext|Cross|Main|'
            r'Phase|Sector|Block|Vihar|Enclave|Park|'
            r'Bagh|Ganj|Chowk|Bazaar|Puram|Pur|Wadi)'
            r'(?:\s+[A-Z][a-z]+)*'                        # optional city/district
            r'\b'
        )
        for m in re.finditer(indian_addr_rx, t):
            orig = m.group().strip()
            if '[' in orig or len(orig) < 8:
                continue
            # Don't mask if it's purely medical terms
            words = orig.split()
            if all(self._is_medical(w) for w in words):
                continue
            tok = self._tok("ADDR")
            vault_map[tok] = orig
            t = t.replace(orig, tok, 1)

        # ── 7. Western addresses (fallback) ────────────────────
        western_addr_rx = (
            r'\d{1,5}\s+(?:[A-Z][a-z]+\s*){1,3}'
            r'(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|'
            r'Court|Ct|Way|Place|Pl|Highway|Hwy|Freeway|Pkwy)\.?'
        )
        for m in re.finditer(western_addr_rx, t):
            orig = m.group().strip()
            if '[' in orig:
                continue
            tok = self._tok("ADDR")
            vault_map[tok] = orig
            t = t.replace(orig, tok, 1)
        if any(k.startswith("[ADDR") for k in vault_map):
            detected.append("ADDR")

        # ── 8. Person names (2+ consecutive Title-Case words) ──
        # Runs AFTER phone/email/addr so digits are already replaced
        name_rx = r'(?:(?<=\s)|(?<=,)|(?<=^))([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)'
        for m in re.finditer(name_rx, t):
            orig = m.group().strip()
            if '[' in orig:
                continue
            words = orig.split()
            if any(self._is_medical(w) for w in words):
                continue
            tok = self._tok("USER")
            vault_map[tok] = orig
            t = t.replace(orig, tok, 1)
        if any(k.startswith("[USER") for k in vault_map):
            detected.append("NAME")

        # ── 9. Age patterns ─────────────────────────────────────
        age_rx = r'\b(?:age\s+)?(\d{1,3})\s*(?:years?\s*old|y/?o)\b'
        t = re.sub(age_rx, '[AGE_REDACTED]', t, flags=re.IGNORECASE)

        # ── Emit audit log ──────────────────────────────────────
        _pii_audit(source=source, detected=detected)

        return t, vault_map

    def unmask(self, masked_text: str, vault_map: dict) -> str:
        """
        Reverse masking for authorized audit use ONLY.
        De-masking is restricted — see security policy.
        """
        result = masked_text
        for token, original in vault_map.items():
            result = result.replace(token, original)
        return result

    def get_vault_hash(self, vault_map: dict) -> str:
        """SHA-256 hash of vault_map for integrity verification."""
        content = str(sorted(vault_map.items()))
        return hashlib.sha256(content.encode()).hexdigest()


# ── Module-level singleton ────────────────────────────────────────
_default_vault = PIIVault()


def mask_text(text: str, source: str = "unknown") -> Tuple[str, dict]:
    """Convenience wrapper using the default vault instance."""
    return _default_vault.mask(text, source=source)


def unmask_text(masked_text: str, vault_map: dict) -> str:
    """Convenience wrapper — authorized audit use only."""
    return _default_vault.unmask(masked_text, vault_map)


# ── Outgoing API response sanitizer ─────────────────────────────
# Final safety net: strips any raw PII patterns that might have
# leaked from LLM-generated text before it leaves the backend.
_SANITIZE_PATTERNS = [
    # Emails
    (re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'), '[EMAIL_REDACTED]'),
    # Indian mobile
    (re.compile(r'\b[6-9]\d{9}\b'), '[PHONE_REDACTED]'),
    # International phone
    (re.compile(r'(?<!\d)(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)'), '[PHONE_REDACTED]'),
    # Aadhaar
    (re.compile(r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b'), '[AADHAAR_REDACTED]'),
    # PAN
    (re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b'), '[PAN_REDACTED]'),
]


def sanitize_response(text: str) -> str:
    """
    Lightweight outgoing response sanitizer.
    Strips emails, phones, Aadhaar, PAN from any string.
    Does NOT aggressively mask names (backend PIIVault is source of truth for those).
    Use on all API response fields that may contain LLM-generated text.
    """
    if not text or not isinstance(text, str):
        return text
    for pattern, replacement in _SANITIZE_PATTERNS:
        text = pattern.sub(replacement, text)
    return text
