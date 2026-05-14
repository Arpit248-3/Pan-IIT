"""
AyuScout V2 — AI Engine (Multi-Agent Pipeline)
================================================
LangGraph-based agentic pipeline for pharmacovigilance:
  0. Translator Agent → Regional text to English translation (via Bhashini API)
  1. Guard Agent    → PII masking (surgical)
  2. Generator Agent → Clinical data extraction + MedDRA mapping
  3. Critic Agent   → QA verification loop
  4. Doctor Agent   → WHO-UMC Causality assessment + Explainability

Includes deterministic WHO-UMC causality scoring alongside LLM assessment.
All LLM calls wrapped in try-except for demo safety.
"""

from typing import TypedDict, Optional, List
from pydantic import BaseModel, Field
import json
import os
import requests
from dotenv import load_dotenv

load_dotenv()


# --- TRY TO LOAD AI MODELS (Gemini for Cloud, Ollama for Local) ---
LLM_AVAILABLE = False
try:
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.messages import SystemMessage, HumanMessage
    from langchain_core.output_parsers import JsonOutputParser
    from langgraph.graph import StateGraph, END

    # Initialize Gemini (Production-ready for Render)
    api_key = os.getenv("GOOGLE_API_KEY")
    if api_key:
        fast_local_llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=api_key, temperature=0)
        json_local_llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=api_key, temperature=0.2)
        LLM_AVAILABLE = True
        print("✅ AI Engine: Gemini models loaded (gemini-1.5-flash)")
    else:
        # Fallback to Ollama for local dev if no API key
        try:
            from langchain_ollama import ChatOllama
            fast_local_llm = ChatOllama(model="llama3.2:1b", temperature=0)
            json_local_llm = ChatOllama(model="llama3.2:1b", temperature=0.2, format="json")
            LLM_AVAILABLE = True
            print("[OK] AI Engine: Ollama models loaded (llama3.2:1b)")
        except ImportError:
            print("[WARN] AI Engine: GOOGLE_API_KEY not found and Ollama not installed.")

except Exception as e:
    print(f"[WARN] AI Engine: Ollama/LangGraph unavailable ({e}). Using mock mode for demo.")
    # Import just what we need for the graph structure
    try:
        from langgraph.graph import StateGraph, END
    except ImportError:
        pass


# --- 1. THE STATE ---
class GraphState(TypedDict):
    raw_text: str
    clean_text: str
    extracted_data: Optional[dict]
    extraction_attempts: int
    critic_feedback: str
    doctor_verdict: Optional[dict]


# --- 2. THE SCHEMAS ---
class ClinicalData(BaseModel):
    suspect_drug: str
    concomitant_drugs: List[str]
    adverse_event: str
    meddra_term: str = Field(description="The formal MedDRA standardized medical term for the adverse event")
    time_to_onset: str


class DoctorVerdict(BaseModel):
    causality_score: str = Field(description="Certain, Probable, Possible, Unlikely, or Unassessable")
    confidence_score: str = Field(description="Percentage from 0% to 100%")
    reasoning: str = Field(description="One sentence explaining the causality decision")
    pubmed_search_link: str = Field(description="A PubMed URL to verify this drug-event relationship")


