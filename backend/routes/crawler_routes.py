"""
AyuScout V2 — Crawler Routes
==============================
Endpoints:
  POST /api/crawler/run            — start a real crawler session (returns session_id)
  GET  /api/crawler/logs/{id}      — poll incremental DB logs (SSE-style polling)
  GET  /api/crawler/session/{id}   — session status + stats
  GET  /api/sources                — source registry listing

All logs come from the REAL crawler engine stored in DB.
Zero fake/hardcoded terminal output.
"""

import asyncio
import traceback

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from database import (
    create_crawler_session,
    emit_crawler_log,
    get_crawler_logs_since,
    finish_crawler_session,
    get_crawler_session,
)
from source_registry import (
    SOURCE_REGISTRY, get_source, build_crawl_url,
)
from crawler import run_live_agentic_crawler, run_twitterapi_crawler
from services.crawler_service import ingest_fetched_medical_record

router = APIRouter(prefix="/api", tags=["Crawler"])


# ── Request model ─────────────────────────────────────────────────────────────

class CrawlerRunRequest(BaseModel):
    url: str = ""              # Target URL (or "twitter" for API path)
    keyword: str               # Drug / topic keyword
    source_id: str = "generic_web"
    project_id: Optional[int] = None
    max_records: int = 15


# ── Source Registry endpoint ──────────────────────────────────────────────────

@router.get("/sources")
async def list_sources():
    """Return all enabled sources for frontend dropdowns/wizard."""
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


# ── Background crawler task ───────────────────────────────────────────────────

