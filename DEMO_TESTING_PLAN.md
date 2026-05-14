# DEMO_TESTING_PLAN.md
# SignalRx AI — Live Demo Verification Checklist

> **Safe Target:** `https://en.wikipedia.org/wiki/Aspirin` | Keyword: `Aspirin`  
> All four steps below can be executed in under 5 minutes with both servers running.

---

## Prerequisites

| Service | Command | Expected Output |
|---------|---------|----------------|
| FastAPI backend | `cd backend && uvicorn server:app --host 0.0.0.0 --port 8080 --reload` | `Application startup complete` |
| Vite frontend  | `cd signalrx-dashboard && npm run dev` | `Local: http://localhost:5173` |

---

## Step 1 — Agentic Scraper: Generate Selectors for Wikipedia

**Location:** Sidebar → **Projects** → **Setup Wizard** button → Section **"5 — Agentic AI Source Onboarder"**

1. Confirm the URL input is pre-filled with `https://en.wikipedia.org/wiki/Aspirin`.
2. Click **"Auto-Generate Scraper"**.
3. Watch the terminal window inside the wizard. You should see log lines appear:
   - `[SYSTEM] Initializing Agentic Crawler…`
   - `[INFO] Fetching live HTML DOM from target URL…`
   - `[AGENT] Analyzing DOM structure…`
   - `[SUCCESS] Selectors generated: {"post_title": "h1#firstHeading", "post_body": "div#mw-content-text p", …}`
4. The **Generated Scraper Config** JSON block renders below with `confidence_score > 0.80`.

**✅ Pass Criteria:** JSON config contains non-empty `selectors` with real CSS selectors validated against the live Wikipedia DOM.

---

## Step 2 — Self-Healing Crawler: Run Against Wikipedia

**Location:** Sidebar → **Crawler** (or the page that renders `SelfHealingTerminal`)

1. Confirm **Target URL** = `https://en.wikipedia.org/wiki/Aspirin` and **Drug / Keyword** = `Aspirin`.
2. Click **"Deploy Agentic Crawler"**.
3. The right-side terminal streams log lines from the Python backend in real time:
   - If Wikipedia is reachable: logs show `[INFO] DOM fetched successfully`, keyword match count, PII masking, and end with `[SUCCESS] N records extracted`.
   - If a selector fails first: logs show `[ERROR] Critical Failure`, then `[AGENT] Initiating Vision-Based Self-Healing Protocol`, then `[AGENT] SUCCESS. New CSS Selector generated`.
4. The **Crawler State** card on the left progresses through: `Connecting & Fetching` → `(Error Detected)` → `AI Self-Healing` → `Extraction Complete`.
5. Stats badges appear: **Records**, **Confidence**, **Healed: YES**.

**✅ Pass Criteria:** At least one `[SUCCESS]` log line appears. The phase indicator reaches `Extraction Complete` (green).

---

## Step 3 — Alerts Page: Verify SQLite Records

**Location:** Sidebar → **Alerts**

1. After Step 2 completes, click **"Refresh Live"** in the Alerts page filter bar.
2. Check the **KPI cards** at the top:
   - **Total Signals** count should be ≥ 1 (incremented by the crawler run).
3. In the **"Live AI Signals"** table, look for a new row where:
   - **Drug** column = `Aspirin` (or extracted drug name from Wikipedia text).
   - **Causality** badge shows a WHO-UMC category (Certain / Probable / Possible / Unlikely).
   - **Confidence** pill shows a percentage.
4. Click **"AI Traceability"** on any row to open the Traceability Drawer and verify:
   - **Original Patient Text** section shows a masked excerpt from the Wikipedia Aspirin page.
   - **WHO-UMC Assessment Factors** list is non-empty.
   - **PubMed link** is clickable.
5. The **Signal Volume — 7 Day Trend** chart at the top should show today's date column with at least 1 signal (data sourced from `/api/trends`, not random numbers).

**✅ Pass Criteria:** New signal row visible in table; Traceability Drawer renders without errors; chart today-column > 0.

---

## Step 4 — Trend Analysis: Verify Live Chart Data

**Location:** Sidebar → **Trend Analysis**

1. The **KPI cards** should show updated counts pulled from `/api/dashboard-stats`:
   - **Total Signals** ≥ 1.
   - **Unique Drugs Tracked** ≥ 1.
2. The **"Volume of Adverse Safety Signals vs. Time"** chart:
   - X-axis labels are real calendar dates (e.g., `May 06`, `May 07`).
   - Today's bar/line point should be non-zero after the crawler ran.
   - The baseline reference line auto-calculates from real averages (not hardcoded `9`).
3. The **"Top Drugs by Signal Count"** progress bars show `Aspirin` (or the extracted drug) with a count ≥ 1.
4. The **"Causality Assessment Distribution"** area chart displays at least one category with signal count > 0.

**✅ Pass Criteria:** All four charts render with real database data. No "No data yet" placeholders visible after the crawler run.

---

## Troubleshooting Quick-Reference

| Symptom | Fix |
|---------|-----|
| `[ERROR] Failed to fetch URL` in crawler | Wikipedia may briefly throttle — wait 30 s and retry |
| Alerts table empty after crawler | Click **"Refresh Live"**; backend saves are async |
| `CORS error` in browser console | Ensure backend is on port **8080** and frontend on **5173** |
| `422 Unprocessable Entity` on `/api/projects` | Check `name` field is non-empty in the POST body |
| Ollama models not loading | Backend falls back to deterministic WHO-UMC scoring — all signals still save |
