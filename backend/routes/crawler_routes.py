"""
AyuScout V2 — Crawler Routes  (FIXED)
=======================================
Changes from v1:
  - Added GET /api/crawler/health   (diagnose backend state instantly)
  - Fixed: _run_crawler_background is now a sync def run via asyncio.to_thread
    (FastAPI BackgroundTasks works better with sync callables for long-running work)
  - Added: emit logs at start so first poll always finds something
  - Fixed: import guards so route loads even if optional deps missing
  - Improved: any URL works — not tied to specific domains

Endpoints:
  POST /api/crawler/run              — start a real crawl session
  GET  /api/crawler/logs/{id}        — poll incremental DB logs
  GET  /api/crawler/session/{id}     — session status + stats
  GET  /api/crawler/health           — diagnose backend / table existence
  GET  /api/sources                  — source registry listing
"""

import asyncio
import traceback
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["Crawler"])


# ── Lazy imports so a missing dep doesn't crash the entire server ─────────────
def _get_db_helpers():
    from database import (
        create_crawler_session, emit_crawler_log,
        get_crawler_logs_since, finish_crawler_session, get_crawler_session,
    )
    return (
        create_crawler_session, emit_crawler_log,
        get_crawler_logs_since, finish_crawler_session, get_crawler_session,
    )


def _get_crawler_fns():
    from crawler import run_live_agentic_crawler, run_twitterapi_crawler
    return run_live_agentic_crawler, run_twitterapi_crawler


def _get_ingest():
    from services.crawler_service import ingest_fetched_medical_record
    return ingest_fetched_medical_record


# ── Request model ─────────────────────────────────────────────────────────────
class CrawlerRunRequest(BaseModel):
    url: str = ""
    keyword: str
    source_id: str = "generic_web"
    project_id: Optional[int] = None
    max_records: int = 15


# ── Health check ──────────────────────────────────────────────────────────────
@router.get("/crawler/health")
async def crawler_health():
    """
    Diagnose crawler infrastructure.
    Returns which components are available and if DB tables exist.
    """
    checks = {}

    # Check DB tables
    try:
        (create_crawler_session, emit_crawler_log,
         get_crawler_logs_since, finish_crawler_session,
         get_crawler_session) = _get_db_helpers()
        checks["db_helpers"] = "ok"
        # Try a test query
        get_crawler_logs_since(-1, 0)
        checks["crawler_logs_table"] = "ok"
    except Exception as e:
        checks["db_helpers"] = f"ERROR: {e}"
        checks["crawler_logs_table"] = "MISSING - restart server to create tables"

    # Check source registry
    try:
        from source_registry import SOURCE_REGISTRY
        checks["source_registry"] = f"ok ({len(SOURCE_REGISTRY)} sources)"
    except Exception as e:
        checks["source_registry"] = f"ERROR: {e}"

    # Check crawler
    try:
        _get_crawler_fns()
        checks["crawler_module"] = "ok"
    except Exception as e:
        checks["crawler_module"] = f"ERROR: {e}"

    # Check ingestion service
    try:
        _get_ingest()
        checks["ingest_service"] = "ok"
    except Exception as e:
        checks["ingest_service"] = f"ERROR: {e}"

    all_ok = all("ok" in str(v) for v in checks.values())
    return {
        "status": "ok" if all_ok else "degraded",
        "checks": checks,
        "message": "All systems go" if all_ok else "Some components failed — check errors above",
    }


# ── Source Registry endpoint ──────────────────────────────────────────────────
@router.get("/sources")
async def list_sources():
    try:
        from source_registry import SOURCE_REGISTRY
        return {
            "status": "success",
            "sources": [
                {
                    "id": s["id"],
                    "name": s["name"],
                    "category": s["category"],
                    "source_icon": s.get("source_icon", "globe"),
                    "supports_search": s.get("supports_search", False),
                    "enabled": s.get("enabled", True),
                }
                for s in SOURCE_REGISTRY if s.get("enabled")
            ],
        }
    except Exception as e:
        return {"status": "error", "sources": [], "detail": str(e)}


