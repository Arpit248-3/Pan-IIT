"""
AyuScout V2 — Database Seeder
==============================
Inserts 15 realistic, pre-processed pharmacovigilance records
into the SQLite database for hackathon demo purposes.

Usage:
    python seed_db.py

This populates:
  - intake_vault (raw crawler data)
  - intelligence_vault (AI-analyzed results)
  - ChromaDB vector store (embeddings)
"""

import json
from datetime import datetime, timedelta
from database import init_db, save_intake, save_intelligence, SessionLocal, IntelligenceVault, IntakeVault

# ============================================================
# SEED DATA — 15 Realistic Pharmacovigilance Cases
# ============================================================

SEED_CASES = [
    {
        "raw_text": "[NAME] has been on Lisinopril 10mg for hypertension. Yesterday morning, her lips and face started swelling severely. She went to the ER.",
        "platform": "Reddit (r/hypertension)",
        "drug_keyword": "Lisinopril",
        "extracted_data": {
            "suspect_drug": "Lisinopril",
            "concomitant_drugs": [],
            "adverse_event": "face and lip swelling",
            "meddra_term": "Angioedema",
            "time_to_onset": "1 day"
        },
        "doctor_verdict": {
            "causality_score": "Certain",
            "confidence_score": "95%",
            "reasoning": "Angioedema is a well-documented, serious ADR of ACE inhibitors like Lisinopril with strong temporal association.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Lisinopril+Angioedema",
            "severity": "Critical",
            "who_umc_details": {"category": "Certain", "score": 95, "factors": ["Strong temporal relationship (+25)", "No concomitant drugs (+15)", "Known drug-event association (+20)"]}
        }
    },
    {
        "raw_text": "I've been taking Metformin 500mg twice daily for my Type 2 diabetes. Every day after lunch I get terrible nausea and stomach cramps.",
        "platform": "Reddit (r/diabetes)",
        "drug_keyword": "Metformin",
        "extracted_data": {
            "suspect_drug": "Metformin",
            "concomitant_drugs": [],
            "adverse_event": "nausea and stomach cramps",
            "meddra_term": "Nausea",
            "time_to_onset": "after meals daily"
        },
        "doctor_verdict": {
            "causality_score": "Certain",
            "confidence_score": "92%",
            "reasoning": "GI side effects are the most common ADR of Metformin, occurring in up to 25% of patients. Strong temporal pattern.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Metformin+Nausea",
            "severity": "High",
            "who_umc_details": {"category": "Certain", "score": 92, "factors": ["Strong temporal relationship (+25)", "No concomitant drugs (+15)", "Known drug-event association (+15)"]}
        }
    },
    {
        "raw_text": "Started Atorvastatin 20mg last month. Now I have severe muscle pain in my legs and arms. Can barely walk up stairs.",
        "platform": "Reddit (r/cholesterol)",
        "drug_keyword": "Atorvastatin",
        "extracted_data": {
            "suspect_drug": "Atorvastatin",
            "concomitant_drugs": [],
            "adverse_event": "severe muscle pain in legs and arms",
            "meddra_term": "Myalgia",
            "time_to_onset": "1 month"
        },
        "doctor_verdict": {
            "causality_score": "Probable",
            "confidence_score": "82%",
            "reasoning": "Statin-induced myalgia is a well-known class effect. Temporal relationship is moderate (1 month). CK levels should be checked.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Atorvastatin+Myalgia",
            "severity": "High",
            "who_umc_details": {"category": "Probable", "score": 82, "factors": ["Moderate temporal relationship (+15)", "No concomitant drugs (+15)", "Known drug-event association (+15)"]}
        }
    },
    {
        "raw_text": "My doctor put me on Omeprazole for acid reflux. Been taking it for 2 weeks and now I get splitting headaches every afternoon.",
        "platform": "Reddit (r/GERD)",
        "drug_keyword": "Omeprazole",
        "extracted_data": {
            "suspect_drug": "Omeprazole",
            "concomitant_drugs": [],
            "adverse_event": "splitting headaches every afternoon",
            "meddra_term": "Cephalalgia",
            "time_to_onset": "2 weeks"
        },
        "doctor_verdict": {
            "causality_score": "Possible",
            "confidence_score": "58%",
            "reasoning": "Headache is a known but uncommon side effect of PPIs. Temporal relationship present but other causes cannot be excluded.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Omeprazole+Headache",
            "severity": "Medium",
            "who_umc_details": {"category": "Possible", "score": 58, "factors": ["Moderate temporal relationship (+15)", "No concomitant drugs (+15)", "Known drug-event association (+10)"]}
        }
    },
    {
        "raw_text": "Taking Amoxicillin for a tooth infection. On day 3, broke out in a full body rash. Red, itchy, spreading from my trunk to arms.",
        "platform": "Reddit (r/AskDocs)",
        "drug_keyword": "Amoxicillin",
        "extracted_data": {
            "suspect_drug": "Amoxicillin",
            "concomitant_drugs": ["Ibuprofen"],
            "adverse_event": "full body rash, red and itchy",
            "meddra_term": "Drug eruption",
            "time_to_onset": "3 days"
        },
        "doctor_verdict": {
            "causality_score": "Probable",
            "confidence_score": "85%",
            "reasoning": "Maculopapular rash on day 3 of Amoxicillin is a classic delayed hypersensitivity reaction. One concomitant drug (Ibuprofen) noted.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Amoxicillin+Drug+eruption",
            "severity": "High",
            "who_umc_details": {"category": "Probable", "score": 85, "factors": ["Strong temporal relationship (+25)", "1 concomitant drug (+5)", "Known drug-event association (+15)"]}
        }
    },
    {
        "raw_text": "Insulin Glargine user here. Had a severe hypoglycemic episode at work yesterday. Blood sugar dropped to 42. Almost passed out.",
        "platform": "Reddit (r/diabetes_t1)",
        "drug_keyword": "Insulin",
        "extracted_data": {
            "suspect_drug": "Insulin Glargine",
            "concomitant_drugs": ["Metformin"],
            "adverse_event": "severe hypoglycemic episode, blood sugar 42",
            "meddra_term": "Hypoglycaemia",
            "time_to_onset": "same day"
        },
        "doctor_verdict": {
            "causality_score": "Probable",
            "confidence_score": "88%",
            "reasoning": "Hypoglycemia is a direct pharmacological effect of insulin. Concurrent Metformin may have contributed. Dose adjustment needed.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Insulin+Hypoglycemia",
            "severity": "Critical",
            "who_umc_details": {"category": "Probable", "score": 88, "factors": ["Strong temporal relationship (+25)", "1 concomitant drug (+5)", "Known drug-event association (+20)"]}
        }
    },
    {
        "raw_text": "Been on Metformin for 6 months now. Recently noticed a persistent metallic taste in my mouth. Food doesn't taste right anymore.",
        "platform": "X (Twitter)",
        "drug_keyword": "Metformin",
        "extracted_data": {
            "suspect_drug": "Metformin",
            "concomitant_drugs": [],
            "adverse_event": "persistent metallic taste",
            "meddra_term": "Dysgeusia",
            "time_to_onset": "6 months"
        },
        "doctor_verdict": {
            "causality_score": "Possible",
            "confidence_score": "62%",
            "reasoning": "Dysgeusia is a recognized but less common ADR of Metformin. Late onset (6 months) weakens temporal relationship.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Metformin+Dysgeusia",
            "severity": "Low",
            "who_umc_details": {"category": "Possible", "score": 62, "factors": ["Weak temporal relationship (+5)", "No concomitant drugs (+15)", "Known drug-event association (+15)"]}
        }
    },
    {
        "raw_text": "Paracetamol 1000mg taken for fever. After 3 tablets in one day, started vomiting and having upper abdominal pain. ALT elevated.",
        "platform": "Reddit (r/medicine)",
        "drug_keyword": "Paracetamol",
        "extracted_data": {
            "suspect_drug": "Paracetamol",
            "concomitant_drugs": [],
            "adverse_event": "vomiting, upper abdominal pain, elevated ALT",
            "meddra_term": "Hepatotoxicity",
            "time_to_onset": "same day"
        },
        "doctor_verdict": {
            "causality_score": "Probable",
            "confidence_score": "78%",
            "reasoning": "Paracetamol hepatotoxicity at high doses is well-documented. Elevated ALT with GI symptoms is classic presentation. Dose-dependent toxicity.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Paracetamol+Hepatotoxicity",
            "severity": "High",
            "who_umc_details": {"category": "Probable", "score": 78, "factors": ["Strong temporal relationship (+25)", "No concomitant drugs (+15)", "No known association in database (+0)"]}
        }
    },
    {
        "raw_text": "My grandmother takes Lisinopril and has developed a persistent dry cough that won't go away. Coughing all night, can't sleep.",
        "platform": "Reddit (r/eldercare)",
        "drug_keyword": "Lisinopril",
        "extracted_data": {
            "suspect_drug": "Lisinopril",
            "concomitant_drugs": ["Amlodipine", "Aspirin"],
            "adverse_event": "persistent dry cough, can't sleep",
            "meddra_term": "Cough",
            "time_to_onset": "weeks"
        },
        "doctor_verdict": {
            "causality_score": "Possible",
            "confidence_score": "72%",
            "reasoning": "ACE inhibitor-induced cough occurs in 5-35% of patients. Two concomitant drugs present which may confound. Classic bradykinin-mediated mechanism.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Lisinopril+Cough",
            "severity": "Medium",
            "who_umc_details": {"category": "Possible", "score": 55, "factors": ["Moderate temporal relationship (+15)", "2 concomitant drugs (-15)", "Known drug-event association (+15)"]}
        }
    },
    {
        "raw_text": "Switched to Insulin Lispro 3 weeks ago. Getting dizzy spells and feeling lightheaded throughout the day. Never had this before.",
        "platform": "X (Twitter)",
        "drug_keyword": "Insulin",
        "extracted_data": {
            "suspect_drug": "Insulin Lispro",
            "concomitant_drugs": [],
            "adverse_event": "dizzy spells and lightheadedness",
            "meddra_term": "Dizziness",
            "time_to_onset": "3 weeks"
        },
        "doctor_verdict": {
            "causality_score": "Possible",
            "confidence_score": "55%",
            "reasoning": "Dizziness may be related to fluctuating blood glucose levels from insulin. Temporal relationship present but non-specific symptom.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Insulin+Dizziness",
            "severity": "Medium",
            "who_umc_details": {"category": "Possible", "score": 55, "factors": ["Moderate temporal relationship (+15)", "No concomitant drugs (+15)", "No known association in database (+0)"]}
        }
    },
    {
        "raw_text": "Taking Atorvastatin and Metformin together. Noticed my liver enzymes are up on the last blood test. Doctor is concerned.",
        "platform": "Reddit (r/pharmacy)",
        "drug_keyword": "Atorvastatin",
        "extracted_data": {
            "suspect_drug": "Atorvastatin",
            "concomitant_drugs": ["Metformin"],
            "adverse_event": "elevated liver enzymes",
            "meddra_term": "Hepatotoxicity",
            "time_to_onset": "unknown"
        },
        "doctor_verdict": {
            "causality_score": "Possible",
            "confidence_score": "60%",
            "reasoning": "Statin-induced hepatotoxicity is documented but uncommon. Metformin confounder present. Temporal relationship unclear from blood test.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Atorvastatin+Hepatotoxicity",
            "severity": "High",
            "who_umc_details": {"category": "Possible", "score": 50, "factors": ["Temporal relationship unclear (+0)", "1 concomitant drug (+5)", "Known drug-event association (+20)"]}
        }
    },
    {
        "raw_text": "Amoxicillin for bronchitis. Felt fine until day 5, then developed severe diarrhea. 6 episodes a day. Had to stop the antibiotic.",
        "platform": "Reddit (r/AskDocs)",
        "drug_keyword": "Amoxicillin",
        "extracted_data": {
            "suspect_drug": "Amoxicillin",
            "concomitant_drugs": [],
            "adverse_event": "severe diarrhea, 6 episodes daily",
            "meddra_term": "Diarrhoea",
            "time_to_onset": "5 days"
        },
        "doctor_verdict": {
            "causality_score": "Probable",
            "confidence_score": "80%",
            "reasoning": "Antibiotic-associated diarrhea is very common with Amoxicillin due to gut flora disruption. Positive dechallenge (stopped antibiotic).",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Amoxicillin+Diarrhoea",
            "severity": "Medium",
            "who_umc_details": {"category": "Probable", "score": 80, "factors": ["Strong temporal relationship (+25)", "No concomitant drugs (+15)", "No known association in database (+0)"]}
        }
    },
    {
        "raw_text": "On Omeprazole long-term for GERD. Recently diagnosed with low magnesium levels. Doctor said it might be from the PPI.",
        "platform": "X (Twitter)",
        "drug_keyword": "Omeprazole",
        "extracted_data": {
            "suspect_drug": "Omeprazole",
            "concomitant_drugs": ["Calcium supplements"],
            "adverse_event": "low magnesium levels",
            "meddra_term": "Hypomagnesaemia",
            "time_to_onset": "long-term use"
        },
        "doctor_verdict": {
            "causality_score": "Unlikely",
            "confidence_score": "38%",
            "reasoning": "PPI-induced hypomagnesemia is documented but rare and typically occurs with very prolonged use. Multiple alternative causes possible.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Omeprazole+Hypomagnesaemia",
            "severity": "Low",
            "who_umc_details": {"category": "Unlikely", "score": 30, "factors": ["Weak temporal relationship (+5)", "1 concomitant drug (+5)", "No known association in database (+0)"]}
        }
    },
    {
        "raw_text": "Was prescribed Metformin 3 years ago. Recently been having joint pain. Not sure if it's related or just aging.",
        "platform": "Reddit (r/diabetes)",
        "drug_keyword": "Metformin",
        "extracted_data": {
            "suspect_drug": "Metformin",
            "concomitant_drugs": ["Vitamin D"],
            "adverse_event": "joint pain",
            "meddra_term": "Arthralgia",
            "time_to_onset": "3 years"
        },
        "doctor_verdict": {
            "causality_score": "Unlikely",
            "confidence_score": "25%",
            "reasoning": "Very weak temporal relationship (3 years). Arthralgia is not a recognized ADR of Metformin. More likely age-related.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Metformin+Arthralgia",
            "severity": "Low",
            "who_umc_details": {"category": "Unlikely", "score": 25, "factors": ["Weak temporal relationship (+5)", "1 concomitant drug (+5)", "No known association in database (+0)"]}
        }
    },
    {
        "raw_text": "Taking some herbal supplement along with Insulin. Had a weird tingling in my fingers but it went away after a day.",
        "platform": "Reddit (r/supplements)",
        "drug_keyword": "Insulin",
        "extracted_data": {
            "suspect_drug": "Insulin",
            "concomitant_drugs": ["Herbal supplement (unspecified)"],
            "adverse_event": "tingling in fingers",
            "meddra_term": "Paraesthesia",
            "time_to_onset": "unknown"
        },
        "doctor_verdict": {
            "causality_score": "Unassessable",
            "confidence_score": "15%",
            "reasoning": "Insufficient data. Unknown herbal supplement is a major confounder. Symptom self-resolved. Temporal relationship unclear.",
            "pubmed_search_link": "https://pubmed.ncbi.nlm.nih.gov/?term=Insulin+Paraesthesia",
            "severity": "Low",
            "who_umc_details": {"category": "Unassessable", "score": 15, "factors": ["Temporal relationship unclear (+0)", "1 concomitant drug (+5)", "No known association in database (+0)"]}
        }
    },
]