# ============================================================
# WHO-UMC CAUSALITY ALGORITHM (Deterministic, Rule-Based)
# ============================================================
def who_umc_causality(extracted_data: dict) -> dict:
    """
    Deterministic WHO-UMC causality assessment.
    
    Scoring based on:
    - Temporal relationship (time-to-onset)
    - Concomitant drug confounders
    - Known drug-event associations
    - Dechallenge/Rechallenge signals in text
    
    Returns:
        dict: {category, score, factors}
    """
    if not extracted_data or not isinstance(extracted_data, dict):
        return {"category": "Unassessable", "score": 0, "factors": ["No data available"]}
    
    score = 50  # Baseline
    factors = []
    
    # --- Factor 1: Temporal Relationship ---
    time_onset = str(extracted_data.get('time_to_onset', '')).lower()
    
    strong_temporal = ['hour', 'minute', 'immediately', 'right after', 'same day', 'next day']
    moderate_temporal = ['day', 'week', 'started', 'began', 'since taking', 'after taking']
    weak_temporal = ['month', 'year', 'long time', 'gradually']
    
    if any(t in time_onset for t in strong_temporal):
        score += 25
        factors.append("Strong temporal relationship (+25)")
    elif any(t in time_onset for t in moderate_temporal):
        score += 15
        factors.append("Moderate temporal relationship (+15)")
    elif any(t in time_onset for t in weak_temporal):
        score += 5
        factors.append("Weak temporal relationship (+5)")
    else:
        factors.append("Temporal relationship unclear (+0)")
    
    # --- Factor 2: Concomitant Drugs (Confounders) ---
    concomitant = extracted_data.get('concomitant_drugs', [])
    if isinstance(concomitant, str):
        concomitant = [c.strip() for c in concomitant.split(',') if c.strip()]
    
    if not concomitant or concomitant == ['None'] or concomitant == ['']:
        score += 15
        factors.append("No concomitant drugs — no confounders (+15)")
    elif len(concomitant) == 1:
        score += 5
        factors.append(f"1 concomitant drug — minor confounder (+5)")
    elif len(concomitant) >= 2:
        score -= 15
        factors.append(f"{len(concomitant)} concomitant drugs — significant confounders (-15)")
    
    # --- Factor 3: Known Drug-Event Associations ---
    known_associations = {
        ("lisinopril", "angioedema"): 20,
        ("lisinopril", "swelling"): 15,
        ("lisinopril", "cough"): 15,
        ("metformin", "nausea"): 15,
        ("metformin", "dizziness"): 10,
        ("metformin", "metallic taste"): 15,
        ("atorvastatin", "myalgia"): 15,
        ("atorvastatin", "hepatotoxicity"): 20,
        ("insulin", "hypoglycemia"): 20,
        ("omeprazole", "headache"): 10,
        ("amoxicillin", "rash"): 15,
        ("amoxicillin", "anaphylaxis"): 20,
    }
    
    drug = str(extracted_data.get('suspect_drug', '')).lower()
    event = str(extracted_data.get('adverse_event', '') or extracted_data.get('meddra_term', '')).lower()
    
    association_bonus = 0
    for (known_drug, known_event), bonus in known_associations.items():
        if known_drug in drug and known_event in event:
            association_bonus = bonus
            break
    
    if association_bonus > 0:
        score += association_bonus
        factors.append(f"Known drug-event association (+{association_bonus})")
    else:
        factors.append("No known association in database (+0)")
    
    # --- Clamp score ---
    score = max(0, min(100, score))
    
    # --- Map to WHO-UMC Categories ---
    if score >= 85:
        category = "Certain"
    elif score >= 70:
        category = "Probable"
    elif score >= 45:
        category = "Possible"
    elif score >= 25:
        category = "Unlikely"
    else:
        category = "Unassessable"
    
    return {
        "category": category,
        "score": score,
        "factors": factors
    }


def _determine_severity(event: str, causality_category: str) -> str:
    """Determine severity for webhook alerting."""
    critical_events = ["angioedema", "anaphylaxis", "seizure", "hepatotoxicity",
                       "nephrotoxicity", "cardiac arrest", "death", "stevens-johnson",
                       "swelling"]
    
    event_lower = str(event).lower()
    
    if any(ce in event_lower for ce in critical_events):
        return "Critical"
    elif causality_category in ("Certain", "Probable"):
        return "High"
    elif causality_category == "Possible":
        return "Medium"
    else:
        return "Low"


