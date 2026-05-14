"""
Test the DDI (Drug-Drug Interaction) changes committed by user:
1. DoctorVerdict schema has 3 new fields
2. doctor_node returns those fields
3. Mock pipeline returns those fields
"""
import sys
sys.path.insert(0, '.')

from ai_engine import ayu_scout_ai, LLM_AVAILABLE

REQUIRED_DDI_FIELDS = ["alternative_cause_likely", "ddi_risk_level", "interaction_reasoning"]

print("=" * 60)
print("   DDI INTEGRATION TEST")
print("=" * 60)
print(f"LLM_AVAILABLE : {LLM_AVAILABLE}\n")

# Test 1: Single drug — no concomitants
print("[TEST 1] Single drug, no concomitants")
r1 = ayu_scout_ai.invoke({"raw_text": "Patient took aspirin 500mg and developed GI bleeding after 2 hours."})
verdict1 = r1.get("doctor_verdict", {})
for field in REQUIRED_DDI_FIELDS:
    val = verdict1.get(field, "MISSING")
    status = "PASS" if val != "MISSING" else "FAIL"
    print(f"  [{status}] {field} = {repr(str(val)[:60])}")

# Test 2: Multiple drugs — DDI scenario
print()
print("[TEST 2] Suspect + concomitant drug (DDI scenario)")
r2 = ayu_scout_ai.invoke({"raw_text": "Patient on warfarin 5mg and started aspirin 100mg. Now showing severe GI bleed after 3 days."})
verdict2 = r2.get("doctor_verdict", {})
for field in REQUIRED_DDI_FIELDS:
    val = verdict2.get(field, "MISSING")
    status = "PASS" if val != "MISSING" else "FAIL"
    print(f"  [{status}] {field} = {repr(str(val)[:60])}")

# Final summary
all_present = all(
    r.get("doctor_verdict", {}).get(f) is not None
    for r in [r1, r2]
    for f in REQUIRED_DDI_FIELDS
)
print()
print("=" * 60)
print(f"  RESULT: {'ALL DDI FIELDS PRESENT' if all_present else 'SOME FIELDS MISSING'}")
print("=" * 60)
