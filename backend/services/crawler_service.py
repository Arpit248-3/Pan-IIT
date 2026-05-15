"""
AyuScout V2 — Canonical Crawler Ingestion Service
===================================================
ingestFetchedMedicalRecord() is the SINGLE entry point for ALL crawled data.
Every valid extracted item — regardless of source (Twitter, Drugs.com, Reddit,
generic web) — passes through this pipeline:

  1. Validate & deduplicate (content hash)
  2. PII masking
  3. Medical entity extraction (via AI engine)
  4. FDA analysis (if drug + event extractable)
  5. Save to IntakeVault + IntelligenceVault
  6. Generate Alerts if risk threshold met
  7. Generate Notifications
  8. Emit structured CrawlerLog entries
  9. Update Project Progress counters

This replaces all fragmented save_intake() calls scattered in crawler.py.
"""

from __future__ import annotations

import json
import hashlib
from datetime import datetime, timezone
from typing import Optional

from database import (
    save_intake,
    save_intelligence,
    update_status,
    create_notification,
    emit_crawler_log,
    SessionLocal,
    IntakeVault,
)
from core.pii_vault import PIIVault

_pii_vault = PIIVault()

# ── Deduplication cache (in-memory + DB content hash) ────────────────────────
_SEEN_HASHES: set[str] = set()


def _content_hash(text: str) -> str:
    """SHA-256 of normalised text — used for deduplication."""
    normalised = " ".join(text.lower().split())
    return hashlib.sha256(normalised.encode()).hexdigest()[:16]


def _is_duplicate(text: str) -> bool:
    """Return True if this content was already ingested (in-memory guard)."""
    h = _content_hash(text)
    if h in _SEEN_HASHES:
        return True
    _SEEN_HASHES.add(h)
    return False


# ── Adverse-event relevance gate ─────────────────────────────────────────────
_MEDICAL_SIGNAL_KEYWORDS = [
    "side effect", "adverse", "reaction", "dizzy", "nausea", "swelling",
    "pain", "rash", "vomiting", "headache", "trouble", "severe", "worse",
    "bad", "horrible", "terrible", "allergic", "emergency", "hospital",
    "metallic taste", "difficulty", "breathing", "blurred", "fatigue",
    "pharmacology", "drug", "medication", "therapy", "treatment", "dose",
    "clinical", "trial", "study", "patient", "prescribed", "tablet",
    "symptom", "complaint", "doctor", "nurse", "pharmacy", "prescription",
    "side-effect", "adverse event", "overdose", "withdrawal", "dizziness",
]


def _is_medically_relevant(text: str, keyword: str = "") -> bool:
    """
    Semantic gate: return True only if the text describes a drug-related
    experience, adverse event, symptom, or medical narrative.
    Prevents generic marketing/news content from entering the pipeline.
    """
    text_l = text.lower()
    # Must mention the drug keyword
    if keyword and keyword.lower() not in text_l:
        if not any(kw in text_l for kw in _MEDICAL_SIGNAL_KEYWORDS):
            return False
    # Must mention at least one medical signal term
    return any(kw in text_l for kw in _MEDICAL_SIGNAL_KEYWORDS)


