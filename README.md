# 🧬 SignalRx AI — Autonomous Pharmacovigilance Intelligence Platform

> **"From Reddit to Regulatory Report in seconds — powered by Agentic AI."**

[![AI Bharat 2.0](https://img.shields.io/badge/AI%20Bharat%202.0-Hackathon%20Submission-8B5CF6?style=for-the-badge)](https://github.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-Agentic%20Pipeline-10B981?style=for-the-badge)](https://github.com/langchain-ai/langgraph)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge)](https://fastapi.tiangolo.com)
[![React + Vite](https://img.shields.io/badge/React%2019-Frontend-61DAFB?style=for-the-badge)](https://react.dev)

---

## 🚨 Problem Statement

India reports **~2 million adverse drug reactions (ADRs)** annually, yet **<1% are formally reported** to CDSCO. Traditional pharmacovigilance is:

- **Slow**: Manual review cycles take 6–18 months
- **Blind**: Misses 99% of patient-generated signals from social media & forums
- **Dumb**: Cannot separate emotional sentiment from true clinical risk
- **Expensive**: Enterprise PV tools cost ₹50L+/year and require specialists

**Patients are talking about ADRs online right now. Nobody is listening.**

---

## 💡 Solution — SignalRx AI

SignalRx AI is an **agentic pharmacovigilance platform** that:

1. 🕷️ **Autonomously crawls** patient communities (Reddit, Twitter, forums) using a Self-Healing AI scraper
2. 🧠 **Extracts clinical signals** via a LangGraph multi-agent pipeline running on Ollama LLMs
3. ⚖️ **Decouples** emotional sentiment from clinical severity (our key differentiator)
4. 🔒 **Masks PII** automatically before any data enters the AI pipeline (HIPAA/DPDP compliant)
5. 📋 **Generates** ICH E2B(R3) regulatory XML reports with one click

---

## 🏗️ Architecture

### LangGraph Agentic Pipeline

```
User Post / Forum Text
        │
        ▼
┌───────────────────┐
│   GUARD NODE      │  ← Filters non-medical content
│  (Safety Filter)  │  ← Detects drug mentions
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  GENERATOR NODE   │  ← LLM extracts: Drug, Symptom,
│  (Ollama llama3)  │     Onset, Dosage, MedDRA Code
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│   CRITIC NODE     │  ← Validates extraction quality
│  (Self-Review)    │  ← Re-prompts if confidence < 0.7
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│   DOCTOR NODE     │  ← WHO-UMC Causality Assessment
│  (Clinical AI)    │  ← Severity scoring (1-10)
│                   │  ← Sentiment vs Safety decoupling
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│   PII VAULT       │  ← Masks: Names, Phone, Email,
│  (Compliance)     │     Aadhaar, Location
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│   SQLite + Chroma │  ← Persistent storage
│   Vector Store    │  ← Semantic similarity search
└───────────────────┘
```

### Self-Healing Crawler Architecture

```
Target URL
    │
    ▼ Fetch HTML DOM
    │
    ├─► Try stored CSS selector
    │       │
    │       ├─ SUCCESS → Extract posts → PII Mask → Store
    │       │
    │       └─ FAIL (404 / DOM changed)
    │               │
    │               ▼
    │         Vision AI scans DOM tree
    │         Heuristic element scoring
    │         New selector generated (96% confidence)
    │         Selector saved to registry
    │               │
    │               └─► Retry → Extract → Store
```

### Full Stack Overview

```
┌─────────────────────────────────────────────────┐
│              REACT 19 + VITE FRONTEND           │
│  Dashboard │ Alerts │ Projects │ Trend Analysis  │
│  Command Center │ Crawler Terminal │ E2B Export  │
└────────────────────┬────────────────────────────┘
                     │ REST API (CORS enabled)
                     │ http://localhost:8080
┌────────────────────▼────────────────────────────┐
│           FASTAPI PYTHON BACKEND                │
│  /api/analyze-post    → LangGraph Pipeline      │
│  /api/run-crawler     → Self-Healing Scraper    │
│  /api/export-e2b/:id  → ICH E2B(R3) XML        │
│  /api/alerts-feed     → Signal Intelligence     │
│  /api/auth/*          → JWT Authentication      │
└──────┬──────────────┬──────────────┬────────────┘
       │              │              │
   SQLite DB      ChromaDB       Ollama LLM
  (structured)   (vectors)    (llama3.2:1b)
```

---

## ✨ Key Differentiators (15% Uniqueness Rubric)

| Feature | SignalRx AI | Traditional Tools |
|---|---|---|
| **Self-Healing Crawler** | Auto-regenerates CSS selectors when DOM changes | Manual update required |
| **Sentiment ≠ Severity** | Decouples emotional tone from clinical risk | Conflated — causes false alerts |
| **PII Vault** | Auto-masks before AI pipeline | Manual anonymization |
| **E2B(R3) One-Click** | ICH-compliant XML in 1 second | Days of manual form-filling |
| **Local LLM** | 100% on-premise, zero data egress | Cloud dependency, privacy risk |

---

## 🚀 Setup Instructions

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Python | 3.10+ | [python.org](https://python.org) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Ollama | Latest | [ollama.ai](https://ollama.ai) |
| Git | Any | [git-scm.com](https://git-scm.com) |

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/your-username/signalrx-ai.git
cd signalrx-ai
```

---

### Step 2 — Backend Setup (Python / FastAPI)

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Mac/Linux)
source venv/bin/activate

# Install all dependencies
pip install -r requirements.txt
```

**`requirements.txt` key packages:**
```
fastapi==0.115.0
uvicorn==0.30.0
langchain==0.3.0
langgraph==0.2.0
langchain-ollama==0.2.0
chromadb==0.5.0
sentence-transformers==3.0.0
requests==2.32.0
beautifulsoup4==4.12.0
```

---

### Step 3 — Pull the LLM (Ollama)

```bash
# Install Ollama from https://ollama.ai then pull the model:
ollama pull llama3.2:1b

# Verify it's running
ollama list
```

---

### Step 4 — Seed the Database

```bash
# Still inside /backend with venv active
python seed_db.py
```

This creates `signalrx.db` with 36 seeded adverse event records and populates ChromaDB with 51 vector embeddings.

---

### Step 5 — Start the Backend Server

```bash
python server.py
```

✅ Backend live at: **http://localhost:8080**
📚 API Docs at: **http://localhost:8080/docs**

```
[STARTUP] Vector Store: 51 embeddings active
[STARTUP] LLM: Ollama llama3.2:1b — no timeout
[STARTUP] AyuScout V2 is LIVE on http://localhost:8080
```

---

### Step 6 — Frontend Setup (React / Vite)

```bash
# Open a NEW terminal, navigate to frontend
cd signalrx-dashboard

# Install Node dependencies
npm install

# Start development server
npm run dev
```

✅ Frontend live at: **http://localhost:5173**

---

### Step 7 — Login to the Platform

Open **http://localhost:5173** and use:

| Field | Value |
|---|---|
| Email | `demo@signalrx.ai` |
| Password | `demo1234` |

> **Note:** If the account doesn't exist, click **Register** and create it with those credentials. Admin account: `admin@signalrx.ai` / `admin1234`

---

## 🗂️ Project Structure

```
signalrx-ai/
├── backend/
│   ├── server.py           # FastAPI app — all API endpoints
│   ├── ai_engine.py        # LangGraph pipeline (Guard→Generator→Critic→Doctor)
│   ├── crawler.py          # Self-Healing Agentic Crawler
│   ├── database.py         # SQLite schema & queries
│   ├── seed_db.py          # Database seeder with 36 ADR records
│   ├── requirements.txt    # Python dependencies
│   └── core/
│       ├── pii_vault.py    # PII detection & masking engine
│       ├── e2b_export.py   # ICH E2B(R3) XML generator
│       ├── vector_store.py # ChromaDB vector operations
│       ├── email_notifier.py  # SMTP help query notifications
│       └── webhook_alerter.py # Webhook push alerts
│
└── signalrx-dashboard/
    ├── src/
    │   ├── App.jsx          # Router & auth guard
    │   ├── main.jsx         # Entry point
    │   ├── index.css        # Global design system (CSS variables)
    │   ├── pages/
    │   │   ├── Dashboard.jsx        # KPI overview with live backend data
    │   │   ├── Alerts.jsx           # Signal table + AI Traceability Drawer
    │   │   ├── TrendAnalysis.jsx    # 7-day spike chart + causality breakdown
    │   │   ├── CommandCenter.jsx    # Differentiators showcase (PII/Severity/E2B)
    │   │   ├── Projects.jsx         # Projects grid with localStorage persistence
    │   │   ├── CrawlerPage.jsx      # Self-Healing terminal UI
    │   │   ├── DataExplorer.jsx     # Drug-filtered data exploration
    │   │   ├── Reports.jsx          # Report generation
    │   │   ├── Login.jsx            # Auth page
    │   │   ├── HelpCenter.jsx       # User query submission
    │   │   └── AdminHelpDashboard.jsx  # Admin query resolution
    │   └── components/
    │       ├── Sidebar.jsx          # Navigation
    │       ├── Header.jsx           # Page header
    │       ├── ProjectSetupWizard.jsx  # Agentic project onboarder
    │       └── SelfHealingTerminal.jsx # Crawler terminal component
    ├── package.json
    └── vite.config.js
```

---

## 🎯 Demo Flow (For Judges)

### 1. Signal Intelligence (30% Execution)
→ **Alerts** page → Click **"AI Traceability"** on any row
→ See: Raw text → Extracted entities → WHO-UMC reasoning → Causality score

### 2. Trend Spike Detection (30% Execution)
→ **Trend Analysis** page → See the **+238% spike** chart at the top
→ Demonstrates real-time signal surge detection capability

### 3. Agentic Source Onboarder (15% Uniqueness)
→ **Projects** page → Click **"Setup Wizard"**
→ Fill in project name + keywords → Watch the **terminal-style AI** generate CSS selectors live

### 4. Self-Healing Crawler (15% Uniqueness)
→ **Self-Heal Crawler** page → Click **"Deploy Agentic Crawler"**
→ Watch 17-step healing sequence: `[ERROR] → [AGENT] → [SUCCESS]`

### 5. Differentiators Command Center (15% Presentation)
→ **Command Center** page → Three interactive demos:
- Toggle PII masking on/off
- Compare angry post (low risk) vs calm post (critical risk)
- Generate E2B(R3) XML with one click

---

## 🏆 Rubric Alignment

| Category | Weight | How We Hit It |
|---|---|---|
| **Innovation** | 15% | Self-Healing CSS selector regeneration (unique in PV space) |
| **Execution** | 30% | Full working stack: FastAPI + LangGraph + React + SQLite + ChromaDB |
| **Uniqueness** | 15% | Sentiment ≠ Severity decoupling — no competitor does this |
| **Impact** | 20% | Solves India's 99% under-reporting crisis; CDSCO/DPDP compliant |
| **Presentation** | 15% | Live E2B export, animated terminal, interactive PII vault |
| **Completeness** | 5% | Auth, user management, help center, admin panel all functional |

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, Recharts, React Icons |
| **Backend** | Python 3.11, FastAPI, Uvicorn |
| **AI Engine** | LangGraph, LangChain, Ollama (llama3.2:1b) |
| **Vector DB** | ChromaDB + sentence-transformers (all-MiniLM-L6-v2) |
| **Database** | SQLite (structured) + ChromaDB (semantic) |
| **Compliance** | ICH E2B(R3), WHO-UMC, MedDRA, HIPAA/DPDP PII masking |

---

## 👥 Team

Built for **AI Bharat 2.0 Hackathon** — May 2025

> *SignalRx AI — Because every patient voice deserves to be heard.*
