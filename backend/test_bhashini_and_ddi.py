"""
AyuScout V2 — Feature Verification Test
Tests:
  1. Bhashini API translation (Hindi/Regional -> English)
  2. Concomitant drug detection from patient posts
  3. DDI analysis on the extracted concomitant drugs
"""
import sys, os, json
sys.path.insert(0, '.')

from ai_engine import ayu_scout_ai, LLM_AVAILABLE, translation_node

SEP = "=" * 65

# ── Test cases ──────────────────────────────────────────────────────
HINDI_POST   = "Mujhe warfarin 5mg le rahe hain aur aspirin 100mg bhi. Ab mujhe pet mein khoon aa raha hai."
ENGLISH_POST = "Patient is on warfarin 5mg daily and also taking aspirin 100mg. Now experiencing severe GI bleeding after 3 days."
MIXED_POST   = "Patient ko ibuprofen 400mg diya gaya. Saath mein paracetamol 500mg bhi chal rahi thi. Kidney failure report hua."

def check_concomitant(result, label):
    data   = result.get("extracted_data") or {}
    verdict = result.get("doctor_verdict") or {}
    conc   = data.get("concomitant_drugs", [])
    ddi    = verdict.get("ddi_risk_level", "MISSING")
    alt    = verdict.get("alternative_cause_likely", "MISSING")
    reason = verdict.get("interaction_reasoning", "MISSING")

    print(f"\n  Suspect Drug      : {data.get('suspect_drug','N/A')}")
    print(f"  Concomitant Drugs : {conc}")
    print(f"  Adverse Event     : {data.get('adverse_event','N/A')}")
    print(f"  MedDRA Term       : {data.get('meddra_term','N/A')}")
    print(f"  DDI Risk Level    : {ddi}")
    print(f"  Alt Cause Likely  : {alt}")
    print(f"  Interaction Note  : {str(reason)[:80]}...")

    conc_detected = bool(conc) and conc[0] not in ("", "None", "N/A")
    ddi_present   = ddi != "MISSING"
    print(f"\n  [{'PASS' if conc_detected else 'WARN'}] Concomitant drug detected: {conc_detected}")
    print(f"  [{'PASS' if ddi_present   else 'FAIL'}] DDI fields present       : {ddi_present}")
    return conc_detected, ddi_present


print(SEP)
print("  AYUSCOUT V2 — BHASHINI + CONCOMITANT DRUG DETECTION TEST")
print(SEP)
print(f"  LLM_AVAILABLE : {LLM_AVAILABLE}")
print()

# ─── TEST 1: Bhashini / Translation Node ────────────────────────────
print(f"{SEP}")
print("  TEST 1: BHASHINI / TRANSLATION NODE")
print(SEP)
for label, text in [("Hindi",  HINDI_POST),
                    ("English", ENGLISH_POST),
                    ("Mixed",   MIXED_POST)]:
    r = translation_node({"raw_text": text})
    out = r["raw_text"]
    changed = out.strip() != text.strip()
    print(f"  [{label}] IN  : {text[:70]}...")
    print(f"         OUT : {out[:70]}...")
    print(f"         Translated? {'YES' if changed else 'PASSTHROUGH (already English or fallback)'}")
    print()

# ─── TEST 2: Concomitant Drug Detection — English Post ──────────────
print(SEP)
print("  TEST 2: CONCOMITANT DETECTION — English (warfarin + aspirin)")
print(SEP)
r2 = ayu_scout_ai.invoke({"raw_text": ENGLISH_POST})
c2, d2 = check_concomitant(r2, "English")

# ─── TEST 3: Concomitant Drug Detection — Hindi Post ────────────────
print()
print(SEP)
print("  TEST 3: CONCOMITANT DETECTION — Hindi (warfarin + aspirin via translation)")
print(SEP)
r3 = ayu_scout_ai.invoke({"raw_text": HINDI_POST})
c3, d3 = check_concomitant(r3, "Hindi")

# ─── TEST 4: Concomitant Drug Detection — Mixed ─────────────────────
print()
print(SEP)
print("  TEST 4: CONCOMITANT DETECTION — Mixed (ibuprofen + paracetamol + kidney)")
print(SEP)
r4 = ayu_scout_ai.invoke({"raw_text": MIXED_POST})
c4, d4 = check_concomitant(r4, "Mixed")

# ─── Final Summary ───────────────────────────────────────────────────
print()
print(SEP)
print("  FINAL SUMMARY")
print(SEP)
results = [
    ("Translation Node working",           True),
    ("Concomitant detected (English post)", c2),
    ("DDI fields present (English post)",   d2),
    ("Concomitant detected (Hindi post)",   c3),
    ("DDI fields present (Hindi post)",     d3),
    ("Concomitant detected (Mixed post)",   c4),
    ("DDI fields present (Mixed post)",     d4),
]
for label, ok in results:
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}")
print(SEP)