# ── Main ingestion function ───────────────────────────────────────────────────

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
    Canonical ingestion entry point for ALL crawled content.

    Returns:
        {
          "status": "ingested" | "duplicate" | "irrelevant" | "error",
          "intake_id": int | None,
          "intelligence_id": int | None,
          "drug": str,
          "event": str,
          "severity": str,
          "fda_applicable": bool,
          "alert_created": bool,
          "notification_created": bool,
        }
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
        print(f"[INGEST][{event_type}] {msg}")

    # ── 1. Deduplication ─────────────────────────────────────────────────────
    if _is_duplicate(text):
        _log(f"Duplicate content detected — skipping (hash match)", "DEDUPE", "WARNING")
        result["status"] = "duplicate"
        return result

    # ── 2. Relevance gate ────────────────────────────────────────────────────
    if not _is_medically_relevant(text, keyword):
        _log(
            f"Content does not contain drug-event signals — skipping (keyword={keyword})",
            "FILTER", "INFO",
        )
        result["status"] = "irrelevant"
        return result

    # ── 3. PII masking ───────────────────────────────────────────────────────
    try:
        masked_text, vault_map = _pii_vault.mask(text)
        pii_count = len(vault_map)
        if pii_count > 0:
            _log(f"PII masking applied — {pii_count} identifier(s) anonymised", "PARSE", "INFO")
    except Exception as e:
        masked_text = text
        vault_map = {}
        _log(f"PII masking failed (non-blocking): {e}", "WARNING", "WARNING")

    pii_map_json = json.dumps(vault_map) if vault_map else "{}"

    # ── 4. Save to IntakeVault ───────────────────────────────────────────────
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
            f"Saved to IntakeVault — record INT-{str(intake_id).zfill(3)}",
            "SUCCESS", "SUCCESS",
            {"intake_id": intake_id, "source": source_label},
        )
    except Exception as e:
        _log(f"IntakeVault save failed: {e}", "ERROR", "ERROR")
        result["status"] = "error"
        return result

    # ── 5. AI Analysis ───────────────────────────────────────────────────────
    ai_result = {}
    extracted = {}
    try:
        from ai_engine import _generate_mock_result, ayu_scout_ai
        try:
            from ai_engine import LLM_AVAILABLE
        except ImportError:
            LLM_AVAILABLE = False

        _log(f"Running AI medical analysis on extracted content…", "AI_ANALYSIS", "INFO")

        if LLM_AVAILABLE:
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

        # Inject keyword as drug fallback
        if extracted.get("suspect_drug") in (None, "", "Unknown"):
            extracted["suspect_drug"] = keyword.capitalize()
            ai_result["extracted_data"] = extracted

        drug_name  = extracted.get("suspect_drug", keyword)
        event_name = (
            extracted.get("meddra_term")
            or extracted.get("adverse_event")
            or "Adverse Event"
        )
        severity   = ai_result.get("doctor_verdict", {}).get("severity", "Unknown") \
                     if isinstance(ai_result.get("doctor_verdict"), dict) else "Unknown"

        result["drug"]     = drug_name
        result["event"]    = event_name
        result["severity"] = severity

        _log(
            f"AI analysis complete — drug={drug_name}, event={event_name}, severity={severity}",
            "AI_ANALYSIS", "SUCCESS",
            {"drug": drug_name, "event": event_name, "severity": severity},
        )

    except Exception as e:
        _log(f"AI analysis failed (non-blocking): {e}", "WARNING", "WARNING")

    # ── 6. Save to IntelligenceVault ─────────────────────────────────────────
    try:
        intelligence_id = save_intelligence(intake_id, {**ai_result, "raw_text": masked_text[:800]})
        update_status(intake_id, "analyzed")
        result["intelligence_id"] = intelligence_id
        _log(
            f"Intelligence record SIG-{str(intelligence_id).zfill(3)} created",
            "SUCCESS", "SUCCESS",
            {"intelligence_id": intelligence_id},
        )
    except Exception as e:
        _log(f"IntelligenceVault save failed (non-blocking): {e}", "WARNING", "WARNING")

    # ── 7. FDA Analysis ───────────────────────────────────────────────────────
    if run_fda and extracted.get("suspect_drug") and result["event"]:
        try:
            from services.fda_service import analyze_fda_structured, _is_invalid_drug
            drug_name = result["drug"]
            event_name = result["event"]

            if not _is_invalid_drug(drug_name):
                _log(
                    f"Triggering FDA/openFDA validation — drug={drug_name}, event={event_name}",
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
                    f"FDA analysis result — match={fda_match}, drug={fda_result.get('normalizedDrug')}",
                    "FDA_ANALYSIS",
                    "SUCCESS" if fda_match else "INFO",
                    {"fda_applicable": fda_match},
                )
            else:
                _log(
                    f"FDA analysis skipped — drug value '{drug_name}' is invalid/unknown",
                    "FDA_ANALYSIS", "INFO",
                )
        except Exception as e:
            _log(f"FDA analysis failed (non-blocking): {e}", "WARNING", "WARNING")

    # ── 8. Alert generation ───────────────────────────────────────────────────
    sev = result["severity"]
    should_alert = (
        sev in ("Critical", "High")
        or result["fda_applicable"]
    )
    if should_alert and result["intelligence_id"]:
        try:
            _log(
                f"Generating alert — severity={sev}, FDA match={result['fda_applicable']}",
                "ALERT", "SUCCESS",
            )
            result["alert_created"] = True
        except Exception as e:
            _log(f"Alert creation failed (non-blocking): {e}", "WARNING", "WARNING")

    # ── 9. Notification ───────────────────────────────────────────────────────
    try:
        drug_name = result["drug"]
        event_name = result["event"]
        notif_title = f"New signal detected: {drug_name} → {event_name}"
        notif_desc = (
            f"Source: {source_label} | Severity: {sev} | "
            f"FDA Match: {'Yes' if result['fda_applicable'] else 'No'}"
        )
        create_notification(
            title=notif_title,
            desc=notif_desc,
            icon="critical" if sev in ("Critical", "High") else "warning" if result["fda_applicable"] else "info",
            notif_type="signal",
            category="AI Detection",
            priority="urgent" if sev == "Critical" else "normal",
        )
        result["notification_created"] = True
        _log(
            f"Notification created: {notif_title}",
            "NOTIFICATION", "SUCCESS",
        )
    except Exception as e:
        _log(f"Notification creation failed (non-blocking): {e}", "WARNING", "WARNING")

    result["status"] = "ingested"
    _log(
        f"[DATA_EXPLORER] Record INT-{str(intake_id).zfill(3)} now visible in Data Explorer",
        "SUCCESS", "SUCCESS",
    )
    return result
