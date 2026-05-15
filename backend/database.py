"""
AyuScout V2 — Database Layer (SQLAlchemy ORM)
===============================================
Upgraded from raw sqlite3 to SQLAlchemy for scalability.
Uses SQLite for local dev, but the ORM structure supports
PostgreSQL/MySQL migration by changing only DATABASE_URL.

Integrates with:
  - Vector Store (ChromaDB) for embedding storage
  - Webhook Alerter for urgent event notification
  - PIIVault sanitizer for safe API responses
"""

import os
import json
import re
import hashlib
import secrets
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Boolean, Float
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# Load environment
load_dotenv()

# ── PII token detector helpers ────────────────────────────────
_TOKEN_TYPE_MAP = {
    'USER':    'USER',
    'PHONE':   'PHONE',
    'EMAIL':   'EMAIL',
    'ADDR':    'ADDRESS',
    'AADHAAR': 'AADHAAR',
    'PAN':     'PAN',
}
_TOKEN_RX = re.compile(r'\[(USER|PHONE|EMAIL|ADDR|AADHAAR|PAN)_\d+\]')

def _detect_pii_types(text: str) -> list:
    """Extract list of PII token types present in masked text."""
    if not text:
        return []
    found = set()
    for m in _TOKEN_RX.finditer(text):
        found.add(_TOKEN_TYPE_MAP.get(m.group(1), m.group(1)))
    return sorted(found)


