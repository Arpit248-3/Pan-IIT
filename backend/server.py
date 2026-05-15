import warnings
# Suppress specific LangChain/LangGraph deprecation warnings early
warnings.filterwarnings("ignore", message=".*allowed_objects.*")
try:
    from langchain_core._api import LangChainPendingDeprecationWarning
    warnings.filterwarnings("ignore", category=LangChainPendingDeprecationWarning)
except ImportError:
    pass

from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.responses import Response, StreamingResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from typing import Optional, Any, Union
from fastapi.middleware.cors import CORSMiddleware
import json
import os
import asyncio
import time
import traceback

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Import custom modules
from ai_engine import ayu_scout_ai, _generate_mock_result
from core.pii_vault import PIIVault as _PIIVault, sanitize_response as _sanitize
from database import (
    init_db, get_pending_cases, update_status,
    save_intake, save_intelligence, get_all_intelligence, get_intelligence_by_id,
    get_dashboard_stats, get_all_intake,
    create_user, get_user_by_email, touch_last_login, verify_password,
    create_help_query, get_all_help_queries, get_user_help_queries, answer_help_query,
    create_project, get_all_projects, get_project_by_id, delete_project, update_project,
    get_project_fetched_items, get_project_scraper_status,
    get_all_signals, get_trends_data,
    get_notifications, create_notification,
    _detect_pii_types, sanitize_pii_for_display,
    create_crawler_session, emit_crawler_log, get_crawler_logs_since,
    finish_crawler_session, get_crawler_session,
)
from crawler import (
    run_simulated_crawler,
    run_live_agentic_crawler,
    generate_scraper_config,
    run_twitterapi_crawler
)
from core.e2b_export import generate_e2b_xml, generate_e2b_r2_xml
from core.vector_store import get_vector_store
from core.webhook_alerter import get_recent_alerts

# ── Modular route registrations ──────────────────────────────
from routes.settings_routes import router as settings_router
from routes.user_routes import router as user_router
from routes.notification_routes import router as notification_router
from routes.alert_routes import router as alert_router
from routes.auth_routes import router as auth_ext_router
from routes.fda_routes import router as fda_router
from routes.crawler_routes import router as crawler_router

# ── FDA Service ──────────────────────────────────────────────
from services.fda_service import analyze_fda, analyze_fda_structured
# ── Crawler Service (canonical ingestion pipeline) ────────────────────
from services.crawler_service import ingest_fetched_medical_record
# ── Source Registry ────────────────────────────────────────────
from source_registry import (
    SOURCE_REGISTRY, get_source, get_sources_for_ids,
    build_crawl_url, list_all_source_ids, get_source_display_name,
)


app = FastAPI(
    title="AyuScout V2 — Command Center API",
    description="Enterprise Pharmacovigilance Ecosystem with AI Signal Detection",
    version="2.0.0"
)

# ============================================================
# CORS MIDDLEWARE (Phase 5: Triple-checked)
# ============================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# ── Register modular routers ──────────────────────────────────
app.include_router(settings_router)
app.include_router(user_router)
app.include_router(notification_router)
app.include_router(alert_router)
app.include_router(auth_ext_router)
app.include_router(fda_router)
app.include_router(crawler_router)


# Global 422 handler — logs exact field errors to console for debugging
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    print(f"\n[422-DEBUG] Validation error on {request.method} {request.url.path}")
    for e in errors:
        print(f"  Field: {'.'.join(str(x) for x in e.get('loc', []))} | Error: {e.get('msg')} | Input: {e.get('input')}")
    return JSONResponse(
        status_code=422,
        content={"detail": errors, "hint": "Check field types — common issue: owner_id must be int or null"},
    )


# ============================================================
# ROOT HOME PAGE (System Status)
# ============================================================
@app.get("/")
async def root():
    """Welcome page with system status."""
    return {
        "status": "online",
        "system": "AyuScout V2 — Command Center API",
        "version": "2.0.0",
        "documentation": "/docs",
        "message": "Intelligence vault is active and monitoring adverse events."
    }


# --- REQUEST MODELS ---

class CaseReport(BaseModel):
    text: str


class ScoutRequest(BaseModel):
    keyword: str


class TwitterCrawlerRequest(BaseModel):
    keyword: str
    hours_back: int = 24
    max_requests: int = 1
    max_tweets_to_save: int = 10
    dry_run: bool = False


class CrawlerRunRequest(BaseModel):
    """Request body for the new /api/crawler/run endpoint."""
    url: str = ""                # target URL or "twitter" for API-based
    keyword: str                 # drug/topic keyword
    source_id: str = "generic_web"  # registry source ID
    project_id: int = None       # optional — links crawl to a project
    max_records: int = 15        # cap on items to ingest per run


class SimilarEventQuery(BaseModel):
    query: str
    top_k: int = 5


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = 'safety_officer'
    department: str = 'Pharmacovigilance'
    organization: str = ''


class LoginRequest(BaseModel):
    email: str
    password: str


class HelpQueryRequest(BaseModel):
    user_id: Optional[Any] = None   # int OR str from localStorage
    user_email: str
    user_name: str = ''
    question: str


class AnswerQueryRequest(BaseModel):
    answer: str


# --- STARTUP EVENT ---
@app.on_event("startup")
async def startup_event():
    print("\n" + "=" * 60)
    print("[STARTUP] AyuScout V2 — Command Center Starting Up...")
    print("=" * 60)
    init_db()
    
    # Initialize vector store
    try:
        vs = get_vector_store()
        stats = vs.get_cluster_summary()
        print(f"   [STARTUP] Vector Store: {stats}")
    except Exception as e:
        print(f"   [STARTUP] Vector Store init deferred: {e}")
    
    print("=" * 60)
    print("[STARTUP] LLM Timeout: None — Ollama runs until completion (no timeout)")
    print("[STARTUP] AyuScout V2 is LIVE on http://localhost:8080")
    print("[STARTUP] API Docs: http://localhost:8080/docs")
    print("=" * 60 + "\n")