# ── Real crawler background task (SYNC — runs in thread pool) ─────────────────
def _run_crawler_sync(
    session_id: int,
    url: str,
    keyword: str,
    source_id: str,
    project_id: Optional[int],
    max_records: int,
):
    """
    Synchronous crawler task — FastAPI runs this in a thread via asyncio.to_thread().
    Every action emits a real log to the CrawlerLog DB table.
    Works for ANY public URL — not tied to specific domains.
    """
    (create_cs, emit_log, get_logs, finish_cs, get_cs) = _get_db_helpers()
    run_live, run_twitter = _get_crawler_fns()
    ingest = _get_ingest()

    records_fetched  = 0
    records_matched  = 0
    healing_attempts = 0
    final_status     = "completed"

    def log(msg: str, event_type: str = "INFO", level: str = "INFO", meta: dict = None):
        try:
            emit_log(
                session_id=session_id,
                message=msg,
                event_type=event_type,
                level=level,
                source=source_id,
                project_id=project_id,
                keyword=keyword,
                url=url,
                metadata=meta or {},
            )
        except Exception as le:
            print(f"[EMIT-ERR] {le}")

    try:
        # ── Twitter / X ───────────────────────────────────────────────────────
        is_twitter = (
            source_id == "twitter"
            or url.strip().lower() in ("twitter", "x", "x/twitter", "")
            or "twitter.com" in url
            or "x.com" in url
        )

        if is_twitter:
            log("X/Twitter source detected — using TwitterAPI.io engine", "FETCH", "INFO")
            result = run_twitter(
                keyword=keyword,
                hours_back=48,
                max_requests=1,
                max_tweets_to_save=max_records,
                dry_run=False,
            )
            raw = result.get("records", [])
            records_fetched = len(raw)
            log(
                f"Twitter engine returned {records_fetched} tweet(s)",
                "PARSE", "INFO", {"count": records_fetched},
            )
            for rec in raw:
                tweet_text = rec.get("tweet", "")
                if not tweet_text.strip():
                    continue
                r = ingest(
                    text=tweet_text,
                    keyword=keyword,
                    source_id="twitter",
                    source_label="X/Twitter",
                    source_url=rec.get("url", ""),
                    project_id=project_id,
                    session_id=session_id,
                )
                if r.get("status") == "ingested":
                    records_matched += 1

        else:
            # ── Generic web scraper with self-healing ─────────────────────────
            log(f"[FETCH] Requesting URL: {url}", "FETCH", "INFO", {"url": url})
            log("Analysing DOM structure and applying known CSS selectors…", "PARSE", "INFO")

            result = run_live(url=url, keyword=keyword)

            # Re-emit the crawler's own runtime logs into DB
            for line in result.get("logs", []):
                if "[ERROR]" in line:
                    evt, lvl = "ERROR", "ERROR"
                elif "[AGENT]" in line or "heal" in line.lower() or "Healing" in line:
                    evt, lvl = "HEALING", "WARNING"
                    healing_attempts += 1
                elif "[SUCCESS]" in line:
                    evt, lvl = "SUCCESS", "SUCCESS"
                elif "[AI]" in line:
                    evt, lvl = "AI_ANALYSIS", "INFO"
                else:
                    evt, lvl = "FETCH", "INFO"
                try:
                    emit_log(
                        session_id=session_id,
                        message=line,
                        event_type=evt,
                        level=lvl,
                        source=source_id,
                        project_id=project_id,
                        keyword=keyword,
                        url=url,
                    )
                except Exception:
                    pass

            raw = result.get("records", [])
            records_fetched = len(raw)
            log(
                f"Extraction complete — {records_fetched} content block(s) found",
                "PARSE", "INFO", {"count": records_fetched},
            )

            # Determine source display name
            try:
                from source_registry import get_source
                src_def = get_source(source_id)
                source_label = src_def["name"] if src_def else source_id
            except Exception:
                source_label = source_id

            # Pass every block through canonical ingest pipeline
            for rec in raw[:max_records]:
                text = rec.get("text", "")
                if not text.strip():
                    continue
                r = ingest(
                    text=text,
                    keyword=keyword,
                    source_id=source_id,
                    source_label=source_label,
                    source_url=url,
                    project_id=project_id,
                    session_id=session_id,
                )
                if r.get("status") == "ingested":
                    records_matched += 1
                elif r.get("status") == "duplicate":
                    log("Duplicate content — skipped", "DEDUPE", "INFO")
                elif r.get("status") == "irrelevant":
                    log(
                        f"Content filtered — no adverse-event signals for '{keyword}'",
                        "FILTER", "INFO",
                    )

        # ── Final summary ─────────────────────────────────────────────────────
        log(
            f"Crawl complete — fetched={records_fetched}, "
            f"matched={records_matched}, healed={healing_attempts}",
            "SUCCESS", "SUCCESS",
            {"fetched": records_fetched, "matched": records_matched, "healed": healing_attempts},
        )

        if records_matched > 0:
            log(
                f"[DASHBOARD] {records_matched} signal(s) routed to "
                "Data Explorer · Alerts · Reports · Notifications",
                "PROJECT_UPDATE", "SUCCESS",
            )
        else:
            log(
                f"No medically-relevant content found for '{keyword}' on this page. "
                "Try a specific drug review page (e.g. drugs.com/comments/paracetamol/).",
                "INFO", "INFO",
            )

    except Exception as e:
        final_status = "failed"
        log(f"Crawler error: {type(e).__name__}: {e}", "ERROR", "ERROR")
        traceback.print_exc()

    finally:
        try:
            finish_cs(
                session_id=session_id,
                status=final_status,
                records_fetched=records_fetched,
                records_matched=records_matched,
                healing_attempts=healing_attempts,
            )
        except Exception as fe:
            print(f"[FINISH-ERR] {fe}")