# ── Final display sanitizer (outgoing API safety layer) ───────
_DISPLAY_PATTERNS = [
    (re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'), '[EMAIL_REDACTED]'),
    (re.compile(r'\b[6-9]\d{9}\b'), '[PHONE_REDACTED]'),
    (re.compile(r'(?<!\d)(?:\+?1[\s\-.])?\(?\d{3}\)?[\s\-.]\d{3}[\s\-.]\d{4}(?!\d)'), '[PHONE_REDACTED]'),
    (re.compile(r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b'), '[AADHAAR_REDACTED]'),
    (re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b'), '[PAN_REDACTED]'),
]

def sanitize_pii_for_display(text: str) -> str:
    """Backend display sanitizer — emails, phones, Aadhaar, PAN only.
    Does NOT aggressively mask names; PIIVault handles those at ingestion time.
    """
    if not text or not isinstance(text, str):
        return text
    for pattern, replacement in _DISPLAY_PATTERNS:
        text = pattern.sub(replacement, text)
    return text

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///signalrx.db")

# SQLAlchemy setup
engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


# ============================================================
# ORM MODELS
# ============================================================

class IntakeVault(Base):
    """Stores raw (PII-masked) text and metadata from crawlers."""
    __tablename__ = "intake_vault"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    raw_text = Column(Text, nullable=False)
    platform = Column(String(100))
    created_at = Column(DateTime, default=datetime.now)
    drug_keyword = Column(String(100))
    status = Column(String(50), default="pending")
    pii_map = Column(Text, default="{}")  # JSON map of PII tokens -> originals
    fda_analysis_json = Column(Text, nullable=True)  # Persisted FDA result object


class IntelligenceVault(Base):
    """Stores AI analysis results with explainability data."""
    __tablename__ = "intelligence_vault"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    intake_id = Column(Integer)
    sentiment = Column(String(50))
    drug = Column(String(200))
    event = Column(String(200))
    causality = Column(String(100))
    confidence = Column(String(50))
    severity = Column(String(50))
    reasoning = Column(Text)
    pubmed_link = Column(Text)
    concomitant_drugs = Column(Text, default="[]")
    time_to_onset = Column(String(100))
    who_umc_score = Column(Integer)
    who_umc_factors = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.now)
    ddi_risk_level = Column(String(50), default="None")  # High / Low / None
    fda_analysis_json = Column(Text, nullable=True)  # Persisted FDA result object


class User(Base):
    """Registered users (patients/doctors/admins)."""
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    name          = Column(String(200), nullable=False)
    email         = Column(String(200), nullable=False, unique=True)
    password_hash = Column(String(300), nullable=False)
    role          = Column(String(50), default='user')   # 'user' | 'admin' | 'analyst' | 'reviewer' | 'safety_officer'
    department    = Column(String(100), default='Pharmacovigilance')
    status        = Column(String(50), default='Active')  # 'Active' | 'Inactive'
    deleted_at    = Column(DateTime, nullable=True)        # soft-delete timestamp
    created_at    = Column(DateTime, default=datetime.now)
    last_login    = Column(DateTime, nullable=True)


class HelpQuery(Base):
    """User-submitted help queries with admin answers."""
    __tablename__ = "help_queries"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(Integer, nullable=False)
    user_email  = Column(String(200), nullable=False)
    user_name   = Column(String(200), nullable=False)
    question    = Column(Text, nullable=False)
    answer      = Column(Text, nullable=True)
    status      = Column(String(50), default='open')   # 'open' | 'answered'
    created_at  = Column(DateTime, default=datetime.now)
    answered_at = Column(DateTime, nullable=True)
    notified    = Column(Boolean, default=False)


class Project(Base):
    """Pharmacovigilance monitoring projects created by users."""
    __tablename__ = "projects"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    name                = Column(String(300), nullable=False)
    owner_id            = Column(Integer, nullable=True)          # FK -> users.id
    owner_email         = Column(String(300), nullable=True)      # Denormalized for fast filtering
    keywords_json       = Column(Text, default="[]")              # JSON array of keyword strings
    keyword_colors_json = Column(Text, default="[]")              # JSON array of hex colors per keyword
    sources_json        = Column(Text, default='["twitter"]')     # Array of source IDs
    source_type         = Column(String(50), default='social')    # social|encyclopedia|custom_url|blog|news|unknown
    source_url          = Column(Text, nullable=True)             # URL if source is website/wiki/blog
    scraper_config_json = Column(Text, default="{}")              # Agentic scraper config
    status              = Column(String(50), default='Active')    # Active|Paused|Monitoring|Completed|Failed
    agentic_enabled     = Column(Boolean, default=False)
    schedule_interval   = Column(String(50), default='Daily')     # Real-time|Daily|Weekly
    scraper_status      = Column(String(50), default='Idle')      # Idle|Running|Paused|Completed|Failed
    ai_agent_status     = Column(String(50), default='Standby')   # Standby|Processing|Done
    visibility          = Column(String(20), default='private')   # private|team|public
    completion_reason   = Column(Text, nullable=True)
    created_at          = Column(DateTime, default=datetime.now)
    updated_at          = Column(DateTime, default=datetime.now)
    last_fetched_at     = Column(DateTime, nullable=True)


class AppSettings(Base):
    """Per-user application settings (structured columns for queryability)."""
    __tablename__ = "app_settings"

    id                     = Column(Integer, primary_key=True, autoincrement=True)
    user_id                = Column(Integer, nullable=False, unique=True)  # one row per user
    # General
    org_name               = Column(String(200), default='AyuScout Pharma')
    contact_email          = Column(String(200), default='admin@ayuscout.ai')
    timezone               = Column(String(100), default='Asia/Kolkata (UTC+5:30)')
    dark_mode              = Column(Boolean, default=False)
    compact_tables         = Column(Boolean, default=True)
    show_kpi_trends        = Column(Boolean, default=True)
    # Notifications
    notif_critical_alerts  = Column(Boolean, default=True)
    notif_daily_digest     = Column(Boolean, default=True)
    notif_report_reminders = Column(Boolean, default=True)
    notif_sentiment_spike  = Column(Boolean, default=True)
    notif_weekly_summary   = Column(Boolean, default=False)
    webhook_url            = Column(String(500), default='')
    # AI Configuration
    llm_model              = Column(String(100), default='llama3.2:1b')
    sensitivity            = Column(String(50), default='High')
    prr_threshold          = Column(Float, default=2.0)
    min_case_count         = Column(Integer, default=3)
    auto_signal            = Column(Boolean, default=True)
    sentiment_ai           = Column(Boolean, default=True)
    duplicate_detect       = Column(Boolean, default=True)
    # Security
    two_fa                 = Column(Boolean, default=True)
    session_timeout        = Column(String(50), default='30 minutes')
    audit_log_enabled      = Column(Boolean, default=True)
    ip_whitelist           = Column(Boolean, default=False)
    updated_at             = Column(DateTime, default=datetime.now)


class Notification(Base):
    """System and AI-generated notifications per user."""
    __tablename__ = "notifications"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, nullable=True)   # None = global / all users
    title      = Column(String(300), nullable=False)
    desc       = Column(Text, nullable=True)
    icon       = Column(String(50), default='info')   # 'critical' | 'warning' | 'info'
    type       = Column(String(50), default='system') # 'signal' | 'alert' | 'system' | 'user' | 'crawler' | 'security'
    category   = Column(String(100), default='System')# 'Critical Alert' | 'AI Detection' | 'User Management' | 'Crawler' | 'System' | 'Security'
    priority   = Column(String(20), default='normal') # 'urgent' | 'normal' | 'low'
    unread     = Column(Boolean, default=True)
    action_url = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    read_at    = Column(DateTime, nullable=True)


class AuditLog(Base):
    """Immutable audit trail of all significant user actions."""
    __tablename__ = "audit_logs"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    user_id       = Column(Integer, nullable=True)
    user_email    = Column(String(200), nullable=True)
    action        = Column(String(300), nullable=False)  # e.g. 'settings.update', 'user.create'
    metadata_json = Column(Text, default='{}')           # JSON blob of changed values
    ip_address    = Column(String(50), nullable=True)
    created_at    = Column(DateTime, default=datetime.now)


class CrawlerSession(Base):
    """
    Tracks a single crawler deployment run.
    One session per "Deploy Agentic Crawler" click.
    """
    __tablename__ = "crawler_sessions"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    project_id  = Column(Integer, nullable=True)       # FK -> projects.id (None = standalone)
    source_id   = Column(String(100), nullable=True)   # e.g. 'drugs_com', 'twitter'
    keyword     = Column(String(300), nullable=True)
    target_url  = Column(Text, nullable=True)
    status      = Column(String(50), default='running')  # running|completed|failed|cancelled
    records_fetched   = Column(Integer, default=0)
    records_matched   = Column(Integer, default=0)
    healing_attempts  = Column(Integer, default=0)
    created_at  = Column(DateTime, default=datetime.now)
    finished_at = Column(DateTime, nullable=True)


class CrawlerLog(Base):
    """
    Structured log entry emitted by the crawler engine.
    Powers the live terminal stream — every log line stored here
    is queryable and streamable via SSE, replacing all fake/stdout logs.
    """
    __tablename__ = "crawler_logs"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    session_id  = Column(Integer, nullable=False)    # FK -> crawler_sessions.id
    project_id  = Column(Integer, nullable=True)
    source      = Column(String(100), nullable=True) # 'drugs_com', 'reddit' etc.
    level       = Column(String(20), default='INFO') # INFO|SUCCESS|ERROR|WARNING|HEALING|FETCH|PARSE|AI|FDA|INIT
    event_type  = Column(String(50), default='INFO') # INIT|FETCH|PARSE|HEALING|AI_ANALYSIS|FDA_ANALYSIS|SUCCESS|ERROR|etc.
    message     = Column(Text, nullable=False)
    url         = Column(Text, nullable=True)
    keyword     = Column(String(300), nullable=True)
    metadata_json = Column(Text, default='{}')
    created_at  = Column(DateTime, default=datetime.now)


# ============================================================
# PASSWORD HELPERS
# ============================================================

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{hashed}"

def verify_password(password: str, stored: str) -> bool:
    try:
        salt, hashed = stored.split(':', 1)
        return hashlib.sha256((password + salt).encode()).hexdigest() == hashed
    except Exception:
        return False


# ============================================================
# DATABASE INITIALIZATION
# ============================================================

def init_db():
    """Create all tables and seed admin user if not exists."""
    Base.metadata.create_all(engine)
    print(" Database initialized (SQLAlchemy ORM)")

    # Backward-compatible migrations
    _safe_migrations = [
        "ALTER TABLE projects ADD COLUMN schedule_interval VARCHAR(50) DEFAULT 'Daily'",
        "ALTER TABLE projects ADD COLUMN owner_id INTEGER",
        "ALTER TABLE projects ADD COLUMN owner_email VARCHAR(300)",
        "ALTER TABLE projects ADD COLUMN keyword_colors_json TEXT DEFAULT '[]'",
        "ALTER TABLE projects ADD COLUMN source_type VARCHAR(50) DEFAULT 'social'",
        "ALTER TABLE projects ADD COLUMN source_url TEXT",
        "ALTER TABLE projects ADD COLUMN scraper_status VARCHAR(50) DEFAULT 'Idle'",
        "ALTER TABLE projects ADD COLUMN ai_agent_status VARCHAR(50) DEFAULT 'Standby'",
        "ALTER TABLE projects ADD COLUMN visibility VARCHAR(20) DEFAULT 'private'",
        "ALTER TABLE projects ADD COLUMN completion_reason TEXT",
        "ALTER TABLE projects ADD COLUMN updated_at DATETIME",
        "ALTER TABLE projects ADD COLUMN last_fetched_at DATETIME",
        "ALTER TABLE users ADD COLUMN department VARCHAR(100) DEFAULT 'Pharmacovigilance'",
        "ALTER TABLE users ADD COLUMN status VARCHAR(50) DEFAULT 'Active'",
        "ALTER TABLE users ADD COLUMN deleted_at DATETIME",
        # ── FDA persistence columns (safe to run on existing DBs) ──
        "ALTER TABLE intake_vault ADD COLUMN fda_analysis_json TEXT",
        "ALTER TABLE intelligence_vault ADD COLUMN fda_analysis_json TEXT",
        "ALTER TABLE intelligence_vault ADD COLUMN ddi_risk_level TEXT DEFAULT NULL",
        # ── Crawler session + log tables (new — idempotent via CREATE TABLE) ──
        # These are created by create_all() above; migrations are no-ops on fresh DBs
        "ALTER TABLE crawler_sessions ADD COLUMN records_fetched INTEGER DEFAULT 0",
        "ALTER TABLE crawler_sessions ADD COLUMN records_matched INTEGER DEFAULT 0",
        "ALTER TABLE crawler_sessions ADD COLUMN healing_attempts INTEGER DEFAULT 0",
    ]
    with engine.connect() as conn:
        for sql in _safe_migrations:
            try:
                conn.execute(__import__('sqlalchemy').text(sql))
                conn.commit()
            except Exception:
                pass  # Column already exists — safe to ignore

    # Seed admin
    session = SessionLocal()
    try:
        existing = session.query(User).filter(User.email == 'admin@ayuscout.ai').first()
        if not existing:
            admin = User(
                name='AyuScout Admin',
                email='admin@ayuscout.ai',
                password_hash=hash_password('Admin@123'),
                role='admin',
                department='Administration',
                status='Active',
                created_at=datetime.now()
            )
            session.add(admin)
            session.commit()
            print(" Admin user seeded: admin@ayuscout.ai / Admin@123")
    except Exception as e:
        session.rollback()
        print(f"[WARN] Admin seed skipped: {e}")
    finally:
        session.close()


# ============================================================
# INTAKE VAULT OPERATIONS
# ============================================================

def save_intake(text, platform, drug, pii_map="{}"):
    """Save a PII-masked intake record. Returns the new record ID (int) or None."""
    session = SessionLocal()
    try:
        record = IntakeVault(
            raw_text=text,
            platform=platform,
            created_at=datetime.now(),
            drug_keyword=drug,
            status="pending",
            pii_map=pii_map
        )
        session.add(record)
        session.commit()
        new_id = record.id  # capture before session closes
        session.refresh(record)
        print(f"   [DB] Intake saved: platform={platform}, drug={drug}, id={new_id}")
        return new_id
    except Exception as e:
        session.rollback()
        print(f"   [DB-ERROR] Intake save failed: {e}")
        return None
    finally:
        session.close()


def get_pending_cases():
    """Get all pending cases for batch processing."""
    session = SessionLocal()
    try:
        results = session.query(IntakeVault.id, IntakeVault.raw_text).filter(
            IntakeVault.status == "pending"
        ).all()
        return [(r.id, r.raw_text) for r in results]
    finally:
        session.close()


def update_status(intake_id, status):
    """Update the processing status of an intake record."""
    session = SessionLocal()
    try:
        record = session.query(IntakeVault).filter(IntakeVault.id == intake_id).first()
        if record:
            record.status = status
            session.commit()
    except Exception as e:
        session.rollback()
        print(f"   [DB-ERROR] Status update failed: {e}")
    finally:
        session.close()


# ============================================================
# INTELLIGENCE VAULT OPERATIONS
# ============================================================

def save_intelligence(intake_id, result):
    """
    Save AI analysis results to the intelligence vault.
    Also stores embeddings in ChromaDB and triggers webhook alerts.
    """
    session = SessionLocal()
    
    # Helper to flatten nested dicts from AI output
    def _flatten(val):
        if isinstance(val, dict):
            for k, v in val.items():
                if isinstance(v, str):
                    return v
            return str(val)
        if isinstance(val, list) and len(val) > 0:
            return str(val[0])
        return str(val) if val is not None else "Unknown"
    
    try:
        # 1. Safely handle the AI output
        analysis = result.get('extracted_data', {})
        if isinstance(analysis, str):
            try:
                analysis = json.loads(analysis)
            except Exception:
                analysis = {}
        
        analysis_full_text = str(result).lower()
        raw_text_lower = str(result.get('raw_text', '')).lower()
        
        # --- COMPREHENSIVE DRUG RECOVERY ---
        # Full map: keyword in text -> canonical drug name
        _DRUG_MAP = {
            "lisinopril": "Lisinopril", "metformin": "Metformin",
            "atorvastatin": "Atorvastatin", "simvastatin": "Simvastatin",
            "rosuvastatin": "Rosuvastatin", "amlodipine": "Amlodipine",
            "omeprazole": "Omeprazole", "pantoprazole": "Pantoprazole",
            "amoxicillin": "Amoxicillin", "azithromycin": "Azithromycin",
            "ciprofloxacin": "Ciprofloxacin", "doxycycline": "Doxycycline",
            "ibuprofen": "Ibuprofen", "aspirin": "Aspirin",
            "paracetamol": "Paracetamol", "acetaminophen": "Acetaminophen",
            "warfarin": "Warfarin", "clopidogrel": "Clopidogrel",
            "insulin": "Insulin", "glipizide": "Glipizide",
            "metoprolol": "Metoprolol", "atenolol": "Atenolol",
            "losartan": "Losartan", "ramipril": "Ramipril",
            "furosemide": "Furosemide", "prednisone": "Prednisone",
            "prednisolone": "Prednisolone", "levothyroxine": "Levothyroxine",
            "sertraline": "Sertraline", "fluoxetine": "Fluoxetine",
            "alprazolam": "Alprazolam", "diazepam": "Diazepam",
            "cetirizine": "Cetirizine", "loratadine": "Loratadine",
            "naproxen": "Naproxen", "diclofenac": "Diclofenac",
            "gabapentin": "Gabapentin", "pregabalin": "Pregabalin",
            "tamoxifen": "Tamoxifen", "hydroxychloroquine": "Hydroxychloroquine",
        }
        drug = _flatten(analysis.get('suspect_drug') or analysis.get('drug'))
        if drug in ("Unknown", "", None):
            for kw, canonical in _DRUG_MAP.items():
                if kw in analysis_full_text or kw in raw_text_lower:
                    drug = canonical
                    break
        # Still Unknown? use drug_keyword stored in raw_text hint
        if drug in ("Unknown", "", None):
            drug = "Unknown"

        # --- COMPREHENSIVE EVENT RECOVERY ---
        _EVENT_MAP = {
            "angioedema": "Angioedema",
            "swelling": "Angioedema",
            "anaphylax": "Anaphylaxis",
            "nausea": "Nausea",
            "vomit": "Vomiting",
            "dizzy": "Dizziness",
            "dizziness": "Dizziness",
            "headache": "Cephalalgia",
            "rash": "Skin Rash",
            "hives": "Urticaria",
            "fatigue": "Fatigue",
            "tired": "Fatigue",
            "pain": "Pain",
            "chest pain": "Chest Pain",
            "stomach pain": "Abdominal Pain",
            "abdominal": "Abdominal Pain",
            "diarrhea": "Diarrhoea",
            "constipation": "Constipation",
            "itching": "Pruritus",
            "itch": "Pruritus",
            "cough": "Cough",
            "breathing": "Dyspnoea",
            "breathless": "Dyspnoea",
            "shortness of breath": "Dyspnoea",
            "palpitation": "Palpitations",
            "irregular heartbeat": "Palpitations",
            "insomnia": "Insomnia",
            "sleep": "Insomnia",
            "liver": "Hepatotoxicity",
            "jaundice": "Jaundice",
            "kidney": "Nephrotoxicity",
            "renal": "Nephrotoxicity",
            "muscle": "Myalgia",
            "myalgia": "Myalgia",
            "depression": "Depression",
            "anxiety": "Anxiety",
            "tremor": "Tremor",
            "metallic taste": "Dysgeusia",
            "taste": "Dysgeusia",
            "blurred vision": "Vision Blurred",
            "vision": "Vision Blurred",
            "hair loss": "Alopecia",
            "fever": "Pyrexia",
            "high blood pressure": "Hypertension",
            "low blood pressure": "Hypotension",
            "hypoglycemia": "Hypoglycaemia",
            "low blood sugar": "Hypoglycaemia",
            "seizure": "Seizure",
        }
        event = _flatten(analysis.get('meddra_term') or analysis.get('adverse_event') or analysis.get('event'))
        if event in ("Unknown", "", None):
            for kw, canonical in _EVENT_MAP.items():
                if kw in analysis_full_text or kw in raw_text_lower:
                    event = canonical
                    break
        if event in ("Unknown", "", None):
            event = "Adverse Event"

        # --- CONCOMITANT DRUGS ---
        concomitant = analysis.get('concomitant_drugs', [])
        if isinstance(concomitant, list):
            concomitant_str = json.dumps(concomitant)
        else:
            concomitant_str = str(concomitant)
        
        # --- TIME TO ONSET ---
        time_to_onset = _flatten(analysis.get('time_to_onset') or "Unknown")
        
        # --- DOCTOR VERDICT EXTRACTION ---
        doctor_data = result.get('doctor_verdict', {})
        if isinstance(doctor_data, str):
            try:
                doctor_data = json.loads(doctor_data)
            except Exception:
                doctor_data = {}
        
        causality = _flatten(doctor_data.get('causality_score') or analysis.get('causality_score') or "Pending")
        confidence = _flatten(doctor_data.get('confidence_score') or "Unknown")
        reasoning = _flatten(doctor_data.get('reasoning') or "AI assessment pending.")
        pubmed_link = _flatten(doctor_data.get('pubmed_search_link') or "N/A")
        severity = _flatten(doctor_data.get('severity') or "Medium")

        # --- SENTIMENT DERIVATION (Text-first NLP, not just causality) ---
        # Step 1: Use explicit LLM sentiment if meaningful
        raw_sentiment = analysis.get('sentiment')
        if raw_sentiment and str(raw_sentiment).strip() not in ('Unknown', 'None', ''):
            sentiment = _flatten(raw_sentiment)
        else:
            # Step 2: Full text NLP keyword scoring
            _STRONG_NEG = [
                'side effect', 'adverse', 'bad reaction', 'terrible', 'horrible', 'awful',
                'dangerous', 'severe', 'serious', 'emergency', 'hospital', 'hospitalized',
                'scared', 'worried', 'panic', 'unbearable', 'excruciating', 'stopped taking',
                'had to stop', 'allergic', 'anaphylaxis', 'life-threatening', 'overdose',
                'poisoning', 'toxic', 'liver damage', 'kidney failure',
            ]
            _MODERATE_NEG = [
                'nausea', 'vomiting', 'dizzy', 'dizziness', 'headache', 'fatigue', 'tired',
                'pain', 'hurt', 'ache', 'rash', 'itching', 'swelling', 'hives', 'bloating',
                'constipation', 'diarrhea', 'insomnia', 'tremor', 'palpitation',
                'blurred vision', 'hair loss', 'weakness', 'not working', 'no improvement',
            ]
            _POSITIVE = [
                'works great', 'very helpful', 'feeling better', 'improved', 'effective',
                'no side effects', 'well tolerated', 'excellent', 'amazing', 'wonderful',
                'life changing', 'saved my life', 'highly recommend', 'helped me',
                'good results', 'no issues', 'safe for me', 'great drug',
            ]
            neg_score  = sum(2 for kw in _STRONG_NEG   if kw in raw_text_lower)
            neg_score += sum(1 for kw in _MODERATE_NEG if kw in raw_text_lower)
            pos_score  = sum(2 for kw in _POSITIVE     if kw in raw_text_lower)
            if neg_score >= 2 or (neg_score > 0 and pos_score == 0):
                sentiment = 'Negative'
            elif pos_score > neg_score:
                sentiment = 'Positive'
            elif neg_score == 1:
                sentiment = 'Negative'
            else:
                caus_lower = (causality or '').lower()
                sev_lower  = (severity  or '').lower()
                if caus_lower in ('certain', 'probable') or sev_lower in ('critical', 'high'):
                    sentiment = 'Negative'
                elif caus_lower in ('unlikely',) and sev_lower == 'low':
                    sentiment = 'Positive'
                else:
                    sentiment = 'Neutral'

        # --- DDI RISK LEVEL (text-based, not always None) ---
        ddi_risk_raw = doctor_data.get('ddi_risk_level', 'None')
        if not ddi_risk_raw or ddi_risk_raw == 'None':
            _HIGH_RISK = [
                'warfarin', 'anticoagulant', 'blood thinner', 'nsaid', 'ssri', 'maoi',
                'lithium', 'methotrexate', 'digoxin', 'phenytoin', 'carbamazepine',
                'rifampin', 'fluconazole', 'ketoconazole', 'clarithromycin',
                'cyclosporine', 'tacrolimus',
            ]
            concom_str = ' '.join(str(c) for c in (analysis.get('concomitant_drugs') or []))
            combined   = raw_text_lower + ' ' + concom_str.lower()
            m = sum(1 for kw in _HIGH_RISK if kw in combined)
            ddi_risk_level = 'High' if m >= 2 else ('Low' if m == 1 else 'None')
        else:
            ddi_risk_level = ddi_risk_raw

        # --- EMOTION DERIVATION ---
        _ev_lower   = (event or '').lower()
        _sent_lower = (sentiment or '').lower()
        if any(kw in _ev_lower for kw in ['rash', 'swelling', 'angioedema', 'allergy', 'anaphylax', 'hives', 'urticaria', 'pruritus']):
            emotion = 'Concern'
        elif any(kw in _ev_lower for kw in ['nausea', 'vomit', 'dizzi', 'pain', 'dyspnoea', 'breathless', 'headache', 'abdominal']):
            emotion = 'Distress'
        elif any(kw in _ev_lower for kw in ['hepato', 'nephro', 'jaundice', 'seizure', 'cardiac', 'stroke', 'coma']):
            emotion = 'Fear / Anxiety'
        elif _sent_lower == 'negative':
            emotion = 'General Negative'
        elif _sent_lower == 'positive':
            emotion = 'Relief'
        else:
            emotion = 'Neutral'
        if emotion and not reasoning.startswith('[Emotion:'):
            reasoning = f'[Emotion: {emotion}] {reasoning}'

        # WHO-UMC details
        umc_details = doctor_data.get('who_umc_details', {})
        who_umc_score = umc_details.get('score', 0) if isinstance(umc_details, dict) else 0
        who_umc_factors = json.dumps(umc_details.get('factors', [])) if isinstance(umc_details, dict) else "[]"
        
        print(f"\n[DB] DATA SAVED TO INTELLIGENCE VAULT")
        print(f"   [DB] Drug/Event: {drug} -> {event}")
        print(f"   [DB] Causality: {causality} | Confidence: {confidence} | Severity: {severity}")
        print(f"   [DB] Reasoning: {reasoning[:80]}")
        print(f"   [DB] Traceability: {pubmed_link}\n")
        
        # Save to database
        record = IntelligenceVault(
            intake_id=intake_id,
            sentiment=sentiment,
            drug=drug,
            event=event,
            causality=causality,
            confidence=confidence,
            severity=severity,
            reasoning=reasoning,
            pubmed_link=pubmed_link,
            concomitant_drugs=concomitant_str,
            time_to_onset=time_to_onset,
            who_umc_score=who_umc_score,
            who_umc_factors=who_umc_factors,
            ddi_risk_level=ddi_risk_level,
            created_at=datetime.now()
        )
        session.add(record)
        session.commit()
        
        saved_id = record.id
        session.refresh(record)
        print(f"   [DB] Intelligence saved: id={saved_id}, drug={drug}, event={event}")

        # --- VECTOR STORE INTEGRATION ---
        try:
            from core.vector_store import get_vector_store
            vs = get_vector_store()
            event_text = f"{drug} -> {event} ({causality})"
            vs.store_event(event_text, {
                "drug": drug,
                "event": event,
                "causality": causality,
                "confidence": confidence,
                "severity": severity,
                "intake_id": str(intake_id),
                "intelligence_id": str(saved_id)
            })
        except Exception as e:
            print(f"   [WARN] Vector store integration skipped: {e}")

        # --- WEBHOOK ALERTER ---
        try:
            from core.webhook_alerter import check_and_alert
            check_and_alert(
                drug=drug,
                event=event,
                causality=causality,
                confidence=confidence,
                reasoning=reasoning,
                intake_id=intake_id
            )
        except Exception as e:
            print(f"   [WARN] Webhook alerter skipped: {e}")

        return saved_id  # ← RETURN the intelligence record ID

    except Exception as e:
        session.rollback()
        print(f"   [DB-ERROR] Intelligence save failed: {e}")
        return None
    finally:
        session.close()


# ============================================================
# QUERY OPERATIONS
# ============================================================

def get_all_intelligence():
    """Get all intelligence records for the dashboard. Reasoning is sanitized.
    Returns persisted fdaAnalysis from DB when available.
    """
    session = SessionLocal()
    try:
        records = session.query(IntelligenceVault).order_by(
            IntelligenceVault.created_at.desc()
        ).all()
        return [
            {
                "id": r.id,
                "intake_id": r.intake_id,
                "sentiment": r.sentiment,
                "drug": r.drug,
                "event": r.event,
                "causality": r.causality,
                "confidence": r.confidence,
                "severity": r.severity,
                "reasoning": sanitize_pii_for_display(r.reasoning or ""),
                "emotion": (lambda raw: re.match(r'^\[Emotion:\s*([^\]]+)\]', raw).group(1).strip() if re.match(r'^\[Emotion:\s*([^\]]+)\]', raw) else '')(r.reasoning or ''),
                "pubmed_link": r.pubmed_link,
                "concomitant_drugs": r.concomitant_drugs,
                "time_to_onset": r.time_to_onset,
                "who_umc_score": r.who_umc_score,
                "who_umc_factors": r.who_umc_factors,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                # ── Persisted FDA analysis (None when not yet run) ──
                "fdaAnalysis": _parse_fda_json(r.fda_analysis_json),
            }
            for r in records
        ]
    finally:
        session.close()


def get_intelligence_by_id(record_id: int):
    """Get a single intelligence record by ID (for E2B export)."""
    session = SessionLocal()
    try:
        r = session.query(IntelligenceVault).filter(IntelligenceVault.id == record_id).first()
        if not r:
            return None
        return {
            "id": r.id,
            "intake_id": r.intake_id,
            "sentiment": r.sentiment,
            "drug": r.drug,
            "event": r.event,
            "causality": r.causality,
            "confidence": r.confidence,
            "severity": r.severity,
            "reasoning": r.reasoning,
            "pubmed_link": r.pubmed_link,
            "concomitant_drugs": r.concomitant_drugs,
            "time_to_onset": r.time_to_onset,
            "who_umc_score": r.who_umc_score,
            "who_umc_factors": r.who_umc_factors,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "fdaAnalysis": _parse_fda_json(r.fda_analysis_json),
        }
    finally:
        session.close()


# ── FDA JSON helpers (internal) ────────────────────────────────────────────────

def _parse_fda_json(raw: str | None) -> dict | None:
    """Safely parse a stored fda_analysis_json string. Returns None if missing/invalid."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def update_fda_analysis_for_intelligence(intel_id: int, fda_dict: dict) -> bool:
    """
    Persist FDA analysis result to an IntelligenceVault record.
    Returns True on success.
    """
    session = SessionLocal()
    try:
        r = session.query(IntelligenceVault).filter(IntelligenceVault.id == intel_id).first()
        if not r:
            return False
        r.fda_analysis_json = json.dumps(fda_dict)
        session.commit()
        print(f"   [FDA-DB] Intelligence {intel_id}: FDA analysis persisted "
              f"(applicable={fda_dict.get('applicable')}, risk={fda_dict.get('riskLevel')})")
        return True
    except Exception as e:
        session.rollback()
        print(f"   [FDA-DB-ERROR] Failed to persist FDA for intelligence {intel_id}: {e}")
        return False
    finally:
        session.close()


def update_fda_analysis_for_intake(intake_id: int, fda_dict: dict) -> bool:
    """
    Persist FDA analysis result to an IntakeVault record.
    Returns True on success.
    """
    session = SessionLocal()
    try:
        r = session.query(IntakeVault).filter(IntakeVault.id == intake_id).first()
        if not r:
            return False
        r.fda_analysis_json = json.dumps(fda_dict)
        session.commit()
        print(f"   [FDA-DB] Intake {intake_id}: FDA analysis persisted "
              f"(applicable={fda_dict.get('applicable')})")
        return True
    except Exception as e:
        session.rollback()
        print(f"   [FDA-DB-ERROR] Failed to persist FDA for intake {intake_id}: {e}")
        return False
    finally:
        session.close()


# ============================================================
# DASHBOARD AGGREGATION QUERIES
# ============================================================

def get_dashboard_stats():
    """Aggregate stats from intelligence vault for the dynamic dashboard."""
    session = SessionLocal()
    try:
        records = session.query(IntelligenceVault).order_by(
            IntelligenceVault.created_at.desc()
        ).all()

        total = len(records)

        # Severity breakdown
        severity_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        causality_counts = {"Certain": 0, "Probable": 0, "Possible": 0, "Unlikely": 0, "Unassessable": 0}
        sentiment_counts = {"Positive": 0, "Neutral": 0, "Negative": 0}
        drug_counts = {}
        event_counts = {}
        recent_alerts = []
        recent_posts = []

        for r in records:
            sev = r.severity or "Medium"
            if sev in severity_counts:
                severity_counts[sev] += 1

            caus = r.causality or "Unassessable"
            if caus in causality_counts:
                causality_counts[caus] += 1

            sent = (r.sentiment or "Negative").strip()
            if sent in sentiment_counts:
                sentiment_counts[sent] += 1
            else:
                sentiment_counts["Negative"] += 1

            drug = r.drug or "Unknown"
            drug_counts[drug] = drug_counts.get(drug, 0) + 1

            event = r.event or "Unknown"
            event_counts[event] = event_counts.get(event, 0) + 1

        # Top drugs by frequency
        top_drugs = sorted(drug_counts.items(), key=lambda x: x[1], reverse=True)[:8]

        # Top events by frequency
        top_events = sorted(event_counts.items(), key=lambda x: x[1], reverse=True)[:8]

        # Recent alerts (high severity records)
        for r in records[:5]:
            recent_alerts.append({
                "title": f"{r.drug} - {r.event} ({r.causality})",
                "severity": r.severity or "Medium",
                "time": _time_ago(r.created_at)
            })

        # Recent posts (from intake vault)
        intakes = session.query(IntakeVault).order_by(
            IntakeVault.created_at.desc()
        ).limit(6).all()

        for intake in intakes:
            platform = intake.platform or "Reddit"
            text = (intake.raw_text or "")[:100]
            # Determine sentiment from intelligence record
            intel = session.query(IntelligenceVault).filter(
                IntelligenceVault.intake_id == intake.id
            ).first()
            sentiment = intel.sentiment if intel else "Neutral"
            recent_posts.append({
                "platform": platform.split("(")[0].strip() if "(" in platform else platform,
                "text": text,
                "sentiment": sentiment,
                "time": _time_ago(intake.created_at),
                "color": "#FF4500" if "Reddit" in platform else "#1DA1F2"
            })

        # Keyword trend data (group by drug, sorted)
        keyword_data = [{"keyword": drug, "mentions": count, "trend": "up" if count > 1 else "stable"} for drug, count in top_drugs]

        # Pie data for sentiment
        total_sentiment = sum(sentiment_counts.values()) or 1
        pie_data = [
            {"name": "Positive", "value": round(sentiment_counts["Positive"] / total_sentiment * 100), "color": "#10B981"},
            {"name": "Neutral", "value": round(sentiment_counts["Neutral"] / total_sentiment * 100), "color": "#F59E0B"},
            {"name": "Negative", "value": round(sentiment_counts["Negative"] / total_sentiment * 100), "color": "#EF4444"},
        ]

        return {
            "total_records": total,
            "severity_counts": severity_counts,
            "causality_counts": causality_counts,
            "sentiment_counts": sentiment_counts,
            "top_drugs": top_drugs,
            "top_events": top_events,
            "keyword_data": keyword_data,
            "pie_data": pie_data,
            "recent_alerts": recent_alerts,
            "recent_posts": recent_posts,
        }
    finally:
        session.close()


def get_all_intake():
    """Get all intake vault records for the Data Explorer.
    Returns PII-safe data only: pii_map is NEVER returned.
    Includes pii_masked flag, detected token types, joined intelligence metadata,
    and persisted fdaAnalysis from DB.
    """
    session = SessionLocal()
    try:
        records = session.query(IntakeVault).order_by(
            IntakeVault.created_at.desc()
        ).all()
        result = []
        for r in records:
            # Check if this intake has been analyzed
            intel = session.query(IntelligenceVault).filter(
                IntelligenceVault.intake_id == r.id
            ).first()

            # Sanitize content before returning (belt-and-suspenders)
            raw = r.raw_text or ""
            safe_content = sanitize_pii_for_display(raw[:200])

            # Detect PII token types in masked content
            pii_types = _detect_pii_types(raw)
            pii_masked = len(pii_types) > 0

            result.append({
                "id": r.id,
                "content": safe_content,
                "platform": r.platform or "Unknown",
                "drug_keyword": r.drug_keyword or "Unknown",
                "status": r.status or "pending",
                "created_at": r.created_at.isoformat() if r.created_at else None,
                # Intelligence join fields
                "sentiment": intel.sentiment if intel else "Unknown",
                "drug": intel.drug if intel else (r.drug_keyword or "Unknown"),
                "event": intel.event if intel else "Unknown",
                "causality": intel.causality if intel else "Pending",
                "confidence": intel.confidence if intel else "Unknown",
                "severity": intel.severity if intel else "Unknown",
                "has_analysis": intel is not None,
                "emotion": (lambda raw: re.match(r'^\[Emotion:\s*([^\]]+)\]', raw).group(1).strip() if intel and raw and re.match(r'^\[Emotion:\s*([^\]]+)\]', raw) else '')(intel.reasoning if intel else ''),
                "intelligence_id": intel.id if intel else None,
                "e2b_available": intel is not None,
                # PII safety metadata
                "pii_masked": pii_masked,
                "pii_types_detected": pii_types,
                # pii_map is intentionally NEVER returned
                # ── Persisted FDA analysis: intake record's own FDA result first,
                #    then fall back to linked intelligence record's FDA result.
                "fdaAnalysis": _parse_fda_json(r.fda_analysis_json)
                    or (intel and _parse_fda_json(intel.fda_analysis_json))
                    or None,
            })
        return result
    finally:
        session.close()


def _time_ago(dt):
    """Convert datetime to human-readable 'time ago' string."""
    if not dt:
        return "Unknown"
    diff = datetime.now() - dt
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return f"{seconds}s ago"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h ago"
    days = hours // 24
    return f"{days}d ago"


# ============================================================
# USER CRUD
# ============================================================

def create_user(name: str, email: str, password: str, role: str = 'user',
                department: str = 'Pharmacovigilance', status: str = 'Active'):
    session = SessionLocal()
    try:
        if session.query(User).filter(User.email == email).first():
            return None, 'Email already registered'
        user = User(
            name=name, email=email,
            password_hash=hash_password(password),
            role=role,
        )
        # Set optional fields only if the columns exist on the model
        if hasattr(user, 'department'):
            user.department = department
        if hasattr(user, 'status'):
            user.status = status
        session.add(user)
        session.commit()
        return {
            'id': user.id, 'name': user.name, 'email': user.email,
            'role': user.role,
            'department': getattr(user, 'department', department),
            'status': getattr(user, 'status', status),
        }, None
    except Exception as e:
        session.rollback()
        return None, str(e)
    finally:
        session.close()

def get_user_by_email(email: str):
    session = SessionLocal()
    try:
        u = session.query(User).filter(User.email == email).first()
        if not u:
            return None
        return {
            'id': u.id, 'name': u.name, 'email': u.email,
            'password_hash': u.password_hash, 'role': u.role,
            'department': getattr(u, 'department', 'Pharmacovigilance') or 'Pharmacovigilance',
            'status': getattr(u, 'status', 'Active') or 'Active',
        }
    finally:
        session.close()

def touch_last_login(user_id: int):
    session = SessionLocal()
    try:
        u = session.query(User).filter(User.id == user_id).first()
        if u:
            u.last_login = datetime.now()
            session.commit()
    finally:
        session.close()


# ============================================================
# HELP QUERY CRUD
# ============================================================

def create_help_query(user_id: int, user_email: str, user_name: str, question: str):
    session = SessionLocal()
    try:
        q = HelpQuery(user_id=user_id, user_email=user_email,
                      user_name=user_name, question=question)
        session.add(q)
        session.commit()
        return {'id': q.id, 'status': q.status, 'created_at': q.created_at.isoformat()}
    except Exception as e:
        session.rollback()
        return None
    finally:
        session.close()

def get_all_help_queries():
    session = SessionLocal()
    try:
        qs = session.query(HelpQuery).order_by(HelpQuery.created_at.desc()).all()
        return [_serialize_query(q) for q in qs]
    finally:
        session.close()

def get_user_help_queries(user_id: int):
    session = SessionLocal()
    try:
        qs = session.query(HelpQuery).filter(HelpQuery.user_id == user_id)\
               .order_by(HelpQuery.created_at.desc()).all()
        return [_serialize_query(q) for q in qs]
    finally:
        session.close()

def answer_help_query(query_id: int, answer: str):
    session = SessionLocal()
    try:
        q = session.query(HelpQuery).filter(HelpQuery.id == query_id).first()
        if not q:
            return None
        q.answer = answer
        q.status = 'answered'
        q.answered_at = datetime.now()
        session.commit()
        return _serialize_query(q)
    except Exception as e:
        session.rollback()
        return None
    finally:
        session.close()

def _serialize_query(q):
    return {
        'id': q.id,
        'user_id': q.user_id,
        'user_email': q.user_email,
        'user_name': q.user_name,
        'question': q.question,
        'answer': q.answer,
        'status': q.status,
        'created_at': q.created_at.isoformat() if q.created_at else None,
        'answered_at': q.answered_at.isoformat() if q.answered_at else None,
        'notified': q.notified,
    }


# ============================================================
# PROJECT CRUD
# ============================================================

def create_project(name: str, keywords: list, sources: list, scraper_config: dict = None,
                   agentic_enabled: bool = False, schedule_interval: str = 'Daily',
                   owner_id: int = None, owner_email: str = None,
                   source_type: str = 'social', source_url: str = None):
    """Create and persist a new monitoring project."""
    session = SessionLocal()
    try:
        KEYWORD_COLORS = [
            '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
            '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
        ]
        kw_colors = [KEYWORD_COLORS[i % len(KEYWORD_COLORS)] for i in range(len(keywords or []))]

        # Infer source_type from first source string if not provided
        _src = (sources[0] if sources else 'twitter').lower()
        if not source_type or source_type == 'social':
            if 'wikipedia' in _src:          source_type = 'encyclopedia'
            elif 'blog' in _src:             source_type = 'blog'
            elif 'news' in _src:             source_type = 'news'
            elif 'reddit' in _src:           source_type = 'social'
            elif 'website' in _src or 'http' in _src: source_type = 'custom_url'
            else:                            source_type = 'social'

        proj = Project(
            name=name,
            owner_id=owner_id,
            owner_email=owner_email,
            keywords_json=json.dumps(keywords or []),
            keyword_colors_json=json.dumps(kw_colors),
            sources_json=json.dumps(sources or ['twitter']),
            source_type=source_type,
            source_url=source_url,
            scraper_config_json=json.dumps(scraper_config or {}),
            status='Active',
            agentic_enabled=agentic_enabled,
            schedule_interval=schedule_interval,
            scraper_status='Idle',
            ai_agent_status='Standby',
            visibility='private',
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        session.add(proj)
        session.commit()
        return _serialize_project(proj)
    except Exception as e:
        session.rollback()
        print(f"   [DB-ERROR] Project create failed: {e}")
        return None
    finally:
        session.close()


def get_all_projects(owner_id: int = None, owner_email: str = None):
    """Return projects ordered by creation date, filtered by owner if provided."""
    session = SessionLocal()
    try:
        q = session.query(Project).order_by(Project.created_at.desc())
        # Owner isolation: only return projects belonging to this user
        if owner_id is not None:
            # Return projects owned by this user OR projects with no owner (legacy)
            q = q.filter(
                (Project.owner_id == owner_id) | (Project.owner_id == None)
            )
        elif owner_email:
            q = q.filter(
                (Project.owner_email == owner_email) | (Project.owner_email == None)
            )
        return [_serialize_project(p) for p in q.all()]
    finally:
        session.close()


def get_project_by_id(project_id: int, owner_id: int = None):
    """Return a single project with full live metrics. Optionally verify ownership."""
    session = SessionLocal()
    try:
        p = session.query(Project).filter(Project.id == project_id).first()
        if not p:
            return None
        # Ownership check: if owner_id provided and project has an owner, enforce match
        if owner_id is not None and p.owner_id is not None and p.owner_id != owner_id:
            return None  # access denied — caller should raise 403
        return _serialize_project(p, full=True)
    finally:
        session.close()


def delete_project(project_id: int, owner_id: int = None) -> bool:
    """Hard-delete a project record. Enforces ownership if owner_id provided."""
    session = SessionLocal()
    try:
        p = session.query(Project).filter(Project.id == project_id).first()
        if not p:
            return False
        if owner_id is not None and p.owner_id is not None and p.owner_id != owner_id:
            return False  # access denied
        session.delete(p)
        session.commit()
        return True
    except Exception as e:
        session.rollback()
        print(f"   [DB-ERROR] Project delete failed: {e}")
        return False
    finally:
        session.close()


def update_project(project_id: int, owner_id: int = None, **kwargs) -> dict:
    """Update allowed project fields. Returns updated serialized project."""
    session = SessionLocal()
    try:
        p = session.query(Project).filter(Project.id == project_id).first()
        if not p:
            return None
        if owner_id is not None and p.owner_id is not None and p.owner_id != owner_id:
            return None  # access denied
        ALLOWED = {'name', 'status', 'scraper_status', 'ai_agent_status',
                   'schedule_interval', 'visibility', 'completion_reason', 'keywords_json',
                   'keyword_colors_json', 'agentic_enabled', 'last_fetched_at',
                   'source_type', 'source_url'}
        for key, val in kwargs.items():
            if key in ALLOWED and hasattr(p, key):
                setattr(p, key, val)
        p.updated_at = datetime.now()
        session.commit()
        return _serialize_project(p)
    except Exception as e:
        session.rollback()
        print(f"   [DB-ERROR] Project update failed: {e}")
        return None
    finally:
        session.close()


def get_project_fetched_items(project_id: int, keyword_filter: str = None, limit: int = 50):
    """
    Return actual intake vault records matching this project's keywords.
    Optionally filter by a specific keyword.
    Returns sanitized records safe for frontend display.
    """
    session = SessionLocal()
    try:
        p = session.query(Project).filter(Project.id == project_id).first()
        if not p:
            return []
        try:
            keywords = json.loads(p.keywords_json or '[]')
        except Exception:
            keywords = []

        if not keywords:
            return []

        kw_lower = [k.lower().strip() for k in keywords if k]
        if keyword_filter:
            kw_lower = [k for k in kw_lower if keyword_filter.lower() in k]

        all_records = session.query(IntakeVault).order_by(
            IntakeVault.created_at.desc()
        ).limit(500).all()  # cap at 500 to avoid huge queries

        def _matches(record):
            drug_kw = (record.drug_keyword or '').lower()
            raw = (record.raw_text or '').lower()
            return any(kw in drug_kw or kw in raw for kw in kw_lower)

        matching = [r for r in all_records if _matches(r)][:limit]

        result = []
        for r in matching:
            # Get linked intelligence record if available
            intel = session.query(IntelligenceVault).filter(
                IntelligenceVault.intake_id == r.id
            ).first()

            raw = r.raw_text or ''
            safe_content = sanitize_pii_for_display(raw[:300])

            # Determine which keyword matched
            matched_kw = next(
                (kw for kw in kw_lower if kw in (r.drug_keyword or '').lower() or kw in raw.lower()),
                keywords[0] if keywords else 'unknown'
            )

            result.append({
                'id': r.id,
                'content': safe_content,
                'platform': r.platform or 'Twitter',
                'drug_keyword': r.drug_keyword or matched_kw,
                'keyword_matched': matched_kw,
                'status': r.status or 'pending',
                'created_at': r.created_at.isoformat() if r.created_at else None,
                'has_analysis': intel is not None,
                'sentiment': intel.sentiment if intel else None,
                'drug': intel.drug if intel else (r.drug_keyword or None),
                'event': intel.event if intel else None,
                'severity': intel.severity if intel else None,
                'causality': intel.causality if intel else None,
                'confidence': intel.confidence if intel else None,
                'intelligence_id': intel.id if intel else None,
                'pii_masked': bool(r.pii_map and r.pii_map != '{}'),
            })
        return result
    finally:
        session.close()


def get_project_scraper_status(project_id: int) -> dict:
    """
    Return dynamic scraper status derived from real project + intake data.
    NEVER returns hardcoded 'Idle'/'Never' unless truly no data exists.
    """
    session = SessionLocal()
    try:
        p = session.query(Project).filter(Project.id == project_id).first()
        if not p:
            return {}
        try:
            keywords = json.loads(p.keywords_json or '[]')
        except Exception:
            keywords = []

        kw_lower = [k.lower().strip() for k in keywords if k]

        # Query matching intake records
        latest_intake = None
        total = 0
        processed = 0
        failed = 0

        if kw_lower:
            all_records = session.query(IntakeVault).order_by(
                IntakeVault.created_at.desc()
            ).all()

            def _matches(record):
                drug_kw = (record.drug_keyword or '').lower()
                raw = (record.raw_text or '').lower()
                return any(kw in drug_kw or kw in raw for kw in kw_lower)

            matching = [r for r in all_records if _matches(r)]
            total = len(matching)
            processed = sum(1 for r in matching if r.status == 'analyzed')
            failed = sum(1 for r in matching if r.status == 'failed')
            if matching:
                latest_intake = matching[0]  # already sorted desc by created_at

        # Derive scraper_status from real data
        stored_status = getattr(p, 'scraper_status', None) or 'Idle'
        progress = round((processed / total) * 100) if total > 0 else 0

        if total > 0 and processed == total:
            derived_status = 'Completed'
        elif failed > 0 and processed == 0 and total > 0:
            derived_status = 'Failed'
        elif total > 0 and processed < total:
            derived_status = 'Processing'
        elif stored_status not in ('Idle', None):
            derived_status = stored_status
        else:
            derived_status = 'Idle'

        # Derive last_fetched_at: use stored value OR latest intake created_at
        last_fetched = getattr(p, 'last_fetched_at', None)
        if not last_fetched and latest_intake and latest_intake.created_at:
            last_fetched = latest_intake.created_at

        # Determine source info
        try:
            sources = json.loads(p.sources_json or '["twitter"]')
            active_source = sources[0] if sources else 'Twitter'
        except Exception:
            active_source = 'Twitter'

        source_type = getattr(p, 'source_type', 'social') or 'social'
        source_url = getattr(p, 'source_url', None)

        # Current target = keyword(s) for social, URL for website
        if source_type == 'custom_url' and source_url:
            current_target = source_url
        elif keywords:
            current_target = ', '.join(keywords[:3])
        else:
            current_target = None

        return {
            'scraper_status': derived_status,
            'ai_agent_status': getattr(p, 'ai_agent_status', 'Standby') or 'Standby',
            'last_fetched_at': last_fetched.isoformat() if last_fetched else None,
            'active_source': active_source,
            'source_type': source_type,
            'source_url': source_url,
            'current_target': current_target,
            'total_targets': total,
            'processed_targets': processed,
            'failed_fetches': failed,
            'progress': progress,
            'schedule_interval': p.schedule_interval or 'Daily',
        }
    finally:
        session.close()

def _serialize_project(p, full: bool = False):
    try:
        keywords = json.loads(p.keywords_json or '[]')
    except Exception:
        keywords = []
    try:
        kw_colors = json.loads(getattr(p, 'keyword_colors_json', None) or '[]')
    except Exception:
        kw_colors = []
    try:
        sources = json.loads(p.sources_json or '["twitter"]')
    except Exception:
        sources = ['twitter']
    try:
        scraper_config = json.loads(p.scraper_config_json or '{}')
    except Exception:
        scraper_config = {}

    KEYWORD_COLORS = [
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
    ]
    while len(kw_colors) < len(keywords):
        kw_colors.append(KEYWORD_COLORS[len(kw_colors) % len(KEYWORD_COLORS)])

    metrics = compute_project_progress(keywords)
    progress = metrics['progress']

    # Auto-set status to Completed if 100%
    status = p.status or 'Active'
    if progress == 100 and status not in ('Completed', 'Failed'):
        status = 'Completed'

    # Dynamic scraper_status — derive from real data, never hardcode 'Idle' blindly
    stored_scraper_status = getattr(p, 'scraper_status', None) or 'Idle'
    if progress == 100:
        derived_scraper_status = 'Completed'
    elif metrics['failed_fetches'] > 0 and metrics['processed_targets'] == 0:
        derived_scraper_status = 'Failed'
    elif metrics['total_targets'] > 0 and metrics['processed_targets'] < metrics['total_targets']:
        derived_scraper_status = 'Processing'
    else:
        derived_scraper_status = stored_scraper_status

    # Dynamic source label — use first source string
    _src = (sources[0] if sources else 'twitter').lower()
    source_type = getattr(p, 'source_type', None) or 'social'
    source_label_map = {
        'twitter': 'Twitter', 'x': 'Twitter',
        'wikipedia': 'Wikipedia',
        'reddit': 'Reddit',
        'website': 'Website', 'custom_url': 'Website',
        'blog': 'Blog', 'news': 'News',
    }
    source_label = source_label_map.get(_src, source_label_map.get(source_type, 'Website'))

    return {
        'id': p.id,
        'name': p.name,
        'owner_id': getattr(p, 'owner_id', None),
        'owner_email': getattr(p, 'owner_email', None),
        'keywords': keywords,
        'keyword_colors': kw_colors,
        'keywords_count': len(keywords),
        'sources': sources,
        'source_label': source_label,
        'source_type': source_type,
        'source_url': getattr(p, 'source_url', None),
        'scraper_config': scraper_config if full else {},
        'status': status,
        'scraper_status': derived_scraper_status,
        'ai_agent_status': getattr(p, 'ai_agent_status', 'Standby') or 'Standby',
        'visibility': getattr(p, 'visibility', 'private') or 'private',
        'completion_reason': getattr(p, 'completion_reason', None),
        'agentic_enabled': bool(p.agentic_enabled),
        'schedule_interval': p.schedule_interval or 'Daily',
        'progress': progress,
        'total_targets': metrics['total_targets'],
        'processed_targets': metrics['processed_targets'],
        'fetched_posts': metrics['fetched_posts'],
        'matched_posts': metrics['matched_posts'],
        'failed_fetches': metrics['failed_fetches'],
        'remaining': metrics['remaining'],
        'success_rate': metrics['success_rate'],
        'created_at': p.created_at.isoformat() if p.created_at else None,
        'updated_at': getattr(p, 'updated_at', None) and p.updated_at.isoformat(),
        'last_fetched_at': getattr(p, 'last_fetched_at', None) and p.last_fetched_at.isoformat(),
    }

def compute_project_progress(keywords: list) -> dict:
    """
    Compute REAL progress metrics from the intake_vault based on project keywords.
    This is NOT fake — it counts actual database records.

    Progress = processed_targets / total_targets * 100
    where:
      total_targets    = all intake records whose drug_keyword matches any project keyword
      processed_targets = those with status == 'analyzed'
    """
    session = SessionLocal()
    try:
        keywords_lower = [k.lower().strip() for k in (keywords or []) if k]
        if not keywords_lower:
            return {
                'progress': 0, 'total_targets': 0, 'processed_targets': 0,
                'fetched_posts': 0, 'matched_posts': 0, 'failed_fetches': 0,
                'remaining': 0, 'success_rate': 0.0,
            }

        # Fetch all intake records
        all_records = session.query(IntakeVault).all()

        # Match by drug_keyword OR raw_text containing any keyword
        def _matches(record):
            drug_kw = (record.drug_keyword or '').lower()
            raw = (record.raw_text or '').lower()
            return any(kw in drug_kw or kw in raw for kw in keywords_lower)

        matching = [r for r in all_records if _matches(r)]
        total = len(matching)
        processed = sum(1 for r in matching if r.status == 'analyzed')
        failed = sum(1 for r in matching if r.status == 'failed')
        remaining = total - processed - failed

        # matched_posts = intelligence records linked to these intakes
        intake_ids = [r.id for r in matching]
        matched_posts = 0
        if intake_ids:
            matched_posts = session.query(IntelligenceVault).filter(
                IntelligenceVault.intake_id.in_(intake_ids)
            ).count()

        progress = round((processed / total) * 100) if total > 0 else 0
        # Auto-complete: if all records processed
        if total > 0 and processed == total:
            progress = 100
        success_rate = round((processed / (processed + failed)) * 100) if (processed + failed) > 0 else 0.0

        return {
            'progress': progress,
            'total_targets': total,
            'processed_targets': processed,
            'fetched_posts': total,
            'matched_posts': matched_posts,
            'failed_fetches': failed,
            'remaining': max(0, remaining),
            'success_rate': success_rate,
        }
    finally:
        session.close()


def get_all_signals():
    """Return all signals in the format expected by /api/signals."""
    return get_all_intelligence()


# ============================================================
# TRENDS DATA  (groups IntelligenceVault records by calendar date)
# ============================================================

def get_trends_data(days: int = 14):
    """
    Build a daily signal-count timeline for the last `days` calendar days.
    Returns a list of {date, signals, critical, high} dicts for Recharts.
    """
    from datetime import timedelta
    session = SessionLocal()
    try:
        records = session.query(IntelligenceVault).order_by(
            IntelligenceVault.created_at.desc()
        ).all()

        today = datetime.now().date()
        # Build a bucket for each day
        buckets = {}
        for i in range(days - 1, -1, -1):
            d = today - timedelta(days=i)
            label = d.strftime('%b %d')
            buckets[d] = {'date': label, 'signals': 0, 'critical': 0, 'high': 0}

        for r in records:
            if not r.created_at:
                continue
            d = r.created_at.date()
            if d in buckets:
                buckets[d]['signals'] += 1
                if r.severity == 'Critical':
                    buckets[d]['critical'] += 1
                elif r.severity == 'High':
                    buckets[d]['high'] += 1

        return list(buckets.values())
    finally:
        session.close()


# ============================================================
# APP SETTINGS CRUD
# ============================================================

def _serialize_settings(s):
    return {
        'user_id': s.user_id,
        'org_name': s.org_name,
        'contact_email': s.contact_email,
        'timezone': s.timezone,
        'dark_mode': bool(s.dark_mode),
        'compact_tables': bool(s.compact_tables),
        'show_kpi_trends': bool(s.show_kpi_trends),
        'notif_critical_alerts': bool(s.notif_critical_alerts),
        'notif_daily_digest': bool(s.notif_daily_digest),
        'notif_report_reminders': bool(s.notif_report_reminders),
        'notif_sentiment_spike': bool(s.notif_sentiment_spike),
        'notif_weekly_summary': bool(s.notif_weekly_summary),
        'webhook_url': s.webhook_url or '',
        'llm_model': s.llm_model,
        'sensitivity': s.sensitivity,
        'prr_threshold': float(s.prr_threshold or 2.0),
        'min_case_count': int(s.min_case_count or 3),
        'auto_signal': bool(s.auto_signal),
        'sentiment_ai': bool(s.sentiment_ai),
        'duplicate_detect': bool(s.duplicate_detect),
        'two_fa': bool(s.two_fa),
        'session_timeout': s.session_timeout,
        'audit_log_enabled': bool(s.audit_log_enabled),
        'ip_whitelist': bool(s.ip_whitelist),
        'updated_at': s.updated_at.isoformat() if s.updated_at else None,
    }


def get_settings(user_id: int):
    """Get settings for a user, creating defaults if they don't exist."""
    session = SessionLocal()
    try:
        s = session.query(AppSettings).filter(AppSettings.user_id == user_id).first()
        if not s:
            s = AppSettings(user_id=user_id)
            session.add(s)
            session.commit()
            session.refresh(s)
        return _serialize_settings(s)
    except Exception as e:
        session.rollback()
        return None
    finally:
        session.close()


def upsert_settings(user_id: int, data: dict):
    """Update or create settings for a user."""
    session = SessionLocal()
    try:
        s = session.query(AppSettings).filter(AppSettings.user_id == user_id).first()
        if not s:
            s = AppSettings(user_id=user_id)
            session.add(s)
        # Only update fields that are present in data
        allowed = ['org_name','contact_email','timezone','dark_mode','compact_tables',
                   'show_kpi_trends','notif_critical_alerts','notif_daily_digest',
                   'notif_report_reminders','notif_sentiment_spike','notif_weekly_summary',
                   'webhook_url','llm_model','sensitivity','prr_threshold','min_case_count',
                   'auto_signal','sentiment_ai','duplicate_detect','two_fa',
                   'session_timeout','audit_log_enabled','ip_whitelist']
        for k in allowed:
            if k in data:
                setattr(s, k, data[k])
        s.updated_at = datetime.now()
        session.commit()
        return _serialize_settings(s)
    except Exception as e:
        session.rollback()
        print(f"   [DB-ERROR] Settings upsert failed: {e}")
        return None
    finally:
        session.close()


# ============================================================
# NOTIFICATION CRUD
# ============================================================

def _serialize_notification(n):
    return {
        'id': n.id,
        'user_id': n.user_id,
        'title': n.title,
        'desc': n.desc or '',
        'icon': n.icon or 'info',
        'type': n.type or 'system',
        'category': n.category or 'System',
        'priority': n.priority or 'normal',
        'unread': bool(n.unread),
        'action_url': n.action_url,
        'created_at': n.created_at.isoformat() if n.created_at else None,
        'time': _time_ago(n.created_at),
        'read_at': n.read_at.isoformat() if n.read_at else None,
    }


def create_notification(title: str, desc: str = '', icon: str = 'info',
                         type: str = 'system', category: str = 'System',
                         priority: str = 'normal', user_id: int = None,
                         action_url: str = None):
    """Create a new notification (global if user_id=None)."""
    session = SessionLocal()
    try:
        n = Notification(title=title, desc=desc, icon=icon, type=type,
                          category=category, priority=priority,
                          user_id=user_id, action_url=action_url)
        session.add(n)
        session.commit()
        return _serialize_notification(n)
    except Exception as e:
        session.rollback()
        print(f"   [DB-ERROR] Notification create failed: {e}")
        return None
    finally:
        session.close()


def get_notifications(user_id: int = None, limit: int = 100):
    """Get notifications — global ones + user-specific ones."""
    session = SessionLocal()
    try:
        from sqlalchemy import or_
        q = session.query(Notification).order_by(Notification.created_at.desc())
        if user_id is not None:
            q = q.filter(or_(Notification.user_id == user_id, Notification.user_id == None))
        q = q.limit(limit)
        return [_serialize_notification(n) for n in q.all()]
    finally:
        session.close()


def mark_notification_read(notif_id: int):
    """Mark a single notification as read."""
    session = SessionLocal()
    try:
        n = session.query(Notification).filter(Notification.id == notif_id).first()
        if n:
            n.unread = False
            n.read_at = datetime.now()
            session.commit()
            return True
        return False
    except Exception as e:
        session.rollback()
        return False
    finally:
        session.close()


def mark_all_notifications_read(user_id: int = None):
    """Mark all notifications as read (for a user or globally)."""
    session = SessionLocal()
    try:
        from sqlalchemy import or_
        q = session.query(Notification).filter(Notification.unread == True)
        if user_id is not None:
            q = q.filter(or_(Notification.user_id == user_id, Notification.user_id == None))
        q.update({'unread': False, 'read_at': datetime.now()}, synchronize_session=False)
        session.commit()
        return True
    except Exception as e:
        session.rollback()
        return False
    finally:
        session.close()


def delete_notification(notif_id: int):
    """Permanently delete a notification."""
    session = SessionLocal()
    try:
        n = session.query(Notification).filter(Notification.id == notif_id).first()
        if n:
            session.delete(n)
            session.commit()
            return True
        return False
    except Exception as e:
        session.rollback()
        return False
    finally:
        session.close()


def get_unread_notification_count(user_id: int = None):
    """Count unread notifications for a user (or globally)."""
    session = SessionLocal()
    try:
        from sqlalchemy import or_
        q = session.query(Notification).filter(Notification.unread == True)
        if user_id is not None:
            q = q.filter(or_(Notification.user_id == user_id, Notification.user_id == None))
        return q.count()
    finally:
        session.close()


# ============================================================
# AUDIT LOG CRUD
# ============================================================

def create_audit_log(user_id: int = None, user_email: str = None,
                      action: str = '', metadata: dict = None, ip_address: str = None):
    """Create an immutable audit log entry."""
    session = SessionLocal()
    try:
        log = AuditLog(
            user_id=user_id,
            user_email=user_email,
            action=action,
            metadata_json=json.dumps(metadata or {}),
            ip_address=ip_address,
        )
        session.add(log)
        session.commit()
        return log.id
    except Exception as e:
        session.rollback()
        print(f"   [WARN] Audit log skipped: {e}")
        return None
    finally:
        session.close()


def get_audit_logs(user_id: int = None, limit: int = 100):
    """Get audit logs, optionally filtered by user."""
    session = SessionLocal()
    try:
        q = session.query(AuditLog).order_by(AuditLog.created_at.desc())
        if user_id:
            q = q.filter(AuditLog.user_id == user_id)
        logs = q.limit(limit).all()
        return [{
            'id': l.id, 'user_id': l.user_id, 'user_email': l.user_email,
            'action': l.action, 'metadata': json.loads(l.metadata_json or '{}'),
            'ip_address': l.ip_address,
            'created_at': l.created_at.isoformat() if l.created_at else None,
            'time': _time_ago(l.created_at),
        } for l in logs]
    finally:
        session.close()


# ============================================================
# EXTENDED USER CRUD
# ============================================================

def _serialize_user(u):
    return {
        'id': u.id,
        'name': u.name,
        'email': u.email,
        'role': u.role,
        'department': u.department or 'Pharmacovigilance',
        'status': u.status or 'Active',
        'created_at': u.created_at.isoformat() if u.created_at else None,
        'last_login': u.last_login.isoformat() if u.last_login else None,
        'last_active': _time_ago(u.last_login) if u.last_login else 'Never',
    }


def get_all_users():
    """Get all non-deleted users."""
    session = SessionLocal()
    try:
        users = session.query(User).filter(
            User.deleted_at == None
        ).order_by(User.created_at.desc()).all()
        return [_serialize_user(u) for u in users]
    finally:
        session.close()


def get_user_by_id(user_id: int):
    """Get a single user by ID."""
    session = SessionLocal()
    try:
        u = session.query(User).filter(User.id == user_id, User.deleted_at == None).first()
        return _serialize_user(u) if u else None
    finally:
        session.close()


def update_user(user_id: int, data: dict):
    """Update user fields. Returns updated user or error message."""
    session = SessionLocal()
    try:
        u = session.query(User).filter(User.id == user_id, User.deleted_at == None).first()
        if not u:
            return None, 'User not found'
        allowed = ['name', 'email', 'role', 'department', 'status']
        for k in allowed:
            if k in data:
                setattr(u, k, data[k])
        session.commit()
        return _serialize_user(u), None
    except Exception as e:
        session.rollback()
        return None, str(e)
    finally:
        session.close()


def soft_delete_user(user_id: int):
    """Soft-delete a user (never hard-delete for audit integrity)."""
    session = SessionLocal()
    try:
        u = session.query(User).filter(User.id == user_id).first()
        if not u:
            return False, 'User not found'
        u.deleted_at = datetime.now()
        u.status = 'Inactive'
        session.commit()
        return True, None
    except Exception as e:
        session.rollback()
        return False, str(e)
    finally:
        session.close()


def change_password(user_id: int, new_password: str):
    """Update password hash for a user."""
    session = SessionLocal()
    try:
        u = session.query(User).filter(User.id == user_id).first()
        if not u:
            return False, 'User not found'
        u.password_hash = hash_password(new_password)
        session.commit()
        return True, None
    except Exception as e:
        session.rollback()
        return False, str(e)
    finally:
        session.close()


def get_critical_alerts_count():
    """Count critical severity intelligence records (for sidebar badge)."""
    session = SessionLocal()
    try:
        return session.query(IntelligenceVault).filter(
            IntelligenceVault.severity.in_(['Critical', 'High'])
        ).count()
    finally:
        session.close()


# ============================================================
# CRAWLER SESSION + LOG HELPERS
# ============================================================

def create_crawler_session(
    project_id: int = None,
    source_id: str = None,
    keyword: str = None,
    target_url: str = None,
) -> int:
    """
    Create a new crawler session record.
    Returns the new session ID.
    One session = one 'Deploy Agentic Crawler' click or one scheduled run.
    """
    session = SessionLocal()
    try:
        rec = CrawlerSession(
            project_id=project_id,
            source_id=source_id,
            keyword=keyword,
            target_url=target_url,
            status="running",
            records_fetched=0,
            records_matched=0,
            healing_attempts=0,
            created_at=datetime.now(),
        )
        session.add(rec)
        session.commit()
        session.refresh(rec)
        return rec.id
    except Exception as e:
        session.rollback()
        print(f"[DB-ERROR] create_crawler_session: {e}")
        return -1
    finally:
        session.close()


def emit_crawler_log(
    session_id: int,
    message: str,
    event_type: str = "INFO",
    level: str = "INFO",
    source: str = None,
    project_id: int = None,
    url: str = None,
    keyword: str = None,
    metadata: dict = None,
) -> int:
    """
    Persist a single structured crawler log entry.
    This replaces all print() calls in the crawler engine.
    Returns the new log record ID (used for polling cursors).
    """
    db = SessionLocal()
    try:
        rec = CrawlerLog(
            session_id=session_id,
            project_id=project_id,
            source=source,
            level=level,
            event_type=event_type,
            message=message,
            url=url,
            keyword=keyword,
            metadata_json=json.dumps(metadata or {}),
            created_at=datetime.now(),
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        # Mirror to stdout for server terminal visibility
        print(f"[CRAWLER][{event_type}] {message}")
        return rec.id
    except Exception as e:
        db.rollback()
        print(f"[DB-ERROR] emit_crawler_log: {e}")
        return -1
    finally:
        db.close()


def get_crawler_logs_since(session_id: int, after_id: int = 0) -> list[dict]:
    """
    Return all log entries for a session with id > after_id.
    Used by the SSE/polling endpoint to stream incremental logs.
    """
    db = SessionLocal()
    try:
        rows = (
            db.query(CrawlerLog)
            .filter(
                CrawlerLog.session_id == session_id,
                CrawlerLog.id > after_id,
            )
            .order_by(CrawlerLog.id.asc())
            .limit(200)
            .all()
        )
        return [
            {
                "id": r.id,
                "session_id": r.session_id,
                "event_type": r.event_type,
                "level": r.level,
                "message": r.message,
                "source": r.source,
                "url": r.url,
                "keyword": r.keyword,
                "timestamp": r.created_at.isoformat() if r.created_at else None,
                "metadata": json.loads(r.metadata_json or "{}"),
            }
            for r in rows
        ]
    except Exception as e:
        print(f"[DB-ERROR] get_crawler_logs_since: {e}")
        return []
    finally:
        db.close()


def finish_crawler_session(
    session_id: int,
    status: str = "completed",
    records_fetched: int = 0,
    records_matched: int = 0,
    healing_attempts: int = 0,
):
    """Mark a crawler session as finished and record final stats."""
    db = SessionLocal()
    try:
        rec = db.query(CrawlerSession).filter(CrawlerSession.id == session_id).first()
        if rec:
            rec.status = status
            rec.records_fetched = records_fetched
            rec.records_matched = records_matched
            rec.healing_attempts = healing_attempts
            rec.finished_at = datetime.now()
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"[DB-ERROR] finish_crawler_session: {e}")
    finally:
        db.close()


def get_crawler_session(session_id: int) -> dict:
    """Return a session record as dict."""
    db = SessionLocal()
    try:
        rec = db.query(CrawlerSession).filter(CrawlerSession.id == session_id).first()
        if not rec:
            return {}
        return {
            "id": rec.id,
            "project_id": rec.project_id,
            "source_id": rec.source_id,
            "keyword": rec.keyword,
            "target_url": rec.target_url,
            "status": rec.status,
            "records_fetched": rec.records_fetched,
            "records_matched": rec.records_matched,
            "healing_attempts": rec.healing_attempts,
            "created_at": rec.created_at.isoformat() if rec.created_at else None,
            "finished_at": rec.finished_at.isoformat() if rec.finished_at else None,
        }
    except Exception as e:
        print(f"[DB-ERROR] get_crawler_session: {e}")
        return {}
    finally:
        db.close()