# ============================================================
# HELPER: Run AI Pipeline with Timeout
# ============================================================
async def _run_pipeline(raw_text: str) -> dict:
    """
    Runs the LangGraph AI pipeline in a thread.
    No timeout — lets Ollama (llama3.2:1b) finish naturally.
    Falls back to deterministic results only on hard errors.
    """
    initial_state = {
        "raw_text": raw_text,
        "clean_text": "",
        "extracted_data": {},
        "extraction_attempts": 0,
        "critic_feedback": "",
        "doctor_verdict": None
    }
    
    start_time = time.time()
    
    try:
        print(f"   [STEP 1/5] Request received. Starting pipeline (no timeout)...")
        print(f"   [STEP 2/5] Dispatching to AI Engine (LangGraph + Ollama)...")
        
        # Run in a thread so the async event loop stays responsive
        result = await asyncio.to_thread(ayu_scout_ai.invoke, initial_state)
        
        elapsed = round(time.time() - start_time, 2)
        print(f"   [STEP 3/5] AI Pipeline completed in {elapsed}s")
        print(f"   [STEP 4/5] Formatting response...")
        print(f"   [STEP 5/5] Returning response to frontend")
        
        return result
        
    except Exception as e:
        elapsed = round(time.time() - start_time, 2)
        print(f"   [ERROR] Pipeline failed after {elapsed}s: {e}")
        traceback.print_exc()
        result = _generate_mock_result(raw_text)
        result["_meta"] = {"source": "mock_error", "error": str(e)}
        return result


