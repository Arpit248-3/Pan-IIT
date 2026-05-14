"""
AyuScout V2 — Database Layer (SQLAlchemy ORM)
===============================================
Upgraded from raw sqlite3 to SQLAlchemy for scalability.
Uses SQLite for local dev, but the ORM structure supports
PostgreSQL/MySQL migration by changing only DATABASE_URL.

Integrates with:
  - Vector Store (ChromaDB) for embedding storage
  - Webhook Alerter for urgent event notification
"""

import os
import json
import hashlib
import secrets
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# Load environment
load_dotenv()

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


class User(Base):
    """Registered users (patients/doctors/admins)."""
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    name          = Column(String(200), nullable=False)
    email         = Column(String(200), nullable=False, unique=True)
    password_hash = Column(String(300), nullable=False)
    role          = Column(String(50), default='user')   # 'user' | 'admin'
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
    keywords_json       = Column(Text, default="[]")   # JSON array of keyword strings
    sources_json        = Column(Text, default="[]")   # JSON array of source IDs
    scraper_config_json = Column(Text, default="{}")   # JSON scraper config from Agentic Onboarder
    status              = Column(String(50), default='Active')
    agentic_enabled     = Column(Boolean, default=False)
    schedule_interval   = Column(String(50), default='Daily')  # Scrape frequency: Real-time / Daily / Weekly
    created_at          = Column(DateTime, default=datetime.now)


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
    print("📊 Database initialized (SQLAlchemy ORM)")

    # Backward-compatible migration: add schedule_interval if existing DB lacks it
    try:
        with engine.connect() as conn:
            conn.execute(
                __import__('sqlalchemy').text(
                    "ALTER TABLE projects ADD COLUMN schedule_interval VARCHAR(50) DEFAULT 'Daily'"
                )
            )
            conn.commit()
            print("📋 Migration applied: projects.schedule_interval column added")
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
                created_at=datetime.now()
            )
            session.add(admin)
            session.commit()
            print("✅ Admin user seeded: admin@ayuscout.ai / Admin@123")
    except Exception as e:
        session.rollback()
        print(f"⚠️ Admin seed skipped: {e}")
    finally:
        session.close()


# ============================================================
# INTAKE VAULT OPERATIONS
# ============================================================

def save_intake(text, platform, drug, pii_map="{}"):
    """Save a PII-masked intake record."""
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
        print(f"   💾 Intake saved: platform={platform}, drug={drug}")
    except Exception as e:
        session.rollback()
        print(f"   ❌ Intake save failed: {e}")
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
        print(f"   ❌ Status update failed: {e}")
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
        
        # --- DRUG RECOVERY ---
        drug = _flatten(analysis.get('suspect_drug') or analysis.get('drug'))
        if drug == "Unknown":
            if "lisinopril" in analysis_full_text or "lisinopril" in raw_text_lower:
                drug = "Lisinopril"
            elif "metformin" in analysis_full_text or "metformin" in raw_text_lower:
                drug = "Metformin"
        
        # --- EVENT RECOVERY ---
        event = _flatten(analysis.get('meddra_term') or analysis.get('adverse_event') or analysis.get('event'))
        if event == "Unknown":
            if "swelling" in analysis_full_text:
                event = "Angioedema"
            elif "nausea" in analysis_full_text:
                event = "Nausea"
            elif "dizzy" in analysis_full_text:
                event = "Dizziness"
        
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
        # Derive sentiment from causality/severity if not explicitly set
        raw_sentiment = analysis.get('sentiment')
        if raw_sentiment and str(raw_sentiment).strip() not in ("Unknown", "None", ""):
            sentiment = _flatten(raw_sentiment)
        else:
            # Intelligently derive from causality + severity
            caus_lower = causality.lower() if causality else ""
            sev_lower = severity.lower() if severity else ""
            if caus_lower in ("unlikely", "unassessable") or sev_lower == "low":
                sentiment = "Positive"
            elif caus_lower == "possible" or sev_lower == "medium":
                sentiment = "Neutral"
            else:
                sentiment = "Negative"
        
        # WHO-UMC details
        umc_details = doctor_data.get('who_umc_details', {})
        who_umc_score = umc_details.get('score', 0) if isinstance(umc_details, dict) else 0
        who_umc_factors = json.dumps(umc_details.get('factors', [])) if isinstance(umc_details, dict) else "[]"
        
        print(f"\n✅ DATA SAVED TO INTELLIGENCE VAULT")
        print(f"   💊 Drug/Event: {drug} -> {event}")
        print(f"   📊 Causality: {causality} | Confidence: {confidence} | Severity: {severity}")
        print(f"   🧠 Reasoning: {reasoning}")
        print(f"   🔗 Traceability: {pubmed_link}\n")
        
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
            created_at=datetime.now()
        )
        session.add(record)
        session.commit()
        
        saved_id = record.id
        
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
            print(f"   ⚠️ Vector store integration skipped: {e}")
        
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
            print(f"   ⚠️ Webhook alerter skipped: {e}")
        
    except Exception as e:
        session.rollback()
        print(f"   ❌ Intelligence save failed: {e}")
    finally:
        session.close()