# ============================================================
# MOCK RESULTS (When Ollama is unavailable)
# ============================================================
def _generate_mock_result(raw_text: str) -> dict:
    """Generate a realistic mock result when LLMs aren't available."""
    text_lower = raw_text.lower()
    
    # Try to extract drug and event from text
    drug = "Unknown"
    event = "Unknown"
    meddra = "Unknown"
    time_onset = "Unknown"
    concomitant = []
    
    # Keyword matching — covers 30+ drugs and 20+ adverse events
    drug_map = {
        "metformin": "Metformin", "lisinopril": "Lisinopril",
        "atorvastatin": "Atorvastatin", "simvastatin": "Simvastatin",
        "rosuvastatin": "Rosuvastatin", "amlodipine": "Amlodipine",
        "insulin": "Insulin", "glipizide": "Glipizide",
        "omeprazole": "Omeprazole", "pantoprazole": "Pantoprazole",
        "amoxicillin": "Amoxicillin", "azithromycin": "Azithromycin",
        "ciprofloxacin": "Ciprofloxacin", "doxycycline": "Doxycycline",
        "ibuprofen": "Ibuprofen", "naproxen": "Naproxen",
        "aspirin": "Aspirin", "paracetamol": "Paracetamol",
        "acetaminophen": "Acetaminophen", "diclofenac": "Diclofenac",
        "warfarin": "Warfarin", "clopidogrel": "Clopidogrel",
        "metoprolol": "Metoprolol", "atenolol": "Atenolol",
        "losartan": "Losartan", "ramipril": "Ramipril",
        "furosemide": "Furosemide", "prednisone": "Prednisone",
        "levothyroxine": "Levothyroxine", "sertraline": "Sertraline",
        "fluoxetine": "Fluoxetine", "gabapentin": "Gabapentin",
        "cetirizine": "Cetirizine", "hydroxychloroquine": "Hydroxychloroquine",
    }
    event_map = {
        "dizzy": ("dizziness", "Dizziness"),
        "dizziness": ("dizziness", "Dizziness"),
        "nausea": ("nausea", "Nausea"),
        "swelling": ("face swelling", "Angioedema"),
        "angioedema": ("angioedema", "Angioedema"),
        "anaphylax": ("anaphylaxis", "Anaphylaxis"),
        "rash": ("skin rash", "Dermatitis"),
        "hives": ("urticaria", "Urticaria"),
        "headache": ("headache", "Cephalalgia"),
        "metallic taste": ("metallic taste", "Dysgeusia"),
        "taste": ("altered taste", "Dysgeusia"),
        "vomit": ("vomiting", "Emesis"),
        "diarrhea": ("diarrhoea", "Diarrhoea"),
        "constipation": ("constipation", "Constipation"),
        "fatigue": ("fatigue", "Fatigue"),
        "tired": ("fatigue", "Fatigue"),
        "itching": ("pruritus", "Pruritus"),
        "itch": ("pruritus", "Pruritus"),
        "chest pain": ("chest pain", "Chest Pain"),
        "stomach pain": ("abdominal pain", "Abdominal Pain"),
        "abdominal": ("abdominal pain", "Abdominal Pain"),
        "pain": ("pain", "Pain"),
        "cough": ("cough", "Cough"),
        "breathing": ("dyspnoea", "Dyspnoea"),
        "breathless": ("dyspnoea", "Dyspnoea"),
        "palpitation": ("palpitations", "Palpitations"),
        "muscle": ("myalgia", "Myalgia"),
        "myalgia": ("myalgia", "Myalgia"),
        "insomnia": ("insomnia", "Insomnia"),
        "anxiety": ("anxiety", "Anxiety"),
        "depression": ("depression", "Depression"),
        "tremor": ("tremor", "Tremor"),
        "seizure": ("seizure", "Seizure"),
        "fever": ("pyrexia", "Pyrexia"),
        "jaundice": ("jaundice", "Jaundice"),
        "vision": ("blurred vision", "Vision Blurred"),
        "hair loss": ("alopecia", "Alopecia"),
        "high blood pressure": ("hypertension", "Hypertension"),
        "low blood sugar": ("hypoglycaemia", "Hypoglycaemia"),
        "hypoglycemia": ("hypoglycaemia", "Hypoglycaemia"),
        "trouble swallowing": ("dysphagia", "Dysphagia"),
    }
    time_map = {
        "last week": "1 week", "yesterday": "1 day", "3 months": "3 months",
        "today": "same day", "hour": "hours", "started": "after starting",
        "after taking": "shortly after", "few days": "a few days",
        "immediately": "immediately", "minutes": "within minutes",
    }
    
    for key, val in drug_map.items():
        if key in text_lower:
            drug = val
            break
    
    for key, (ev, med) in event_map.items():
        if key in text_lower:
            event = ev
            meddra = med
            break
    
    for key, val in time_map.items():
        if key in text_lower:
            time_onset = val
            break
    
    extracted = {
        "suspect_drug": drug,
        "concomitant_drugs": concomitant,
        "adverse_event": event,
        "meddra_term": meddra,
        "time_to_onset": time_onset
    }
    
    # Run WHO-UMC
    umc_result = who_umc_causality(extracted)
    
    pubmed_drug = drug.replace(" ", "+")
    pubmed_event = meddra.replace(" ", "+")
    
    return {
        "raw_text": raw_text,
        "clean_text": raw_text,  # PII masking happens in crawler, not here
        "extracted_data": extracted,
        "extraction_attempts": 1,
        "critic_feedback": "PASS",
        "doctor_verdict": {
            "causality_score": umc_result["category"],
            "confidence_score": f"{umc_result['score']}%",
            "reasoning": f"Mock assessment: {'; '.join(umc_result['factors'][:2])}",
            "pubmed_search_link": f"https://pubmed.ncbi.nlm.nih.gov/?term={pubmed_drug}+{pubmed_event}",
            "who_umc_details": umc_result,
            "severity": _determine_severity(event, umc_result["category"])
        }
    }