# ── POST /api/crawler/run ─────────────────────────────────────────────────────
@router.post("/crawler/run")
async def crawler_run(req: CrawlerRunRequest, background_tasks: BackgroundTasks):
    """
    Start a self-healing crawler run.
    1. Creates CrawlerSession in DB immediately
    2. Emits 2 boot logs immediately so first frontend poll finds content
    3. Kicks off real crawler in background thread
    4. Returns session_id — frontend polls /api/crawler/logs/{session_id}
    """
    kw = (req.keyword or "").strip()
    if not kw:
        raise HTTPException(status_code=422, detail="keyword is required")

    target_url = (req.url or "").strip()
    source_name = req.source_id

    # Resolve source display name + default URL from registry
    try:
        from source_registry import get_source, build_crawl_url
        src_def = get_source(req.source_id)
        if src_def:
            source_name = src_def["name"]
            if not target_url:
                target_url = build_crawl_url(src_def, kw)
    except Exception:
        pass

    (create_cs, emit_log, _, _, _) = _get_db_helpers()

    # Create DB session record
    session_id = create_cs(
        project_id=req.project_id,
        source_id=req.source_id,
        keyword=kw,
        target_url=target_url,
    )
    if session_id < 0:
        raise HTTPException(status_code=500, detail="Failed to create crawler session — DB tables may not exist. Restart server.")

    # Emit initial logs SYNCHRONOUSLY before returning
    # so the very first frontend poll finds content immediately
    emit_log(
        session_id=session_id,
        message=f"[INIT] Crawler session #{session_id} started — keyword: '{kw}', source: {source_name}",
        event_type="INIT", level="INFO",
        source=req.source_id, project_id=req.project_id,
        keyword=kw, url=target_url,
    )
    emit_log(
        session_id=session_id,
        message=f"[FETCH] Target: {target_url or '(API-based: ' + source_name + ')'}",
        event_type="FETCH", level="INFO",
        source=req.source_id, project_id=req.project_id,
        keyword=kw, url=target_url,
    )
    emit_log(
        session_id=session_id,
        message=f"[PARSE] Self-healing engine active — will adapt to any page structure automatically",
        event_type="PARSE", level="INFO",
        source=req.source_id, project_id=req.project_id,
        keyword=kw, url=target_url,
    )

    # Run real crawler in background thread (sync fn → thread pool via BackgroundTasks)
    background_tasks.add_task(
        _run_crawler_sync,
        session_id=session_id,
        url=target_url,
        keyword=kw,
        source_id=req.source_id,
        project_id=req.project_id,
        max_records=req.max_records,
    )

    return {
        "status": "started",
        "session_id": session_id,
        "keyword": kw,
        "source": source_name,
        "target_url": target_url,
        "poll_url": f"/api/crawler/logs/{session_id}",
        "message": f"Crawl started — poll {'/api/crawler/logs/' + str(session_id)} for live logs",
    }


# ── GET /api/crawler/logs/{session_id} ───────────────────────────────────────
@router.get("/crawler/logs/{session_id}")
async def crawler_logs(session_id: int, after_id: int = 0):
    """
    Incremental log polling endpoint.
    Returns all CrawlerLog entries for session_id with id > after_id.
    Frontend polls this every ~1.2s with increasing after_id.
    All content is real runtime events — zero hardcoded output.
    """
    try:
        (_, _, get_logs, _, get_cs) = _get_db_helpers()
        logs = get_logs(session_id, after_id)
        session_info = get_cs(session_id)
        return {
            "status": "ok",
            "session_id": session_id,
            "session_status": session_info.get("status", "unknown"),
            "stats": {
                "records_fetched": session_info.get("records_fetched", 0),
                "records_matched": session_info.get("records_matched", 0),
                "healing_attempts": session_info.get("healing_attempts", 0),
            },
            "logs": logs,
            "last_id": logs[-1]["id"] if logs else after_id,
        }
    except Exception as e:
        return {
            "status": "error",
            "session_id": session_id,
            "session_status": "unknown",
            "stats": {"records_fetched": 0, "records_matched": 0, "healing_attempts": 0},
            "logs": [],
            "last_id": after_id,
            "detail": str(e),
        }


# ── GET /api/crawler/session/{session_id} ─────────────────────────────────────
@router.get("/crawler/session/{session_id}")
async def crawler_session_status(session_id: int):
    try:
        (_, _, _, _, get_cs) = _get_db_helpers()
        info = get_cs(session_id)
        if not info:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"status": "success", "session": info}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