def seed_database():
    """Seed the database with 15 realistic pharmacovigilance records."""
    print("\n" + "=" * 60)
    print("[SEED] AyuScout V2 — Database Seeder")
    print("=" * 60)
    
    # Initialize database
    init_db()
    
    # Check if already seeded
    session = SessionLocal()
    existing = session.query(IntelligenceVault).count()
    if existing >= 10:
        print(f"[SEED] Database already has {existing} records. Skipping seed.")
        print("[SEED] To re-seed, delete signalrx.db first.")
        session.close()
        return
    session.close()
    
    # Seed each case
    for i, case in enumerate(SEED_CASES, 1):
        print(f"\n[SEED] Case {i}/15: {case['extracted_data']['suspect_drug']} -> {case['extracted_data']['meddra_term']}")
        
        # 1. Save to intake_vault
        from core.pii_vault import PIIVault
        vault = PIIVault()
        masked_text, pii_map = vault.mask(case["raw_text"])
        
        save_intake(
            text=masked_text,
            platform=case["platform"],
            drug=case["drug_keyword"],
            pii_map=json.dumps(pii_map) if pii_map else "{}"
        )
        
        # 2. Get the intake_id we just saved
        session = SessionLocal()
        latest_intake = session.query(IntakeVault).order_by(IntakeVault.id.desc()).first()
        intake_id = latest_intake.id if latest_intake else i
        session.close()
        
        # 3. Build the full result object (as if the AI pipeline ran)
        full_result = {
            "raw_text": case["raw_text"],
            "clean_text": masked_text,
            "extracted_data": case["extracted_data"],
            "extraction_attempts": 1,
            "critic_feedback": "PASS",
            "doctor_verdict": case["doctor_verdict"]
        }
        
        # 4. Save to intelligence_vault (this also stores in ChromaDB + triggers webhooks)
        save_intelligence(intake_id, full_result)
        
        # Stagger created_at for realistic timestamps
        session = SessionLocal()
        record = session.query(IntelligenceVault).order_by(IntelligenceVault.id.desc()).first()
        if record:
            record.created_at = datetime.now() - timedelta(hours=(15 - i) * 4, minutes=i * 7)
            session.commit()
        session.close()
    
    print("\n" + "=" * 60)
    print(f"[SEED] Successfully seeded 15 pharmacovigilance records!")
    print(f"[SEED] Database is ready for hackathon demo.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    seed_database()