# ============================================================
# ENDPOINT 1: MANUAL ANALYSIS — REAL INGESTION WORKFLOW
# ============================================================
@app.post("/api/analyze-case")
async def analyze_case(report: CaseReport):
    """
    Full production ingestion workflow:
      1. Mask PII via PIIVault
      2. Save masked text to IntakeVault
      3. Run AI pipeline on masked text ONLY
      4. Save result to IntelligenceVault
      5. Update intake status to 'analyzed'
      6. Create notification for significant signals
      7. Return enriched response (no raw PII, no vault_map)
    """
    print(f"\n{'='*55}")
    print(f"[ANALYZE-CASE] New ingestion request")

    # ── Step 1: Mask PII ─────────────────────────────────────
    _pii = _PIIVault()
    masked_text, _vault_map = _pii.mask(report.text, source="analyze-case")
    pii_types = list(set([k.split('_')[0].replace('[','').replace(']','') for k in _vault_map.keys()]))
    pii_detected = len(_vault_map) > 0
    pii_token_count = len(_vault_map)
    print(f"   [PII] Tokens masked: {list(_vault_map.keys())}")
    print(f"   Masked: {masked_text[:120]}...")

    # ── Step 2: Save to IntakeVault ───────────────────────────
    intake_id = save_intake(
        text=masked_text,
        platform="Manual Overview",
        drug="Unknown",            # will be refined after AI
        pii_map=json.dumps(_vault_map)
    )
    print(f"   [DB] Intake record created: id={intake_id}")

    # ── Step 3: Run AI Pipeline on masked text ONLY ───────────
    print(f"{'='*55}")
    result = await _run_pipeline(masked_text)

    # ── Parse AI outputs ──────────────────────────────────────
    extracted_json = result.get("extracted_data", {})
    if isinstance(extracted_json, str):
        try:
            extracted_json = json.loads(extracted_json)
        except Exception:
            extracted_json = {}

    doctor_verdict = result.get("doctor_verdict", {})
    if isinstance(doctor_verdict, str):
        try:
            doctor_verdict = json.loads(doctor_verdict)
        except Exception:
            doctor_verdict = {}
    if not isinstance(doctor_verdict, dict):
        doctor_verdict = {}

    # ── Step 4: Save to IntelligenceVault ────────────────────
    intelligence_id = None
    if intake_id:
        intelligence_id = save_intelligence(intake_id, result)
        print(f"   [DB] Intelligence record created: id={intelligence_id}")

    # ── Step 5: Update intake status ─────────────────────────
    if intake_id:
        update_status(intake_id, "analyzed")

    # ── Step 5b: FDA Analysis ──────────────────────────────────────
    # Strategy A: use AI-extracted drug+event (structured, no relation detection)
    # Strategy B: fall back to free-text analysis on masked_text
    # Result is persisted to BOTH intake and intelligence records in DB.
    fda_analysis = {"available": False, "applicable": False, "apiStatus": "skipped"}
    try:
        _drug_hint   = (extracted_json.get("suspect_drug") or "") if isinstance(extracted_json, dict) else ""
        _event_hint  = (
            extracted_json.get("meddra_term")
            or extracted_json.get("adverse_event")
            or ""
        ) if isinstance(extracted_json, dict) else ""

        if _drug_hint and _event_hint:
            # Structured path — bypasses relation detection
            fda_analysis = analyze_fda_structured(
                drug=_drug_hint,
                event=_event_hint,
                record_id=intelligence_id,
                record_type="intelligence",
            )
        else:
            # Free-text path — uses relation detection
            fda_analysis = analyze_fda(text=masked_text, drug_hint=_drug_hint or None)

        print(f"   [FDA] applicable={fda_analysis.get('applicable')}, "
              f"drug={fda_analysis.get('normalizedDrug')}, "
              f"matched={fda_analysis.get('matchedSymptoms')}, "
              f"cacheHit={fda_analysis.get('cacheHit')}")
    except Exception as fda_err:
        print(f"   [FDA] Analysis failed (non-blocking): {fda_err}")

    # -- Step 6: Create DB-backed notification --
    sev = doctor_verdict.get("severity", "Unknown")
    drug_name = (extracted_json.get("suspect_drug") or "Unknown Drug") if isinstance(extracted_json, dict) else "Unknown Drug"
    event_name = (extracted_json.get("meddra_term") or extracted_json.get("adverse_event") or "Adverse Event") if isinstance(extracted_json, dict) else "Adverse Event"
    try:
        _icon  = "critical" if sev == "Critical" else "warning" if sev == "High" else "info"
        _type  = "signal"   if sev in ("Critical", "High") else "info"
        _prio  = "critical" if sev == "Critical" else "high" if sev == "High" else "normal"
        notif = create_notification(
            title=f"New protected safety signal: {drug_name} - {event_name}",
            desc=f"Severity: {sev} | Causality: {doctor_verdict.get('causality_score','Unknown')} | PII Protected by PIIVault",
            icon=_icon, type=_type, category="Signal", priority=_prio
        )
        if notif:
            print(f"[NOTIFICATION] Created protected signal notification: id={notif.get('id')}")
    except Exception as e:
        print(f"   [NOTIFY] Notification skipped: {e}")

    # -- Step 6b: FDA-supported notification (only when applicable) --
    if fda_analysis.get("applicable") and fda_analysis.get("matchedSymptoms"):
        try:
            fda_drug_norm = fda_analysis.get("normalizedDrug", drug_name)
            fda_syms = ", ".join(fda_analysis.get("matchedSymptoms", []))
            create_notification(
                title=f"FDA evidence found: {fda_syms} linked to {fda_drug_norm}",
                desc=f"openFDA adverse event match confirmed. Risk: {fda_analysis.get('riskLevel','unknown')} | Confidence boost: +{fda_analysis.get('confidenceBoost', 0)}%",
                icon="warning", type="signal", category="FDA", priority="high"
            )
        except Exception as fda_notif_err:
            print(f"   [FDA-NOTIFY] Skipped: {fda_notif_err}")

    # ── Step 7: Sanitize & build response ─────────────────────
    reasoning_safe   = _sanitize(doctor_verdict.get("reasoning", ""))
    interaction_safe = _sanitize(doctor_verdict.get("interaction_reasoning", "No interaction analysis available."))

    response = {
        "status": "success",
        # ── PII Vault metadata (never exposes originals) ──
        "masked_text": masked_text,
        "clean_text": masked_text,
        "pii_detected": pii_detected,
        "pii_types_detected": pii_types,
        "pii_token_count": pii_token_count,
        "warning": "Original PII is stored only in protected vault map and is never returned to frontend",
        # ── Storage confirmations ──
        "intake_id": intake_id,
        "intelligence_id": intelligence_id,
        "e2b_available": intelligence_id is not None,
        # ── Clinical extraction ──
        "clinical_data": extracted_json,
        "doctor_verdict": doctor_verdict,
        "causality": doctor_verdict.get("causality_score", "Pending"),
        "confidence": doctor_verdict.get("confidence_score", "Unknown"),
        "severity": sev,
        "reasoning": reasoning_safe,
        "pubmed_link": doctor_verdict.get("pubmed_search_link", ""),
        "extraction_attempts": result.get("extraction_attempts", 0),
        "who_umc_details": doctor_verdict.get("who_umc_details", {}),
        "alternative_cause_likely": doctor_verdict.get("alternative_cause_likely", False),
        "ddi_risk_level": doctor_verdict.get("ddi_risk_level", "None"),
        "interaction_reasoning": interaction_safe,
        # ── FDA Evidence (never exposes raw PII) ──
        "fdaAnalysis": fda_analysis,
    }

    print(f"[ANALYZE-CASE] Done: intake_id={intake_id}, intel_id={intelligence_id}, causality={response['causality']}")
    return response



# ============================================================
# ENDPOINT 2: DEPLOY SCOUT CRAWLER (Background)
# ============================================================
@app.post("/api/run-scout")
async def trigger_scout(request: ScoutRequest, background_tasks: BackgroundTasks):
    """Deploy the Scout Agent to crawl simulated social media data."""
    print(f"\n[RUN-SCOUT] Deploying Scout Agent for: {request.keyword}")
    background_tasks.add_task(run_simulated_crawler, request.keyword)
    return {"status": "Scout Agent Deployed", "drug": request.keyword}