async def _run_crawler_background(
    session_id: int,
    url: str,
    keyword: str,
    source_id: str,
    project_id: Optional[int],
    max_records: int,
):
    """
    Real crawler background task.
    Every log line is written to CrawlerLog DB — the polling endpoint
    returns these incrementally so the frontend terminal shows REAL output.
    """
    records_fetched  = 0
    records_matched  = 0
    healing_attempts = 0
    final_status     = "completed"

    def _log(msg: str, event_type: str = "INFO", level: str = "INFO", meta: dict = None):
        emit_crawler_log(
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

    try:
        # ── Determine path: Twitter API vs web scraper ────────────────────────
        is_twitter = (
            source_id == "twitter"
            or url in ("twitter", "x", "x/twitter", "")
            or "twitter.com" in (url or "")
            or "x.com" in (url or "")
        )

        if is_twitter:
            _log(
                f"X/Twitter source detected — switching to TwitterAPI.io ingestion engine",
                "FETCH", "INFO",
            )

            result = await asyncio.to_thread(
                run_twitterapi_crawler,
                keyword=keyword,
                hours_back=48,
                max_requests=1,
                max_tweets_to_save=max_records,
                dry_run=False,
            )

            raw_records = result.get("records", [])
            records_fetched = len(raw_records)
            _log(
                f"Twitter engine returned {records_fetched} tweet(s) for keyword: '{keyword}'",
                "PARSE", "INFO", {"count": records_fetched},
            )

            for rec in raw_records:
                tweet_text = rec.get("tweet", "")
                if not tweet_text.strip():
                    continue
                ingest_result = await asyncio.to_thread(
                    ingest_fetched_medical_record,
                    text=tweet_text,
                    keyword=keyword,
                    source_id="twitter",
                    source_label="X/Twitter",
                    source_url=rec.get("url", ""),
                    project_id=project_id,
                    session_id=session_id,
                )
                if ingest_result.get("status") == "ingested":
                    records_matched += 1

        else:
            # ── Web scraper path (self-healing) ──────────────────────────────
            _log(f"Fetching URL: {url}", "FETCH", "INFO", {"url": url})

            result = await asyncio.to_thread(
                run_live_agentic_crawler,
                url=url,
                keyword=keyword,
            )

            # Re-emit the crawler's real runtime logs into DB
            for log_line in result.get("logs", []):
                if "[ERROR]" in log_line:
                    evt, lvl = "ERROR", "ERROR"
                elif "[AGENT]" in log_line or "heal" in log_line.lower():
                    evt, lvl = "HEALING", "WARNING"
                    healing_attempts += 1
                elif "[SUCCESS]" in log_line:
                    evt, lvl = "SUCCESS", "SUCCESS"
                elif "[AI]" in log_line:
                    evt, lvl = "AI_ANALYSIS", "INFO"
                elif "[INFO]" in log_line:
                    evt, lvl = "FETCH", "INFO"
                else:
                    evt, lvl = "INFO", "INFO"

                emit_crawler_log(
                    session_id=session_id,
                    message=log_line,
                    event_type=evt,
                    level=lvl,
                    source=source_id,
                    project_id=project_id,
                    keyword=keyword,
                    url=url,
                )

            raw_records = result.get("records", [])
            records_fetched = len(raw_records)

            source_def = get_source(source_id)
            source_label = source_def["name"] if source_def else source_id

            for rec in raw_records[:max_records]:
                text = rec.get("text", "")
                if not text.strip():
                    continue
                ingest_result = await asyncio.to_thread(
                    ingest_fetched_medical_record,
                    text=text,
                    keyword=keyword,
                    source_id=source_id,
                    source_label=source_label,
                    source_url=url,
                    project_id=project_id,
                    session_id=session_id,
                )
                if ingest_result.get("status") == "ingested":
                    records_matched += 1

        # ── Final summary logs ────────────────────────────────────────────────
        _log(
            f"Crawl complete — {records_fetched} fetched, {records_matched} matched, "
            f"{healing_attempts} healing attempt(s)",
            "SUCCESS", "SUCCESS",
            {"fetched": records_fetched, "matched": records_matched, "healed": healing_attempts},
        )
        if records_matched > 0:
            _log(
                f"Data Explorer, Alerts, Reports updated with {records_matched} new signal(s)",
                "PROJECT_UPDATE", "SUCCESS",
            )
        else:
            _log(
                f"No medically relevant content found for '{keyword}' on this source — "
                "no false alerts/reports generated",
                "INFO", "INFO",
            )

    except Exception as e:
        final_status = "failed"
        _log(f"Crawler failed: {type(e).__name__}: {e}", "ERROR", "ERROR")
        traceback.print_exc()

    finally:
        finish_crawler_session(
            session_id=session_id,
            status=final_status,
            records_fetched=records_fetched,
            records_matched=records_matched,
            healing_attempts=healing_attempts,
        )


# ── POST /api/crawler/run ─────────────────────────────────────────────────────

@router.post("/crawler/run")
async def crawler_run(req: CrawlerRunRequest, background_tasks: BackgroundTasks):
    """
    Start a new self-healing crawler run.
    Returns session_id immediately — frontend polls /api/crawler/logs/{session_id}.
    """
    kw = (req.keyword or "").strip()
    if not kw:
        raise HTTPException(status_code=422, detail="keyword is required")

    source_def = get_source(req.source_id)
    source_name = source_def["name"] if source_def else req.source_id

    target_url = (req.url or "").strip()
    if not target_url and source_def:
        target_url = build_crawl_url(source_def, kw)

    # Create DB session record
    session_id = create_crawler_session(
        project_id=req.project_id,
        source_id=req.source_id,
        keyword=kw,
        target_url=target_url,
    )
    if session_id < 0:
        raise HTTPException(status_code=500, detail="Failed to create crawler session")

    # Emit initial boot log
    emit_crawler_log(
        session_id=session_id,
        message=f"[INIT] Crawler session {session_id} started — keyword: '{kw}', source: {source_name}",
        event_type="INIT", level="INFO",
        source=req.source_id, project_id=req.project_id,
        keyword=kw, url=target_url,
    )
    emit_crawler_log(
        session_id=session_id,
        message=f"[FETCH] Target: {target_url or '(API-based: ' + source_name + ')'}",
        event_type="FETCH", level="INFO",
        source=req.source_id, project_id=req.project_id,
        keyword=kw, url=target_url,
    )

    background_tasks.add_task(
        _run_crawler_background,
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
    }


# ── GET /api/crawler/logs/{session_id} ───────────────────────────────────────

@router.get("/crawler/logs/{session_id}")
async def crawler_logs(session_id: int, after_id: int = 0):
    """
    Return incremental log entries for a session (id > after_id).
    Frontend polls with increasing after_id — simulates SSE with plain HTTP.
    Zero fake content — every line is a real DB record from actual runtime.
    """
    logs = get_crawler_logs_since(session_id, after_id)
    session_info = get_crawler_session(session_id)
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


# ── GET /api/crawler/session/{session_id} ─────────────────────────────────────

@router.get("/crawler/session/{session_id}")
async def crawler_session_status(session_id: int):
    """Return live session status and final stats."""
    info = get_crawler_session(session_id)
    if not info:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "success", "session": info}
