"""Quick end-to-end demo verification script."""
import urllib.request
import json

BASE = "http://localhost:8080"

def get(path):
    r = urllib.request.urlopen(BASE + path, timeout=10)
    return json.loads(r.read())

def post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        BASE + path, data=data,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    r = urllib.request.urlopen(req, timeout=30)
    return json.loads(r.read())

print("=" * 60)
print("  SignalRx AI — Demo Verification")
print("=" * 60)

# ── Health ────────────────────────────────────────────────────
h = get("/api/health")
print(f"\n[HEALTH] Status: {h['status']}")

# ── Signals ───────────────────────────────────────────────────
d = get("/api/signals")
signals = d["records"]
print(f"\n[STEP 3] Alerts — signals in DB: {len(signals)}")
if signals:
    s = signals[0]
    print(f"  First record: drug={s.get('drug','N/A')}  event={s.get('event','N/A')}")
    print(f"  severity={s.get('severity','N/A')}  causality={s.get('causality','N/A')}")

# ── Trends ────────────────────────────────────────────────────
d2 = get("/api/trends?days=7")
print(f"\n[STEP 4] Trends — {len(d2['data'])} day buckets:")
for day in d2["data"]:
    bar = "#" * min(day["signals"], 30)
    print(f"  {day['date']:>8}: {bar} ({day['signals']})")

# ── Dashboard stats ───────────────────────────────────────────
d3 = get("/api/dashboard-stats")
sev = d3.get("severity_counts", {})
print(f"\n[STEP 4] Dashboard stats:")
print(f"  total={d3.get('total_records',0)}")
print(f"  Critical={sev.get('Critical',0)}  High={sev.get('High',0)}")
print(f"  Medium={sev.get('Medium',0)}  Low={sev.get('Low',0)}")

# ── Projects ──────────────────────────────────────────────────
d4 = get("/api/projects")
print(f"\n[STEP 1] Projects in DB: {d4['total']}")

# ── Agentic scraper generate ──────────────────────────────────
print("\n[STEP 1] POST /api/agentic-scraper/generate (Wikipedia)...")
try:
    d5 = post("/api/agentic-scraper/generate",
              {"url": "https://en.wikipedia.org/wiki/Aspirin"})
    print(f"  status: {d5['status']}")
    print(f"  domain: {d5.get('domain')}")
    print(f"  selectors: {list(d5.get('selectors', {}).keys())}")
    print(f"  confidence: {d5.get('confidence_score')}")
except Exception as e:
    print(f"  ERROR: {e}")

# ── Crawler run ────────────────────────────────────────────────
print("\n[STEP 2] POST /api/crawler/run (Wikipedia/Aspirin)...")
try:
    d6 = post("/api/crawler/run",
              {"url": "https://en.wikipedia.org/wiki/Aspirin", "keyword": "Aspirin"})
    logs = d6.get("logs", [])
    records = d6.get("records", [])
    print(f"  status: {d6['status']}")
    print(f"  log lines: {len(logs)}  records: {len(records)}")
    for log in logs:
        print(f"    {log}")
except Exception as e:
    print(f"  ERROR: {e}")

# ── Final signal count ────────────────────────────────────────
d7 = get("/api/signals")
print(f"\n[FINAL] Signals in DB after crawler run: {len(d7['records'])}")

print("\n" + "=" * 60)
print("  ALL DEMO CHECKS COMPLETE")
print("=" * 60)
