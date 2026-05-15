"""
AyuScout V2 — FDA Analysis Routes
===================================
Endpoints:
  POST /api/fda/analyze                    — free-text analysis (no DB persist)
  POST /api/fda/analyze-record/{id}        — intelligence vault record (DB persist)
  POST /api/fda/analyze-intake/{id}        — intake vault record (DB persist)
  POST /api/fda/analyze-batch              — batch intelligence records (DB persist)

All calls use only real openFDA APIs. OPENFDA_API_KEY is optional.
PII safety: all endpoints operate on sanitized/masked data only.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from services.fda_service import (
    analyze_fda,
    analyze_fda_structured,
    _is_invalid_drug,
    _insufficient_data_result,
    INVALID_DRUG_VALUES,
)

router = APIRouter(prefix="/api/fda", tags=["FDA"])


# ── Request models ─────────────────────────────────────────────────────────────

class FDAAnalyzeRequest(BaseModel):
    text: str
    drug: Optional[str] = None
    symptoms: Optional[List[str]] = None


class FDABatchRequest(BaseModel):
    record_ids: List[int]
    record_type: str = "intelligence"   # "intelligence" | "intake"


# ── Helper: lazy DB imports (avoids circular imports at module load) ───────────

def _get_db_helpers():
    from database import (
        SessionLocal, IntelligenceVault, IntakeVault,
        update_fda_analysis_for_intelligence,
        update_fda_analysis_for_intake,
        sanitize_pii_for_display,
    )
    return (SessionLocal, IntelligenceVault, IntakeVault,
            update_fda_analysis_for_intelligence,
            update_fda_analysis_for_intake,
            sanitize_pii_for_display)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def fda_analyze(req: FDAAnalyzeRequest):
    """
    Free-text FDA adverse event analysis.
    Does NOT persist to DB — caller provides sanitized text directly.
    """
    try:
        result = analyze_fda(
            text=req.text,
            drug_hint=req.drug,
            symptoms_hint=req.symptoms if req.symptoms else None,
        )
        return {"status": "success", "fdaAnalysis": result}
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "fdaAnalysis": _error_fda_obj(),
        }


@router.post("/analyze-record/{record_id}")
async def fda_analyze_record(record_id: int):
    """
    Analyze a specific IntelligenceVault record by its ID.
    Uses the already-extracted drug + event fields (bypasses relation detection).
    Persists result to fda_analysis_json column on the record.
    """
    (SessionLocal, IntelligenceVault, IntakeVault,
     update_intel, update_intake, sanitize) = _get_db_helpers()

    # Load the record
    session = SessionLocal()
    try:
        r = session.query(IntelligenceVault).filter(
            IntelligenceVault.id == record_id
        ).first()
        if not r:
            raise HTTPException(status_code=404, detail=f"Record {record_id} not found")

        drug  = r.drug  or ""
        event = r.event or ""
        intake_id = r.intake_id
    finally:
        session.close()

    if not drug or drug.strip().lower() in INVALID_DRUG_VALUES:
        return {
            "status": "skipped",
            "reason": "Drug is Unknown or missing — FDA analysis requires a valid drug name.",
            "fdaAnalysis": _insufficient_data_result(
                __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
                raw_drug=drug or "",
                record_id=record_id,
                record_type="intelligence",
            ),
        }

    # Run structured FDA analysis (no relation-detection)
    try:
        fda_result = analyze_fda_structured(
            drug=drug,
            event=event,
            record_id=record_id,
            record_type="intelligence",
        )
    except Exception as e:
        return {"status": "error", "message": str(e), "fdaAnalysis": _error_fda_obj()}

    # Persist to intelligence record
    update_intel(record_id, fda_result)

    # Also persist to linked intake record if available
    if intake_id:
        update_intake(intake_id, fda_result)

    return {
        "status": "success",
        "record_id": record_id,
        "drug": drug,
        "event": event,
        "fdaAnalysis": fda_result,
    }


@router.post("/analyze-intake/{intake_id}")
async def fda_analyze_intake(intake_id: int):
    """
    Analyze a specific IntakeVault record by its ID.
    Prefers structured drug+event from linked IntelligenceVault if available;
    falls back to free-text analysis of the masked raw_text.
    Persists result to fda_analysis_json on the intake record.
    """
    (SessionLocal, IntelligenceVault, IntakeVault,
     update_intel, update_intake, sanitize) = _get_db_helpers()

    session = SessionLocal()
    try:
        intake = session.query(IntakeVault).filter(
            IntakeVault.id == intake_id
        ).first()
        if not intake:
            raise HTTPException(status_code=404, detail=f"Intake {intake_id} not found")

        raw_text     = intake.raw_text   or ""
        drug_keyword = intake.drug_keyword or ""

        # Try to get structured drug+event from linked intelligence record
        intel = session.query(IntelligenceVault).filter(
            IntelligenceVault.intake_id == intake_id
        ).first()

        intel_id    = intel.id    if intel else None
        intel_drug  = intel.drug  if intel else None
        intel_event = intel.event if intel else None
    finally:
        session.close()

    # Strategy 1: structured analysis using AI-extracted fields (preferred path)
    # Requires BOTH a valid drug AND a valid event from the intelligence record.
    if (
        intel_drug and intel_drug.strip().lower() not in INVALID_DRUG_VALUES
        and intel_event and intel_event.strip().lower() not in ("", "unknown", "adverse event")
    ):
        try:
            fda_result = analyze_fda_structured(
                drug=intel_drug,
                event=intel_event,
                record_id=intake_id,
                record_type="intake",
            )
        except Exception as e:
            from datetime import datetime, timezone
            fda_result = _insufficient_data_result(
                datetime.now(timezone.utc).isoformat(),
                raw_drug=intel_drug,
                record_id=intake_id,
                record_type="intake",
            )

    # Strategy 2: free-text analysis on the masked content
    # Only used when intelligence record has no valid drug/event.
    # Uses relation detection to prevent treatment-pattern false positives.
    elif drug_keyword and drug_keyword.strip().lower() not in INVALID_DRUG_VALUES:
        safe_text = sanitize(raw_text[:400]) if raw_text else ""
        try:
            fda_result = analyze_fda(
                text=safe_text,
                drug_hint=drug_keyword,
            )
        except Exception as e:
            from datetime import datetime, timezone
            fda_result = _insufficient_data_result(
                datetime.now(timezone.utc).isoformat(),
                raw_drug=drug_keyword,
                record_id=intake_id,
                record_type="intake",
            )
    else:
        # No valid drug anywhere — return insufficient_data, do NOT call openFDA
        from datetime import datetime, timezone
        fda_result = _insufficient_data_result(
            datetime.now(timezone.utc).isoformat(),
            raw_drug=drug_keyword or intel_drug or "",
            record_id=intake_id,
            record_type="intake",
        )

    # Persist to intake record
    update_intake(intake_id, fda_result)

    # Also persist to linked intelligence record
    if intel_id:
        update_intel(intel_id, fda_result)

    return {
        "status": "success",
        "intake_id": intake_id,
        "drug": intel_drug or drug_keyword,
        "event": intel_event or "",
        "fdaAnalysis": fda_result,
    }


@router.post("/analyze-batch")
async def fda_analyze_batch(req: FDABatchRequest):
    """
    Batch-analyze multiple records (intelligence or intake).
    Returns list of {record_id, status, fdaAnalysis}.
    Throttled to one openFDA call per unique normalized drug (uses cache).
    """
    results = []

    if req.record_type == "intake":
        for rid in req.record_ids:
            try:
                r = await fda_analyze_intake(rid)
                results.append({
                    "record_id": rid,
                    "status": r.get("status"),
                    "fdaAnalysis": r.get("fdaAnalysis"),
                })
            except Exception as e:
                results.append({"record_id": rid, "status": "error", "message": str(e)})
    else:
        for rid in req.record_ids:
            try:
                r = await fda_analyze_record(rid)
                results.append({
                    "record_id": rid,
                    "status": r.get("status"),
                    "fdaAnalysis": r.get("fdaAnalysis"),
                })
            except Exception as e:
                results.append({"record_id": rid, "status": "error", "message": str(e)})

    success = sum(1 for r in results if r.get("status") == "success")
    return {
        "status": "complete",
        "total": len(results),
        "success": success,
        "skipped": len(results) - success,
        "results": results,
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _error_fda_obj():
    from datetime import datetime, timezone
    return {
        "available": False,
        "applicable": False,
        "originalDrug": "",
        "drug": "",
        "normalizedDrug": "",
        "extractedSymptoms": [],
        "matchedSymptoms": [],
        "knownReactions": [],
        "confidenceBoost": 0,
        "riskLevel": "unknown",
        "evidenceSource": "openFDA",
        "sourceApis": [],
        "summary": "FDA evidence could not be retrieved at this time.",
        "apiStatus": "error",
        "lastCheckedAt": datetime.now(timezone.utc).isoformat(),
        "cacheHit": False,
    }