# ============================================================
# QUERY OPERATIONS
# ============================================================

def get_all_intelligence():
    """Get all intelligence records for the dashboard."""
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
                "reasoning": r.reasoning,
                "pubmed_link": r.pubmed_link,
                "concomitant_drugs": r.concomitant_drugs,
                "time_to_onset": r.time_to_onset,
                "who_umc_score": r.who_umc_score,
                "who_umc_factors": r.who_umc_factors,
                "created_at": r.created_at.isoformat() if r.created_at else None
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
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
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
    """Get all intake vault records for the Data Explorer."""
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
            result.append({
                "id": r.id,
                "content": r.raw_text[:120] if r.raw_text else "",
                "platform": r.platform or "Unknown",
                "drug_keyword": r.drug_keyword or "Unknown",
                "status": r.status or "pending",
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "sentiment": intel.sentiment if intel else "Unknown",
                "has_analysis": intel is not None
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

def create_user(name: str, email: str, password: str, role: str = 'user'):
    session = SessionLocal()
    try:
        if session.query(User).filter(User.email == email).first():
            return None, 'Email already registered'
        user = User(name=name, email=email, password_hash=hash_password(password), role=role)
        session.add(user)
        session.commit()
        return {'id': user.id, 'name': user.name, 'email': user.email, 'role': user.role}, None
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
        return {'id': u.id, 'name': u.name, 'email': u.email,
                'password_hash': u.password_hash, 'role': u.role}
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
                   agentic_enabled: bool = False, schedule_interval: str = 'Daily'):
    """Create and persist a new monitoring project."""
    session = SessionLocal()
    try:
        proj = Project(
            name=name,
            keywords_json=json.dumps(keywords or []),
            sources_json=json.dumps(sources or []),
            scraper_config_json=json.dumps(scraper_config or {}),
            status='Active',
            agentic_enabled=agentic_enabled,
            schedule_interval=schedule_interval,
            created_at=datetime.now()
        )
        session.add(proj)
        session.commit()
        return _serialize_project(proj)
    except Exception as e:
        session.rollback()
        print(f"   ❌ Project create failed: {e}")
        return None
    finally:
        session.close()


def get_all_projects():
    """Return all projects ordered by creation date."""
    session = SessionLocal()
    try:
        projs = session.query(Project).order_by(Project.created_at.desc()).all()
        return [_serialize_project(p) for p in projs]
    finally:
        session.close()


def _serialize_project(p):
    try:
        keywords = json.loads(p.keywords_json or '[]')
    except Exception:
        keywords = []
    try:
        sources = json.loads(p.sources_json or '[]')
    except Exception:
        sources = []
    try:
        scraper_config = json.loads(p.scraper_config_json or '{}')
    except Exception:
        scraper_config = {}
    return {
        'id': p.id,
        'name': p.name,
        'keywords': keywords,
        'keywords_count': len(keywords),
        'sources': sources,
        'sources_label': ', '.join(sources) if sources else 'Reddit',
        'scraper_config': scraper_config,
        'status': p.status or 'Active',
        'statusC': 'success' if (p.status or 'Active') == 'Active' else 'warning',
        'agentic_enabled': bool(p.agentic_enabled),
        'schedule_interval': p.schedule_interval or 'Daily',
        'progress': 0,
        'team': ['AI'],
        'due': 'Ongoing',
        'created_at': p.created_at.isoformat() if p.created_at else None,
    }


# ============================================================
# SIGNALS API  (thin wrapper over IntelligenceVault)
# ============================================================

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