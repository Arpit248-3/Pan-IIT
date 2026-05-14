"""
Full Demo Test — SignalRx AI
Tests all 4 steps from DEMO_TESTING_PLAN.md against the live backend.
"""
import urllib.request
import urllib.error
import json

BASE = "http://localhost:8080"

def get(path):
    r = urllib.request.urlopen(BASE + path, timeout=15)
    return json.loads(r.read())

def post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        BASE + path, data=data,
        headers={"Content-Type": "application/json"}
    )
    r = urllib.request.urlopen(req, timeout=90)
    return json.loads(r.read())

SEP = "=" * 60

print(SEP)
print("  FULL DEMO TESTING -- All 4 Steps")
print(SEP)

# ─── PREREQUISITES ────────────────────────────────────────────
print("\n[PREREQ] Health check...")
try:
    h = get("/health")
    print("  status:", h.get("status"))
    print("  db_signals:", h.get("db_signals"))
    print("  ollama:", h.get("ollama"))
except Exception as e:
    print("  ERROR:", e)

# ─── STEP 1 ───────────────────────────────────────────────────
print("\n[STEP 1] Agentic Scraper - Generate selectors for Wikipedia...")
try:
    s1 = post("/api/agentic-scraper/generate", {
        "url": "https://en.wikipedia.org/wiki/Aspirin",
        "keyword": "Aspirin",
        "source_type": "forum"
    })
    print("  status:", s1.get("status"))
    print("  domain:", s1.get("domain"))
    print("  selectors:", s1.get("selectors"))
    conf = s1.get("config", {}).get("confidence_score", s1.get("confidence", 0))
    print("  confidence_score:", conf)
    step1_pass = s1.get("status") == "success" and len(s1.get("selectors", [])) > 0
except Exception as e:
    print("  ERROR:", e)
    step1_pass = False
print("  PASS:", step1_pass)

# ─── STEP 2 ───────────────────────────────────────────────────
print("\n[STEP 2] Self-Healing Crawler - Run against Wikipedia/Aspirin...")
try:
    sigs_before = get("/api/signals")
    count_before = sigs_before.get("total", 0)
    print("  Signals before crawl:", count_before)

    s2 = post("/api/crawler/run", {
        "url": "https://en.wikipedia.org/wiki/Aspirin",
        "keyword": "Aspirin",
        "project_id": 1
    })
    print("  status:", s2.get("status"))
    logs = s2.get("logs", [])
    print("  log_lines:", len(logs))
    records_saved = s2.get("records_saved", s2.get("records", 0))
    print("  records_saved:", records_saved)
    print("  Last 5 log lines:")
    for line in logs[-5:]:
        print("   ", line)

    sigs_after = get("/api/signals")
    count_after = sigs_after.get("total", 0)
    print("  Signals after crawl:", count_after, "(+" + str(count_after - count_before) + ")")
    step2_pass = s2.get("status") == "success" and any("[SUCCESS]" in l for l in logs)
except Exception as e:
    print("  ERROR:", e)
    step2_pass = False
print("  PASS:", step2_pass)

# ─── STEP 3 ───────────────────────────────────────────────────
print("\n[STEP 3] Alerts - Verify SQLite records...")
try:
    sigs = get("/api/signals")
    total = sigs.get("total", 0)
    print("  total signals:", total)
    records = sigs.get("signals", sigs.get("data", []))
    if records:
        first = records[0]
        print("  First drug:", first.get("drug_name"))
        print("  First event:", first.get("adverse_event"))
        print("  First causality:", first.get("causality"))
        print("  First confidence:", first.get("confidence_score"))
        print("  First severity:", first.get("severity"))
    aspirin_sigs = [s for s in records if "aspirin" in str(s.get("drug_name", "")).lower()]
    print("  Aspirin signals:", len(aspirin_sigs))
    step3_pass = total > 0 and len(records) > 0
except Exception as e:
    print("  ERROR:", e)
    step3_pass = False
print("  PASS:", step3_pass)

# ─── STEP 4 ───────────────────────────────────────────────────
print("\n[STEP 4] Trend Analysis - Verify live chart data...")
try:
    trends = get("/api/trends")
    buckets = trends.get("trends", [])
    print("  trend buckets:", len(buckets))
    for t in buckets:
        bar = "#" * min(t.get("count", 0), 30)
        print("  " + t["date"] + ": " + bar + " (" + str(t["count"]) + ")")

    stats = get("/api/dashboard-stats")
    total_signals = stats.get("total_signals", stats.get("total", 0))
    print("  total_signals:", total_signals)
    print("  critical:", stats.get("critical"))
    print("  high:", stats.get("high"))
    print("  unique_drugs:", stats.get("unique_drugs", "N/A"))
    step4_pass = len(buckets) >= 7 and total_signals > 0
except Exception as e:
    print("  ERROR:", e)
    step4_pass = False
print("  PASS:", step4_pass)

# ─── SUMMARY ──────────────────────────────────────────────────
print()
print(SEP)
print("  SUMMARY")
print(SEP)
print("  Step 1 (Agentic Scraper):      " + ("PASS" if step1_pass else "FAIL"))
print("  Step 2 (Self-Healing Crawler): " + ("PASS" if step2_pass else "FAIL"))
print("  Step 3 (Alerts / Signals DB):  " + ("PASS" if step3_pass else "FAIL"))
print("  Step 4 (Trend Analysis):       " + ("PASS" if step4_pass else "FAIL"))
all_pass = step1_pass and step2_pass and step3_pass and step4_pass
print("  ALL STEPS: " + ("ALL PASS ✓" if all_pass else "SOME FAILURES ✗"))
print(SEP)