# ============================================================
# ENDPOINT 2B: SAFE X/TWITTER CRAWLER USING TWITTERAPI.IO
# ============================================================
@app.post("/api/twitter/crawl")
async def twitter_crawl(req: TwitterCrawlerRequest):
    """
    Safe X/Twitter crawler using TwitterAPI.io.

    This does not disturb existing:
    - /api/run-crawler
    - /api/crawler/run
    - self-healing website crawler

    It saves tweets into the same intake_vault table.
    """

    keyword = req.keyword.strip()

    if not keyword:
        raise HTTPException(status_code=400, detail="Keyword is required")

    try:
        result = await asyncio.to_thread(
            run_twitterapi_crawler,
            keyword,
            req.hours_back,
            req.max_requests,
            req.max_tweets_to_save,
            req.dry_run
        )

        return {
            "status": "success",
            "keyword": keyword,
            **result
        }

    except Exception as e:
        print(f"[TWITTER-CRAWLER] Error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# ENDPOINT 3: PROCESS THE INTAKE VAULT (Batch Analysis)
# ============================================================
@app.get("/api/process-vault")
async def process_vault():
    """Process all pending cases in the intake vault through the AI pipeline.
    Text from IntakeVault.raw_text is already masked at ingestion time.
    A defensive re-mask pass is applied here as belt-and-suspenders.
    """
    print(f"\n[PROCESS-VAULT] Processing pending signals...")
    pending = get_pending_cases()
    processed_results = []
    _pii = _PIIVault()

    for case_id, text in pending:
        print(f"   [PROCESS-VAULT] Case {case_id}: analyzing...")
        try:
            # Defensive re-mask (idempotent on already-masked text)
            safe_text, _ = _pii.mask(text, source=f"process-vault/case-{case_id}")

            result = await _run_pipeline(safe_text)

            # Sanitize LLM-generated reasoning before saving
            dv = result.get("doctor_verdict", {}) or {}
            if isinstance(dv, str):
                try:
                    dv = json.loads(dv)
                except Exception:
                    dv = {}
            if isinstance(dv, dict) and dv.get("reasoning"):
                dv["reasoning"] = _sanitize(dv["reasoning"])
            result["doctor_verdict"] = dv

            intel_id = save_intelligence(case_id, result)
            update_status(case_id, 'analyzed')

            # Create notification for significant signals
            _sev = dv.get("severity", "Medium")
            try:
                _ed = result.get("extracted_data", {})
                if isinstance(_ed, str):
                    try: _ed = json.loads(_ed)
                    except: _ed = {}
                _drug  = (_ed.get("suspect_drug") or "Unknown") if isinstance(_ed, dict) else "Unknown"
                _event = (_ed.get("meddra_term") or _ed.get("adverse_event") or "Adverse Event") if isinstance(_ed, dict) else "Adverse Event"
                create_notification(
                    title=f"[Vault] Protected signal: {_drug} - {_event}",
                    desc=f"Severity: {_sev} | Causality: {dv.get('causality_score','Unknown')} | PII Protected",
                    icon="critical" if _sev == "Critical" else "warning" if _sev == "High" else "info",
                    type="signal" if _sev in ("Critical", "High") else "info",
                    category="Signal", priority="high" if _sev in ("Critical", "High") else "normal"
                )
            except Exception as ne:
                print(f"   [NOTIFY] Vault notification skipped: {ne}")

            processed_results.append({
                "case_id": case_id,
                "causality": dv.get("causality_score", "Pending"),
                "confidence": dv.get("confidence_score", "Unknown"),
                "intelligence_id": intel_id,
            })
        except Exception as ce:
            print(f"   [PROCESS-VAULT] Case {case_id} failed: {ce}")
            update_status(case_id, 'failed')
            processed_results.append({"case_id": case_id, "status": "failed"})

    print(f"[PROCESS-VAULT] Batch complete: {len(processed_results)} cases processed")
    return {
        "status": "Batch Analysis Complete",
        "total_processed": len(processed_results),
        "signals": processed_results
    }


# ============================================================
# ENDPOINT 4: ALERTS FEED (Intelligence Vault)
# ============================================================
@app.get("/api/alerts-feed")
async def alerts_feed():
    """
    Get all intelligence vault records for the dashboard.
    Returns persisted fdaAnalysis from DB — NO live openFDA calls per record.
    FDA analysis is written to DB by analyze-case and /api/fda/analyze-record.
    """
    try:
        records = get_all_intelligence()   # already includes fdaAnalysis from DB
        return {
            "status": "success",
            "total": len(records),
            "records": records,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "total": 0,
            "records": []
        }


# ============================================================
# ENDPOINT 5: E2B (R3) EXPORT
# ============================================================
@app.get("/api/export-e2b/{record_id}")
async def export_e2b(record_id: int):
    """
    Export an intelligence vault record as ICH E2B (R3) XML.
    Returns the XML as a downloadable file.
    """
    record = get_intelligence_by_id(record_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Record {record_id} not found in Intelligence Vault")
    
    try:
        xml_content = generate_e2b_xml(record)
        return Response(
            content=xml_content,
            media_type="application/xml",
            headers={
                "Content-Disposition": f"attachment; filename=E2B_R3_ICSR_{record_id}.xml",
                "Access-Control-Allow-Origin": "*",
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"E2B R3 generation failed: {str(e)}")


# ============================================================
# ENDPOINT 5b: E2B (R2) EXPORT — Legacy SGML-compatible format
# ============================================================
@app.get("/api/export-e2b-r2/{record_id}")
async def export_e2b_r2(record_id: int):
    """
    Export an intelligence vault record as ICH E2B (R2) XML.
    R2 is the legacy SGML-compatible format used by many older regulatory systems.
    """
    record = get_intelligence_by_id(record_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Record {record_id} not found in Intelligence Vault")
    
    try:
        xml_content = generate_e2b_r2_xml(record)
        return Response(
            content=xml_content,
            media_type="application/xml",
            headers={
                "Content-Disposition": f"attachment; filename=E2B_R2_ICSR_{record_id}.xml",
                "Access-Control-Allow-Origin": "*",
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"E2B R2 generation failed: {str(e)}")


# ============================================================
# ENDPOINT 6: SIMILAR EVENTS (Vector Search)
# ============================================================
@app.post("/api/similar-events")
async def find_similar_events(query: SimilarEventQuery):
    """
    Find similar adverse events using vector similarity search.
    Used for zero-day / unknown side effect clustering.
    """
    try:
        vs = get_vector_store()
        similar = vs.find_similar(query.query, top_k=query.top_k)
        return {
            "status": "success",
            "query": query.query,
            "results": similar
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "results": []
        }


# ============================================================
# ENDPOINT 7: VECTOR STORE STATS
# ============================================================
@app.get("/api/vector-stats")
async def vector_stats():
    """Get vector store statistics."""
    try:
        vs = get_vector_store()
        return vs.get_cluster_summary()
    except Exception as e:
        return {"status": "error", "error": str(e)}


# ============================================================
# ENDPOINT 8: WEBHOOK ALERTS LOG
# ============================================================
@app.get("/api/webhook-alerts")
async def webhook_alerts():
    """Get recent webhook alert logs."""
    try:
        alerts = get_recent_alerts(limit=20)
        return {
            "status": "success",
            "total": len(alerts),
            "alerts": alerts
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "alerts": []
        }


# ============================================================
# ENDPOINT 9: DASHBOARD STATS (Aggregated)
# ============================================================
@app.get("/api/dashboard-stats")
async def dashboard_stats():
    """Aggregated dashboard statistics from the intelligence vault."""
    try:
        stats = get_dashboard_stats()
        return {"status": "success", **stats}
    except Exception as e:
        return {"status": "error", "message": str(e), "total_records": 0}


# ============================================================
# ENDPOINT 10: REPORTS (Intelligence as Reports)
# ============================================================
@app.get("/api/reports")
async def get_reports():
    """Get intelligence vault records formatted as reports.
    fdaAnalysis is read from persisted DB field — no live openFDA calls.
    """
    import re as _re
    try:
        records = get_all_intelligence()   # includes fdaAnalysis from DB
        # Join intake metadata for PII flags
        intake_by_intel = {}
        try:
            intakes = get_all_intake()
            intake_by_intel = {r['intelligence_id']: r for r in intakes if r.get('intelligence_id')}
        except Exception:
            pass

        reports = []
        for r in records:
            intake_meta = intake_by_intel.get(r['id'], {})
            pii_masked = intake_meta.get('pii_masked', False)
            pii_types  = intake_meta.get('pii_types_detected', [])

            # Extract emotion from reasoning prefix
            reasoning_raw = r.get('reasoning', '') or ''
            emotion = ''
            m = _re.match(r'^\[Emotion:\s*([^\]]+)\]', reasoning_raw)
            if m:
                emotion = m.group(1).strip()

            # ── Use persisted FDA from DB (no live call) ──────────────
            rpt_fda = r.get('fdaAnalysis')   # already parsed by get_all_intelligence()

            # FDA label for table column
            if rpt_fda and rpt_fda.get("applicable") and rpt_fda.get("matchedSymptoms"):
                fda_label = "FDA Match Found"
            elif rpt_fda and not rpt_fda.get("available"):
                fda_label = "FDA Unavailable"
            elif rpt_fda and rpt_fda.get("apiStatus") == "not_applicable":
                fda_label = "Not Applicable"
            elif rpt_fda is None:
                fda_label = "Pending"
            else:
                fda_label = "No FDA Match"

            reports.append({
                "id": f"RPT-{200 + r['id']}",
                "record_id": r['id'],
                "intelligence_id": r['id'],
                "title": sanitize_pii_for_display(f"{r['drug']} - {r['event']} Safety Analysis"),
                "type": "Signal" if r.get('severity') in ('Critical', 'High') else "Analytics",
                "status": "Flagged" if r.get('severity') in ('Critical', 'High') else "Reviewed",
                "statusColor": "danger" if r.get('severity') in ('Critical', 'High') else "success",
                "causality": r.get('causality', 'Pending'),
                "confidence": r.get('confidence', 'Unknown'),
                "severity": r.get('severity', 'Medium'),
                "sentiment": r.get('sentiment', 'Unknown'),
                "emotion": emotion,
                "author": "AyuScout V2 AI",
                "created_at": r.get('created_at', ''),
                "drug": r.get('drug', 'Unknown'),
                "event": r.get('event', 'Unknown'),
                "pii_masked": pii_masked,
                "pii_types_detected": pii_types,
                "e2b_available": True,
                "fdaAnalysis": rpt_fda,
                "fdaLabel": fda_label,
            })
        return {"status": "success", "total": len(reports), "reports": reports}
    except Exception as e:
        return {"status": "error", "message": str(e), "total": 0, "reports": []}


# ============================================================
# ENDPOINT 11: INTAKE VAULT (Data Explorer)
# ============================================================
@app.get("/api/intake-vault")
async def intake_vault():
    """Get all intake vault records for the Data Explorer.
    fdaAnalysis is read from persisted DB field — no live openFDA calls.
    Frontend can trigger /api/fda/analyze-intake/{id} to analyze missing records.
    """
    try:
        records = get_all_intake()   # already includes fdaAnalysis from DB
        return {"status": "success", "total": len(records), "records": records}
    except Exception as e:
        return {"status": "error", "message": str(e), "total": 0, "records": []}


# ============================================================
# ENDPOINT 12: NOTIFICATIONS — REMOVED (legacy)
# The notification_routes.py router (mounted above) handles all
# /api/notifications endpoints using the real Notification DB model.
# This endpoint would conflict — do NOT re-add it here.
# ============================================================


# ============================================================
# ENDPOINT 12b: REPAIR PENDING INTAKE (Backfill utility)
# ============================================================
@app.post("/api/repair-pending-intake")
async def repair_pending_intake():
    """
    Backfill endpoint: re-processes all pending intake records through
    the full AI pipeline, saves intelligence, marks as analyzed, creates
    notifications. Safe to call repeatedly (idempotent on already-analyzed).
    """
    print("[REPAIR] Starting pending intake repair...")
    pending = get_pending_cases()
    _pii = _PIIVault()
    repaired, failed = 0, 0
    results = []

    for case_id, text in pending:
        try:
            safe_text, _ = _pii.mask(text, source=f"repair/{case_id}")
            result = await _run_pipeline(safe_text)

            dv = result.get("doctor_verdict", {}) or {}
            if isinstance(dv, str):
                try: dv = json.loads(dv)
                except: dv = {}
            if isinstance(dv, dict) and dv.get("reasoning"):
                dv["reasoning"] = _sanitize(dv["reasoning"])
            result["doctor_verdict"] = dv

            intel_id = save_intelligence(case_id, result)
            update_status(case_id, "analyzed")

            sev = dv.get("severity", "Medium")
            ed  = result.get("extracted_data", {})
            if isinstance(ed, str):
                try: ed = json.loads(ed)
                except: ed = {}
            drug_n  = (ed.get("suspect_drug") or "Unknown") if isinstance(ed, dict) else "Unknown"
            event_n = (ed.get("meddra_term") or ed.get("adverse_event") or "Adverse Event") if isinstance(ed, dict) else "Adverse Event"

            try:
                create_notification(
                    title=f"[Repaired] Protected signal: {drug_n} - {event_n}",
                    desc=f"Severity: {sev} | Backfill repair | PII Protected",
                    icon="warning" if sev in ("Critical", "High") else "info",
                    type="signal", category="Signal", priority="normal"
                )
            except Exception:
                pass

            repaired += 1
            results.append({"case_id": case_id, "status": "repaired", "intelligence_id": intel_id})
        except Exception as e:
            print(f"   [REPAIR] Case {case_id} failed: {e}")
            update_status(case_id, "failed")
            failed += 1
            results.append({"case_id": case_id, "status": "failed", "error": str(e)})

    print(f"[REPAIR] Done: repaired={repaired}, failed={failed}")
    return {"status": "success", "repaired": repaired, "failed": failed, "records": results}


# ============================================================
# HEALTH CHECK
# ============================================================
@app.get("/api/health")
async def health_check():
    """API health check endpoint."""
    return {
        "status": "healthy",
        "service": "AyuScout V2",
        "version": "2.0.0",
        "llm_timeout": "none (Ollama runs until complete)",
        "components": {
            "api": "running",
            "database": "sqlite",
            "vector_store": "chromadb",
            "ai_engine": "langgraph"
        }
    }


# ============================================================
# ENDPOINT 13: AUTH — REGISTER
# ============================================================
@app.post("/api/auth/register")
async def auth_register(req: RegisterRequest):
    """Register a new user account (with role, department, organization)."""
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    # Map login-form role IDs to DB role values
    role_map = {
        'safety_officer':   'safety_officer',
        'pv_manager':       'analyst',
        'medical_reviewer': 'reviewer',
        'administrator':    'admin',
    }
    db_role = role_map.get(req.role, 'user')
    dept = req.department or req.organization or 'Pharmacovigilance'
    user, error = create_user(req.name, req.email, req.password, db_role, dept, 'Active')
    if error:
        raise HTTPException(status_code=400, detail=error)
    return {"status": "success", "user": user}


# ============================================================
# ENDPOINT 14: AUTH — LOGIN
# ============================================================
@app.post("/api/auth/login")
async def auth_login(req: LoginRequest):
    """Authenticate a user and return their profile."""
    user = get_user_by_email(req.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    touch_last_login(user["id"])
    return {
        "status": "success",
        "user": {
            "id":         user["id"],
            "name":       user["name"],
            "email":      user["email"],
            "role":       user["role"],
            "department": user.get("department", "Pharmacovigilance"),
            "status":     user.get("status", "Active"),
        }
    }


# ============================================================
# ENDPOINT 15: HELP QUERIES — LIST
# ============================================================
@app.get("/api/help/queries")
async def list_help_queries(user_id: int = None, role: str = "user"):
    """Get all queries (admin) or own queries (user)."""
    try:
        if role == "admin":
            return {"status": "success", "queries": get_all_help_queries()}
        if user_id is None:
            raise HTTPException(status_code=400, detail="user_id is required")
        return {"status": "success", "queries": get_user_help_queries(user_id)}
    except HTTPException:
        raise
    except Exception as e:
        return {"status": "error", "message": str(e), "queries": []}


# ============================================================
# ENDPOINT 16: HELP QUERIES — SUBMIT
# ============================================================
@app.post("/api/help/queries")
async def submit_help_query(req: HelpQueryRequest):
    """Submit a new help query and notify the admin via email."""
    result = create_help_query(
        user_id=req.user_id,
        user_email=req.user_email,
        user_name=req.user_name,
        question=req.question
    )
    if not result:
        raise HTTPException(status_code=500, detail="Failed to save query")
    # Notify admin that a new query has been submitted
    try:
        from core.email_notifier import send_new_query_email
        send_new_query_email(
            user_name=req.user_name,
            user_email=req.user_email,
            question=req.question
        )
    except Exception as e:
        print(f"⚠️ Admin query notification email failed: {e}")
    return {"status": "success", "query": result}


# ============================================================
# ENDPOINT 17: HELP QUERIES — ANSWER (Admin)
# ============================================================
@app.put("/api/help/queries/{query_id}")
async def answer_help_query_endpoint(query_id: int, req: AnswerQueryRequest):
    """Admin answers a help query and triggers email notification."""
    updated = answer_help_query(query_id, req.answer)
    if not updated:
        raise HTTPException(status_code=404, detail="Query not found")
    # Trigger email notification
    try:
        from core.email_notifier import send_query_answered_email
        send_query_answered_email(
            user_email=updated["user_email"],
            user_name=updated["user_name"],
            question=updated["question"],
            answer=req.answer
        )
    except Exception as e:
        print(f"⚠️ Answer email notification failed: {e}")
    return {"status": "success", "query": updated}


# ============================================================
# ============================================================
# ENDPOINT 18: CRAWLER — now handled by crawler_routes.py
# Routes: POST /api/crawler/run, GET /api/crawler/logs/{id},
#         GET /api/crawler/session/{id}, GET /api/crawler/health
#         GET /api/sources
# These are registered via app.include_router(crawler_router)
# DO NOT add @app.post('/api/crawler/run') here — it would shadow
# the real implementation in routes/crawler_routes.py
# ============================================================
@app.post("/api/run-crawler")
async def run_crawler_legacy_redirect():
    """Legacy redirect — use POST /api/crawler/run instead."""
    return {
        "status": "deprecated",
        "message": "Use POST /api/crawler/run with CrawlerRunRequest body",
        "new_endpoint": "/api/crawler/run"
    }


# ============================================================
# ENDPOINT 19: AGENTIC SCRAPER — GENERATE SELECTORS
# ============================================================
class AgentGenerateRequest(BaseModel):
    url: str


@app.post("/api/agentic-scraper/generate")
async def agentic_scraper_generate(req: AgentGenerateRequest):
    """
    Fetch live HTML for the given URL, ask the LLM (or heuristic engine)
    for CSS selectors, validate them against the DOM, and return the config.
    """
    url = req.url.strip()
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
    try:
        config = await asyncio.to_thread(generate_scraper_config, url)
        return {"status": "success", **config}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scraper generation failed: {str(e)}")


# ============================================================
# ENDPOINT 20: PROJECTS — LIST
# ============================================================
@app.get("/api/projects")
async def list_projects(owner_id: int = None, owner_email: str = None):
    """Return monitoring projects. Pass owner_id to isolate by user."""
    try:
        projects = get_all_projects(owner_id=owner_id, owner_email=owner_email)
        return {"status": "success", "total": len(projects), "projects": projects}
    except Exception as e:
        return {"status": "error", "message": str(e), "total": 0, "projects": []}


# ============================================================
# ENDPOINT 21: PROJECTS — CREATE
# ============================================================
class ProjectCreateRequest(BaseModel):
    name: str
    keywords: list = []
    sources: list = ['twitter']
    scraper_config: dict = {}
    agentic_enabled: bool = False
    schedule_interval: str = 'Daily'
    owner_id: Optional[Any] = None    # int OR str from localStorage
    owner_email: Optional[str] = None
    source_type: str = 'social'
    source_url: Optional[str] = None


@app.post("/api/projects")
async def create_project_endpoint(request: Request):
    """
    Persist a new monitoring project.
    Accepts raw JSON body — no Pydantic validation so owner_id can be int or str.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    name = str(body.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name is required")

    # Safely resolve owner_id (may be int, string, or None from localStorage)
    raw_oid = body.get("owner_id")
    try:
        safe_owner_id = int(raw_oid) if raw_oid is not None else None
    except (TypeError, ValueError):
        safe_owner_id = None

    project = create_project(
        name=name,
        keywords=body.get("keywords") or [],
        sources=body.get("sources") or ["twitter"],
        scraper_config=body.get("scraper_config") or {},
        agentic_enabled=bool(body.get("agentic_enabled", False)),
        schedule_interval=str(body.get("schedule_interval", "Daily")),
        owner_id=safe_owner_id,
        owner_email=body.get("owner_email"),
        source_type=str(body.get("source_type", "social")),
        source_url=body.get("source_url"),
    )
    if not project:
        raise HTTPException(status_code=500, detail="Failed to save project to database")
    return {"status": "success", "project": project}


# ============================================================
# ENDPOINT 21b: PROJECTS — GET SINGLE
# ============================================================
@app.get("/api/projects/{project_id}")
async def get_project_endpoint(project_id: int, owner_id: int = None):
    """Return a single project. Pass owner_id to enforce access control."""
    project = get_project_by_id(project_id, owner_id=owner_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")
    return {"status": "success", "project": project}


# ============================================================
# ENDPOINT 21b-i: PROJECTS — FETCHED ITEMS LIST
# ============================================================
@app.get("/api/projects/{project_id}/items")
async def get_project_items(project_id: int, keyword: str = None, limit: int = 50, owner_id: int = None):
    """
    Return actual intake records matching this project's keywords.
    Used by ProjectDetails fetched-items section.
    """
    # Verify project access
    project = get_project_by_id(project_id, owner_id=owner_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")
    try:
        items = get_project_fetched_items(project_id, keyword_filter=keyword, limit=min(limit, 100))
        return {"status": "success", "total": len(items), "items": items}
    except Exception as e:
        return {"status": "error", "message": str(e), "total": 0, "items": []}


# ============================================================
# ENDPOINT 21b-ii: PROJECTS — SCRAPER STATUS
# ============================================================
@app.get("/api/projects/{project_id}/scraper-status")
async def get_project_scraper_status_endpoint(project_id: int, owner_id: int = None):
    """
    Return dynamic scraper status derived from real intake data.
    Never hardcodes Idle/Never — always derived from DB records.
    """
    project = get_project_by_id(project_id, owner_id=owner_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")
    try:
        status_data = get_project_scraper_status(project_id)
        return {"status": "success", "scraper": status_data}
    except Exception as e:
        return {"status": "error", "message": str(e), "scraper": {}}


# ============================================================
# ENDPOINT 21c: PROJECTS — UPDATE
# ============================================================
class ProjectUpdateRequest(BaseModel):
    name: str = None
    status: str = None
    scraper_status: str = None
    ai_agent_status: str = None
    schedule_interval: str = None
    keywords: list = None
    completion_reason: str = None
    visibility: str = None
    source_type: str = None
    source_url: str = None
    owner_id: int = None


@app.put("/api/projects/{project_id}")
async def update_project_endpoint(project_id: int, req: ProjectUpdateRequest):
    """Update a project's mutable fields. Enforces ownership via req.owner_id."""
    import json as _json
    update_kwargs = {}
    if req.name is not None:              update_kwargs['name'] = req.name.strip()
    if req.status is not None:            update_kwargs['status'] = req.status
    if req.scraper_status is not None:    update_kwargs['scraper_status'] = req.scraper_status
    if req.ai_agent_status is not None:   update_kwargs['ai_agent_status'] = req.ai_agent_status
    if req.schedule_interval is not None: update_kwargs['schedule_interval'] = req.schedule_interval
    if req.completion_reason is not None: update_kwargs['completion_reason'] = req.completion_reason
    if req.visibility is not None:        update_kwargs['visibility'] = req.visibility
    if req.source_type is not None:       update_kwargs['source_type'] = req.source_type
    if req.source_url is not None:        update_kwargs['source_url'] = req.source_url
    if req.keywords is not None:
        update_kwargs['keywords_json'] = _json.dumps(req.keywords)

    updated = update_project(project_id, owner_id=req.owner_id, **update_kwargs)
    if not updated:
        raise HTTPException(status_code=404, detail="Project not found or access denied")
    return {"status": "success", "project": updated}


# ============================================================
# ENDPOINT 21d: PROJECTS — DELETE
# ============================================================
@app.delete("/api/projects/{project_id}")
async def delete_project_endpoint(project_id: int, owner_id: int = None):
    """Hard-delete a project. Pass owner_id to enforce ownership."""
    ok = delete_project(project_id, owner_id=owner_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Project not found or access denied")
    return {"status": "success", "message": f"Project {project_id} deleted"}


# ============================================================
# ENDPOINT 22: SIGNALS — ALL ADVERSE EVENT RECORDS
# ============================================================
@app.get("/api/signals")
async def signals_feed():
    """
    Return all processed adverse event signals from the Intelligence Vault.
    This is the canonical endpoint for Alerts.jsx and TrendAnalysis.jsx.
    """
    try:
        signals = get_all_signals()
        return {"status": "success", "total": len(signals), "records": signals}
    except Exception as e:
        return {"status": "error", "message": str(e), "total": 0, "records": []}


# ============================================================
# ENDPOINT 23: TRENDS — DAILY SIGNAL TIMELINE FOR RECHARTS
# ============================================================
@app.get("/api/trends")
async def trends_feed(days: int = 14):
    """
    Return a day-by-day signal count for the last N days.
    Shape: [{date, signals, critical, high}, ...]
    """
    try:
        data = get_trends_data(days=days)
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "error", "message": str(e), "data": []}


if __name__ == "__main__":
    import uvicorn
    import socket
    import subprocess
    import sys
    import signal
    import pathlib

    # ── Port preference: .env → PORT env-var → default 8080 ────
    _preferred = int(os.environ.get("BACKEND_PORT", os.environ.get("PORT", 8080)))
    _fallbacks  = [_preferred, 8081, 8082, 8083, 8000]

    def _port_in_use(port: int) -> bool:
        """Check whether a TCP port is already bound."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return False
            except OSError:
                return True

    def _kill_pid_on_port(port: int) -> bool:
        """
        On Windows: use netstat + taskkill to free a bound port.
        Returns True if a process was killed.
        """
        try:
            # Find PID listening on this port
            out = subprocess.check_output(
                f"netstat -ano | findstr :{port}", shell=True, stderr=subprocess.DEVNULL
            ).decode()
            for line in out.strip().splitlines():
                parts = line.split()
                if len(parts) >= 5 and f":{port}" in parts[1] and parts[3] == "LISTENING":
                    pid = int(parts[4])
                    subprocess.call(f"taskkill /F /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    print(f"   [PORT-MGR] Killed stale process PID={pid} on :{port}")
                    return True
        except Exception:
            pass
        return False

    def _find_free_port(candidates: list) -> int:
        """
        Try each port in order.
        If occupied, attempt to kill the zombie; if that fails, try next port.
        """
        for port in candidates:
            if not _port_in_use(port):
                return port
            print(f"   [PORT-MGR] Port {port} occupied — attempting to free it …")
            killed = _kill_pid_on_port(port)
            if killed:
                import time; time.sleep(1)   # give OS time to release the socket
                if not _port_in_use(port):
                    print(f"   [PORT-MGR] [OK] Port {port} freed successfully")
                    return port
            print(f"   [PORT-MGR] [WARN]  Port {port} still busy — trying next …")
        raise RuntimeError(
            f"All candidate ports are occupied: {candidates}\n"
            "  → Close any running Python/uvicorn processes and retry."
        )

    # ── Resolve the port ─────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  AyuScout V2 — Port Manager")
    print("=" * 60)
    try:
        active_port = _find_free_port(_fallbacks)
    except RuntimeError as e:
        print(f"\n[ERROR] {e}")
        sys.exit(1)

    if active_port != _preferred:
        print(f"   [PORT-MGR] [WARN]  Preferred port {_preferred} busy -> using {active_port}")
        print(f"   [PORT-MGR]    Update BACKEND_PORT={active_port} in backend/.env to silence this.")
    else:
        print(f"   [PORT-MGR] [OK]  Port {active_port} is free")

    # ── Write active port so the frontend .env.local can be synced ──
    port_file = pathlib.Path(__file__).parent / ".active_port"
    port_file.write_text(str(active_port))

    print(f"\n   [OK] Backend  -> http://localhost:{active_port}")
    print(f"   [OK] API Docs -> http://localhost:{active_port}/docs")
    print("=" * 60 + "\n")

    # ── Launch uvicorn (reload=False prevents double-spawn on Windows) ──
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=active_port,
        reload=False,           # reload=True causes WinError 10048 via multiprocessing
        log_level="info",
    )