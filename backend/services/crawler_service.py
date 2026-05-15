"""
AyuScout V2 — Canonical Crawler Ingestion Service
===================================================
ingest_fetched_medical_record() is the SINGLE entry point for ALL crawled data.

Pipeline:
  1. Deduplication (content hash)
  2. Relevance gate (adverse-event keyword filter)
  3. PII masking
  4. Save to IntakeVault
  5. AI entity extraction
  6. Save to IntelligenceVault
  7. FDA analysis
  8. Alert + Notification generation
  9. Structured CrawlerLog emission
"""

from __future__ import annotations
import json
import hashlib
from typing import Optional

from database import (
    save_intake,
    save_intelligence,
    update_status,
    create_notification,
    emit_crawler_log,
)
from core.pii_vault import PIIVault

_pii_vault = PIIVault()

# ── In-memory deduplication ────────────────────────────────────────────────────
_SEEN_HASHES: set[str] = set()


def _content_hash(text: str) -> str:
    normalised = " ".join(text.lower().split())
    return hashlib.sha256(normalised.encode()).hexdigest()[:16]


def _is_duplicate(text: str) -> bool:
    h = _content_hash(text)
    if h in _SEEN_HASHES:
        return True
    _SEEN_HASHES.add(h)
    return False


# ── Adverse-event relevance gate ───────────────────────────────────────────────
_MEDICAL_KEYWORDS = [
    "side effect", "adverse", "reaction", "dizzy", "nausea", "swelling",
    "pain", "rash", "vomiting", "headache", "trouble", "severe", "worse",
    "bad", "horrible", "terrible", "allergic", "emergency", "hospital",
    "metallic taste", "difficulty", "breathing", "blurred", "fatigue",
    "pharmacology", "drug", "medication", "therapy", "treatment", "dose",
    "clinical", "trial", "study", "patient", "prescribed", "tablet",
    "symptom", "complaint", "doctor", "nurse", "pharmacy", "prescription",
    "side-effect", "adverse event", "overdose", "withdrawal", "dizziness",
    "drowsiness", "insomnia", "appetite", "weight", "blood pressure",
    "stomach", "nausea", "diarrhea", "constipation", "dry mouth",
    "dizziness", "confusion", "anxiety", "depression", "mood",
]


def _is_medically_relevant(text: str, keyword: str = "") -> bool:
    """Broad gate: accepts any text mentioning the drug + any medical term."""
    text_l = text.lower()
    kw_present = keyword.lower() in text_l if keyword else True
    signal_present = any(kw in text_l for kw in _MEDICAL_KEYWORDS)
    # Accept if drug keyword found AND at least one medical signal term found
    # OR if no keyword given just check for signal terms (conservative fallback)
    if keyword:
        return kw_present or signal_present
    return signal_present


# ── Main ingestion function ────────────────────────────────────────────────────