# ============================================================
# LANGGRAPH PIPELINE NODES (With try-except wrapping)
# ============================================================

# --- NODE 0: The Translator (Using Actual Bhashini API) ---
def translation_node(state: GraphState):
    print("[TRANSLATION] Calling Bhashini API for regional text translation...")
    
    try:
        bhashini_url = os.getenv('BHASHINI_ENDPOINT_URL')
        bhashini_key = os.getenv('BHASHINI_API_KEY')

        # Fallback if keys are not set in .env
        if not bhashini_url or not bhashini_key:
            print("   [TRANSLATION] Bhashini API config missing in .env. Passing raw text through.")
            return {"raw_text": state['raw_text']}

        headers = {
            "Authorization": f"Bearer {bhashini_key}",
            "Content-Type": "application/json"
        }
        
        # Standard payload structure for Bhashini
        payload = {
            "input": [{"source": state['raw_text']}],
            "config": {
                "language": {"sourceLanguage": "hi", "targetLanguage": "en"}
            }
        }
        
        response = requests.post(bhashini_url, json=payload, headers=headers, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            try:
                # Parse the English translated text based on standard Bhashini response structure
                english_text = result['pipelineResponse'][0]['output'][0]['target']
            except (KeyError, IndexError):
                print("   [TRANSLATION] Bhashini response structure unexpected. Falling back.")
                return {"raw_text": state['raw_text']}

            print(f"   [BHARAT-CONTEXT] Bhashini Translation applied. Output: {english_text[:50]}...")
            return {"raw_text": english_text}
        else:
            raise ValueError(f"Bhashini API returned HTTP status {response.status_code}")
            
    except Exception as e:
        print(f"   [TRANSLATION] Bhashini API failed ({e}). Falling back strictly to original text.")
        return {"raw_text": state['raw_text']}


# --- NODE 1: The Guard (Surgical Masking) ---
def guard_node(state: GraphState):
    print("[GUARD] Masking PII (Protecting Medical Terms)...")
    
    if not LLM_AVAILABLE:
        print("[GUARD] LLM unavailable. Passing raw text through.")
        return {"clean_text": state['raw_text'], "extraction_attempts": 0, "critic_feedback": ""}
    
    try:
        # Simple, neutral prompt that won't trigger llama3.2:1b safety refusals
        prompt = f"""Copy the following text exactly. If it contains any person's real name, replace it with [NAME]. Keep all drug names, symptoms, and medical terms unchanged. Output only the modified text, nothing else.

Text: {state['raw_text']}"""
        # Direct LLM call — no timeout wrapping
        response = fast_local_llm.invoke([HumanMessage(content=prompt)])
        result = response.content.strip()
        # Safety check: if the model refused (common refusal phrases), fall back to raw text
        refusal_phrases = ["i can't assist", "i cannot assist", "i'm unable", "i am unable",
                           "i can't help", "i cannot help", "i don't", "i won't"]
        if any(p in result.lower()[:80] for p in refusal_phrases):
            print("   [GUARD] LLM returned a refusal. Using raw text instead.")
            return {"clean_text": state['raw_text'], "extraction_attempts": 0, "critic_feedback": ""}
        print("[GUARD] PII masking complete.")
        return {"clean_text": result, "extraction_attempts": 0, "critic_feedback": ""}
    except Exception as e:
        print(f"   [GUARD] LLM failed ({e}). Passing raw text through.")
        return {"clean_text": state['raw_text'], "extraction_attempts": 0, "critic_feedback": ""}


# --- NODE 2A: The Generator (Extraction + MedDRA) ---
def generator_node(state: GraphState):
    print(f"[GENERATOR] Attempt {state['extraction_attempts'] + 1}: Extracting & Standardizing Data...")
    
    if not LLM_AVAILABLE:
        print("[GENERATOR] LLM unavailable. Using mock extraction.")
        mock = _generate_mock_result(state['raw_text'])
        return {
            "extracted_data": mock["extracted_data"],
            "extraction_attempts": state['extraction_attempts'] + 1
        }
    
    try:
        system_instr = """
You are a clinical data extractor. Extract information from the patient report and output ONLY valid JSON.

CRITICAL RULES:
- suspect_drug: the PRIMARY drug most likely causing the adverse event (plain string)
- concomitant_drugs: ALL OTHER drugs mentioned in the text as a JSON array of strings — THIS IS MANDATORY.
  Example: if text says 'taking warfarin and also aspirin', output: "concomitant_drugs": ["aspirin"]
  Example: if text says 'ibuprofen and paracetamol both', the suspect is ibuprofen, concomitant is ["paracetamol"]
  If no other drugs are mentioned, use empty array []
- adverse_event: what the patient reported in their own words (plain string)
- meddra_term: the MedDRA standardized medical term (e.g., "Gastrointestinal Bleeding", "Renal Failure", "Angioedema")
- time_to_onset: time from drug start to adverse event (e.g., "3 days", "1 week", "same day")

Output format (JSON only, no markdown, no explanations):
{"suspect_drug": "string", "concomitant_drugs": ["other_drug_1"], "adverse_event": "string", "meddra_term": "string", "time_to_onset": "string"}
"""
        
        feedback_block = ""
        if state['extraction_attempts'] > 0 and state['critic_feedback'] != "PASS":
            print("   [GENERATOR] Activating Failure Memory: Forcing correction...")
            feedback_block = f"CORRECTION NEEDED: {state['critic_feedback']}. Fix the issue and output only valid flat JSON."
        
        full_prompt = f"{system_instr}\n\nPatient Report: {state['clean_text']}\n\n{feedback_block}\n\nJSON output:"
        
        # Direct LLM call — no timeout wrapping
        response = json_local_llm.invoke([HumanMessage(content=full_prompt)])
        
        try:
            raw = response.content if isinstance(response.content, str) else str(response.content)
            # Strip markdown code fences if present
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            data = json.loads(raw)
            # CRITICAL: flatten any nested objects to strings
            for key in ["suspect_drug", "adverse_event", "meddra_term", "time_to_onset"]:
                if key in data and isinstance(data[key], dict):
                    # Extract the most useful string value from nested dict
                    val = data[key]
                    data[key] = val.get("title") or val.get("term") or val.get("name") or str(next(iter(val.values()), "Unknown"))
            if "concomitant_drugs" in data and not isinstance(data["concomitant_drugs"], list):
                data["concomitant_drugs"] = []
            
            # ── Deterministic concomitant drug fixer ────────────────
            # If LLM returned empty concomitant list, scan text for known drug patterns
            if isinstance(data.get("concomitant_drugs"), list) and len(data["concomitant_drugs"]) == 0:
                import re
                text_lower = state['clean_text'].lower()
                suspect = str(data.get('suspect_drug', '')).lower()
                # Common drug name patterns — any found (excluding suspect) become concomitants
                drug_patterns = [
                    r'\b(aspirin|warfarin|ibuprofen|paracetamol|metformin|lisinopril|atorvastatin|'
                    r'omeprazole|amlodipine|metoprolol|amoxicillin|clopidogrel|losartan|'
                    r'atenolol|diclofenac|naproxen|pantoprazole|cetirizine|azithromycin|'
                    r'ciprofloxacin|doxycycline|prednisone|prednisolone|insulin|glipizide|'
                    r'simvastatin|rosuvastatin|ramipril|enalapril|furosemide|spironolactone|'
                    r'digoxin|phenytoin|carbamazepine|valproate|levothyroxine|tamoxifen)\b'
                ]
                found_drugs = []
                for pattern in drug_patterns:
                    matches = re.findall(pattern, text_lower)
                    for m in matches:
                        if m != suspect and m not in found_drugs:
                            found_drugs.append(m)
                if found_drugs:
                    data["concomitant_drugs"] = found_drugs
                    print(f"   [GENERATOR] Regex fallback found concomitant drugs: {found_drugs}")
            # ── End deterministic fixer ──────────────────────────────
        except Exception:
            # JSON parse failed — fall back to mock
            data = None
        
        if data and data.get("suspect_drug") and data["suspect_drug"] not in ("", "Unknown", "string"):
            print(f"[GENERATOR] Extraction complete: {data.get('suspect_drug', 'Unknown')} -> {data.get('meddra_term', 'Unknown')}")
            return {
                "extracted_data": data,
                "extraction_attempts": state['extraction_attempts'] + 1
            }
        else:
            print("[GENERATOR] LLM returned empty/invalid data. Using keyword extraction.")
            mock = _generate_mock_result(state['raw_text'])
            return {
                "extracted_data": mock["extracted_data"],
                "extraction_attempts": state['extraction_attempts'] + 1
            }
    except Exception as e:
        print(f"   [GENERATOR] LLM failed ({e}). Using mock extraction.")
        mock = _generate_mock_result(state['raw_text'])
        return {
            "extracted_data": mock["extracted_data"],
            "extraction_attempts": state['extraction_attempts'] + 1
        }


# --- NODE 2B: The Critic (Verification) ---
def critic_node(state: GraphState):
    print("[CRITIC] Verifying extracted data...")
    
    if not LLM_AVAILABLE:
        print("[CRITIC] LLM unavailable. Auto-approving.")
        return {"critic_feedback": "PASS"}
    
    try:
        prompt = f"""
        ROLE: Lead Pharmacovigilance QA Auditor.
        Original Text: {state['clean_text']}
        Extracted JSON: {state['extracted_data']}

        EVALUATION RUBRIC:
        1. Omission Check: Did the JSON miss any symptoms mentioned in the text?
        2. MedDRA Check: Does the 'meddra_term' sound like a professional medical term?
        3. Time-to-onset Check: Is the time_to_onset field populated with a reasonable value?
        4. Drug Check: Is the suspect_drug correctly identified?
        
        OUTPUT:
        - If perfect, output: PASS
        - If failed, output: FAIL | [Exact reason]
        """
        
        # Direct LLM call — no timeout wrapping
        response = fast_local_llm.invoke([SystemMessage(content=prompt)])
        result = response.content.strip()
        
        if "PASS" in result.upper()[:10]:
            print("[CRITIC] Approved!")
            return {"critic_feedback": "PASS"}
        else:
            print(f"[CRITIC] Rejected: {result}")
            return {"critic_feedback": result}
    except Exception as e:
        print(f"   [CRITIC] LLM failed ({e}). Auto-approving.")
        return {"critic_feedback": "PASS"}


# --- NODE 3: The Doctor (Explainability & WHO-UMC Causality) ---
def doctor_node(state: GraphState):
    print("[DOCTOR] Assessing Causality & Explainability...")
    
    data = state.get('extracted_data', {})
    
    # === DETERMINISTIC WHO-UMC SCORING (Always runs) ===
    umc_result = who_umc_causality(data)
    print(f"   [DOCTOR] WHO-UMC (Rule-Based): {umc_result['category']} (Score: {umc_result['score']})")
    for factor in umc_result['factors']:
        print(f"      - {factor}")
    
    # Safely extract values for PubMed link
    def get_string_value(val):
        if isinstance(val, dict):
            return str(next(iter(val.values()), "Unknown"))
        return str(val)
    
    raw_drug = get_string_value(data.get('suspect_drug', 'Unknown'))
    raw_event = get_string_value(data.get('meddra_term') or data.get('adverse_event') or 'Unknown')
    
    drug = raw_drug.replace(" ", "+")
    event = raw_event.replace(" ", "+")
    pubmed_url = f"https://pubmed.ncbi.nlm.nih.gov/?term={drug}+{event}"
    
    # Determine severity for webhook alerting
    severity = _determine_severity(raw_event, umc_result["category"])
    
    # === LLM-BASED ASSESSMENT (If available) ===
    if LLM_AVAILABLE:
        try:
            from langchain_core.output_parsers import JsonOutputParser
            parser = JsonOutputParser(pydantic_object=DoctorVerdict)
            
            prompt = f"""You are a drug safety physician. Output ONLY valid JSON with these exact fields:

causality_score: one of Certain, Probable, Possible, Unlikely, or Unassessable
confidence_score: a percentage string like "85%"
reasoning: one sentence explaining your decision
pubmed_search_link: {pubmed_url}
alternative_cause_likely: boolean (true or false)
ddi_risk_level: one of High, Low, or None
interaction_reasoning: string explaining the interaction or ruling it out

DIFFERENTIAL DIAGNOSIS PROTOCOL:
Look at the suspect_drug and concomitant_drugs.
1. Analyze if a concomitant drug is the actual cause of the adverse event.
2. Analyze if the combination triggers a known Drug-Drug Interaction (DDI) causing the event.
3. If no known link, explicitly rule it out in interaction_reasoning.

Data to assess:
- Suspect Drug: {raw_drug}
- Concomitant Drugs: {data.get('concomitant_drugs', [])}
- Adverse Event: {raw_event}
- Rule-based WHO-UMC: {umc_result['category']} (score {umc_result['score']}/100)
- Factors: {'; '.join(umc_result['factors'])}

Output format (JSON only, no markdown):
{{"causality_score": "string", "confidence_score": "string", "reasoning": "string", "pubmed_search_link": "string", "alternative_cause_likely": false, "ddi_risk_level": "string", "interaction_reasoning": "string"}}

JSON output:"""
            
            # Direct LLM call — no timeout wrapping
            response = json_local_llm.invoke([SystemMessage(content=prompt)])
            
            try:
                verdict = json.loads(response.content) if isinstance(response.content, str) else response.content
            except Exception:
                verdict = {
                    "causality_score": umc_result["category"],
                    "confidence_score": f"{umc_result['score']}%",
                    "reasoning": f"Rule-based assessment: {'; '.join(umc_result['factors'][:2])}",
                    "pubmed_search_link": pubmed_url,
                    "alternative_cause_likely": False,
                    "ddi_risk_level": "None",
                    "interaction_reasoning": "LLM parse failed: No DDI analysis available."
                }
            
            # Enrich with WHO-UMC details and severity
            verdict["who_umc_details"] = umc_result
            verdict["severity"] = severity
            
            print(f"[DOCTOR] LLM verdict: {verdict.get('causality_score', 'N/A')}")
            return {"doctor_verdict": verdict}
        
        except Exception as e:
            print(f"   [DOCTOR] LLM failed ({e}). Using rule-based assessment only.")
    
    # Fallback: Rule-based only verdict
    verdict = {
        "causality_score": umc_result["category"],
        "confidence_score": f"{umc_result['score']}%",
        "reasoning": f"Rule-based WHO-UMC assessment: {'; '.join(umc_result['factors'])}",
        "pubmed_search_link": pubmed_url,
        "who_umc_details": umc_result,
        "severity": severity,
        "alternative_cause_likely": False,
        "ddi_risk_level": "None",
        "interaction_reasoning": "Rule-based: No DDI analysis available."
    }
    
    print(f"[DOCTOR] Rule-based verdict: {verdict['causality_score']}")
    return {"doctor_verdict": verdict}


# --- CONDITIONAL ROUTING ---
def verify_router(state: GraphState):
    if state['critic_feedback'] == "PASS":
        return "doctor"
    elif state['extraction_attempts'] >= 3:
        print("⚠️ Max attempts reached. Forcing final assessment to ensure pipeline stability.")
        return "doctor"
    else:
        return "generator"


# ============================================================
# BUILD THE GRAPH
# ============================================================
try:
    workflow = StateGraph(GraphState)

    workflow.add_node("translation", translation_node)
    workflow.add_node("guard", guard_node)
    workflow.add_node("generator", generator_node)
    workflow.add_node("critic", critic_node)
    workflow.add_node("doctor", doctor_node)

    workflow.set_entry_point("translation")
    
    workflow.add_edge("translation", "guard")
    workflow.add_edge("guard", "generator")
    workflow.add_edge("generator", "critic")

    workflow.add_conditional_edges(
        "critic",
        verify_router,
        {
            "doctor": "doctor",
            "generator": "generator"
        }
    )

    workflow.add_edge("doctor", END)

    ayu_scout_ai = workflow.compile()
    print("[AI-ENGINE] LangGraph pipeline compiled successfully with Translation layer")
except Exception as e:
    print(f"[AI-ENGINE] LangGraph compilation failed ({e}). Using mock pipeline.")
    
    # Mock pipeline that simulates the graph
    class MockPipeline:
        def invoke(self, state):
            print("\n[MOCK-PIPELINE] Running Mock AI Pipeline (Ollama/LangGraph unavailable)...")
            result = _generate_mock_result(state.get('raw_text', ''))
            return result
    
    ayu_scout_ai = MockPipeline()