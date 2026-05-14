"""
AyuScout V2 — Standalone Project Scheduler
============================================
Reads all Active projects from signalrx.db and sets up scheduled simulated
crawler triggers based on each project's `schedule_interval` field.

Usage:
    python scheduler.py

Dependencies:
    pip install schedule sqlalchemy
"""

import time
import schedule
from datetime import datetime

from sqlalchemy import create_engine, text

# ── DB connection (same SQLite file the server uses) ──────────────────────────
ENGINE = create_engine(
    "sqlite:///signalrx.db",
    connect_args={"check_same_thread": False}
)

# ── Colour codes for a slightly nicer terminal output ─────────────────────────
CYAN   = "\033[96m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
BLUE   = "\033[94m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def _ts() -> str:
    """Current timestamp for log lines."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ── Crawler trigger simulation ────────────────────────────────────────────────

def trigger_crawler(project_id: int, project_name: str, interval: str, keywords: str):
    """Simulate a crawler run for a single project."""
    print(f"\n{BOLD}{CYAN}{'='*60}{RESET}")
    print(f"{GREEN}[SCHEDULER] {_ts()}{RESET}")
    print(f"{GREEN}[SCHEDULER] Triggering crawler for Project ID: {project_id}{RESET}")
    print(f"{GREEN}[SCHEDULER]   Name      : {project_name}{RESET}")
    print(f"{GREEN}[SCHEDULER]   Frequency : {interval}{RESET}")
    print(f"{GREEN}[SCHEDULER]   Keywords  : {keywords}{RESET}")
    print(f"{GREEN}[SCHEDULER] Dispatching self-healing agentic crawler…{RESET}")
    # Simulate processing steps
    time.sleep(0.5)
    print(f"{BLUE}[CRAWLER]   Fetching DOM from monitored sources…{RESET}")
    time.sleep(0.3)
    print(f"{BLUE}[CRAWLER]   Scanning for keywords: {keywords}{RESET}")
    time.sleep(0.3)
    print(f"{BLUE}[CRAWLER]   PII masking engaged — anonymising patient identifiers…{RESET}")
    time.sleep(0.2)
    print(f"{GREEN}[CRAWLER]   ✅ Run complete. Records queued for AI analysis pipeline.{RESET}")
    print(f"{BOLD}{CYAN}{'='*60}{RESET}\n")


# ── Fetch Active projects from DB ─────────────────────────────────────────────

def fetch_active_projects() -> list[dict]:
    """Return all Active projects with their schedule_interval and keywords."""
    try:
        with ENGINE.connect() as conn:
            rows = conn.execute(text(
                "SELECT id, name, keywords_json, schedule_interval "
                "FROM projects WHERE status = 'Active'"
            )).fetchall()
        projects = []
        for row in rows:
            import json
            try:
                kws = json.loads(row[2] or "[]")
            except Exception:
                kws = []
            projects.append({
                "id":       row[0],
                "name":     row[1],
                "keywords": ", ".join(kws) if kws else "(none)",
                "interval": row[3] or "Daily",
            })
        return projects
    except Exception as e:
        print(f"{YELLOW}[SCHEDULER] [!] Could not fetch projects: {e}{RESET}")
        return []


# ── Register scheduled jobs ───────────────────────────────────────────────────

def setup_schedules():
    """Clear existing jobs and re-register based on current DB state."""
    schedule.clear()

    projects = fetch_active_projects()
    if not projects:
        print(f"{YELLOW}[SCHEDULER] No active projects found — will retry in 60 s…{RESET}")
        return

    print(f"\n{BOLD}[SCHEDULER] {_ts()} — Registering {len(projects)} project(s):{RESET}")

    for p in projects:
        pid, name, kws, interval = p["id"], p["name"], p["keywords"], p["interval"]

        # Build the job function (closure captures current values)
        def make_job(pid=pid, name=name, interval=interval, kws=kws):
            def job():
                trigger_crawler(pid, name, interval, kws)
            return job

        job_fn = make_job()
        norm = interval.strip().lower()

        if norm in ("real-time", "realtime", "stream"):
            # Simulate "real-time" as every 30 seconds for demo purposes
            schedule.every(30).seconds.do(job_fn)
            freq_desc = "every 30 s (real-time demo)"
        elif norm in ("daily", "daily batch"):
            schedule.every().day.at("08:00").do(job_fn)
            freq_desc = "daily at 08:00"
        elif norm in ("weekly", "weekly report"):
            schedule.every().monday.at("08:00").do(job_fn)
            freq_desc = "weekly on Monday 08:00"
        else:
            # Fallback: treat as daily
            schedule.every().day.at("08:00").do(job_fn)
            freq_desc = f"daily at 08:00 (fallback from '{interval}')"

        print(f"  {GREEN}✓{RESET}  [{pid}] \"{name}\" → {freq_desc}")

    print()


# ── Main loop ─────────────────────────────────────────────────────────────────

def main():
    print(f"\n{BOLD}{'='*60}")
    print(" AyuScout V2 — Project Scheduler")
    print(f"{'='*60}{RESET}")
    print(f"[SCHEDULER] {_ts()} — Starting up…")
    print(f"[SCHEDULER] DB path : signalrx.db")
    print(f"[SCHEDULER] Press Ctrl+C to stop.\n")

    # Initial schedule setup
    setup_schedules()

    # Refresh schedules every 5 minutes in case new projects are added
    schedule.every(5).minutes.do(setup_schedules)

    while True:
        schedule.run_pending()
        time.sleep(1)


if __name__ == "__main__":
    main()