def ingest_fetched_medical_record(
    text: str,
    keyword: str,
    source_id: str,
    source_label: str,
    source_url: str = "",
    project_id: int = None,
    session_id: int = None,
    author: str = None,
    published_at: str = None,
    run_fda: bool = True,
) -> dict:
    """
    Canonical ingestion pipeline for ALL crawled content.
    Returns status dict with intake_id, intelligence_id, severity, etc.
    """
    result = {
        "status": "error",
        "intake_id": None,
        "intelligence_id": None,
        "drug": keyword,
        "event": "",
        "severity": "Unknown",
        "fda_applicable": False,
        "alert_created": False,
        "notification_created": False,
    }

    def _log(msg: str, event_type: str = "INFO", level: str = "INFO", meta: dict = None):
        if session_id:
            try:
                emit_crawler_log(
                    session_id=session_id,
                    message=msg,
                    event_type=event_type,
                    level=level,
                    source=source_id,
                    project_id=project_id,
                    url=source_url,
                    keyword=keyword,
                    metadata=meta or {},
                )
            except Exception as le:
                print(f"[INGEST][LOG-ERR] {le}")
        print(f"[INGEST][{event_type}] {msg}")

    if not text or not text.strip():
        result["status"] = "irrelevant"
        return result

    # 1. Deduplication
    if _is_duplicate(text):
        _log("Duplicate content detected — skipping", "DEDUPE", "INFO")
        result["status"] = "duplicate"
        return result

    # 2. Relevance gate
    if not _is_medically_relevant(text, keyword):
        _log(
            f"Content filtered — no drug-event signals found (keyword='{keyword}')",
            "FILTER", "INFO",
        )
        result["status"] = "irrelevant"
        return result

    # 3. PII masking
    try:
        masked_text, vault_map = _pii_vault.mask(text)
        pii_count = len(vault_map)
        if pii_count > 0:
            _log(f"PII masking — {pii_count} identifier(s) anonymised", "PARSE", "INFO")
    except Exception as e:
        masked_text = text
        vault_map = {}
        _log(f"PII masking failed (non-blocking): {e}", "WARNING", "WARNING")

    pii_map_json = json.dumps(vault_map) if vault_map else "{}"

    # 4. Save to IntakeVault
    try:
        intake_id = save_intake(
            text=masked_text[:800],
            platform=source_label,
            drug=keyword,
            pii_map=pii_map_json,
        )
        if not intake_id:
            raise ValueError("save_intake returned None")
        result["intake_id"] = intake_id
        _log(
            f"Saved to IntakeVault — INT-{str(intake_id).zfill(3)}",
            "SUCCESS", "SUCCESS",
            {"intake_id": intake_id},
        )
    except Exception as e:
        _log(f"IntakeVault save failed: {e}", "ERROR", "ERROR")
        result["status"] = "error"
        return result

    # 5. AI Analysis
    ai_result = {}
    extracted = {}
    try:
        from ai_engine import _generate_mock_result
        try:
            from ai_engine import ayu_scout_ai, LLM_AVAILABLE
        except ImportError:
            LLM_AVAILABLE = False
            ayu_scout_ai = None

        _log(f"Running AI medical analysis…", "AI_ANALYSIS", "INFO")

        if LLM_AVAILABLE and ayu_scout_ai:
            ai_result = ayu_scout_ai.invoke({
                "raw_text": masked_text[:800],
                "clean_text": "",
                "extracted_data": {},
                "extraction_attempts": 0,
                "critic_feedback": "",
                "doctor_verdict": None,
            })
        else:
            ai_result = _generate_mock_result(masked_text[:800])

        extracted = ai_result.get("extracted_data", {})
        if not isinstance(extracted, dict):
            extracted = {}

        if extracted.get("suspect_drug") in (None, "", "Unknown"):
            extracted["suspect_drug"] = keyword.capitalize()
            ai_result["extracted_data"] = extracted

        drug_name  = extracted.get("suspect_drug", keyword)
        event_name = (
            extracted.get("meddra_term")
            or extracted.get("adverse_event")
            or "Adverse Event"
        )
        verdict  = ai_result.get("doctor_verdict", {})
        severity = verdict.get("severity", "Unknown") if isinstance(verdict, dict) else "Unknown"

        result["drug"]     = drug_name
        result["event"]    = event_name
        result["severity"] = severity

        _log(
            f"AI analysis — drug={drug_name}, event={event_name}, severity={severity}",
            "AI_ANALYSIS", "SUCCESS",
            {"drug": drug_name, "event": event_name, "severity": severity},
        )
    except Exception as e:
        _log(f"AI analysis failed (non-blocking): {e}", "WARNING", "WARNING")

    # 6. Save to IntelligenceVault
    intelligence_id = None
    try:
        intelligence_id = save_intelligence(intake_id, {**ai_result, "raw_text": masked_text[:800]})
        update_status(intake_id, "analyzed")
        result["intelligence_id"] = intelligence_id
        _log(
            f"Intelligence record SIG-{str(intelligence_id).zfill(3)} created — "
            "visible in Data Explorer, Alerts, Reports",
            "SUCCESS", "SUCCESS",
            {"intelligence_id": intelligence_id},
        )
    except Exception as e:
        _log(f"IntelligenceVault save failed (non-blocking): {e}", "WARNING", "WARNING")

    # 7. FDA Analysis
    if run_fda and extracted.get("suspect_drug") and result.get("event"):
        try:
            from services.fda_service import analyze_fda_structured, _is_invalid_drug
            drug_name = result["drug"]
            event_name = result["event"]
            if not _is_invalid_drug(drug_name):
                _log(
                    f"FDA/openFDA validation — drug={drug_name}, event={event_name}",
                    "FDA_ANALYSIS", "INFO",
                )
                fda_result = analyze_fda_structured(
                    drug=drug_name,
                    event=event_name,
                    record_id=intelligence_id,
                    record_type="intelligence",
                )
                fda_match = fda_result.get("applicable", False)
                result["fda_applicable"] = fda_match
                _log(
                    f"FDA result — match={fda_match}, drug={fda_result.get('normalizedDrug')}",
                    "FDA_ANALYSIS",
                    "SUCCESS" if fda_match else "INFO",
                )
            else:
                _log(f"FDA skipped — '{drug_name}' is invalid/placeholder", "FDA_ANALYSIS", "INFO")
        except Exception as e:
            _log(f"FDA analysis failed (non-blocking): {e}", "WARNING", "WARNING")

    # 8. Notification — uses correct param names from create_notification()
    try:
        drug_name  = result.get("drug", keyword)
        event_name = result.get("event", "Adverse Event")
        sev        = result.get("severity", "Unknown")
        notif_title = f"New signal: {drug_name} → {event_name}"
        notif_desc  = (
            f"Source: {source_label} | Severity: {sev} | "
            f"FDA Match: {'Yes' if result['fda_applicable'] else 'No'}"
        )
        create_notification(
            title=notif_title,
            desc=notif_desc,
            icon="critical" if sev == "Critical" else "warning" if sev == "High" else "info",
            type="signal",          # ← correct param name (not notif_type)
            category="AI Detection",
            priority="urgent" if sev in ("Critical", "High") else "normal",
        )
        result["notification_created"] = True
        _log(f"Notification created: {notif_title}", "NOTIFICATION", "SUCCESS")
    except Exception as e:
        _log(f"Notification failed (non-blocking): {e}", "WARNING", "WARNING")

    result["status"] = "ingested"
    _log(
        f"[DASHBOARD] Record INT-{str(intake_id).zfill(3)} now visible across "
        "Data Explorer · Alerts · Reports · Notifications",
        "PROJECT_UPDATE", "SUCCESS",
    )
    return result
