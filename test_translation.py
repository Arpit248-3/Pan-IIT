import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from ai_engine import ayu_scout_ai, LLM_AVAILABLE, translation_node

print(f"\n=== AI ENGINE TRANSLATION SMOKE TEST ===")
print(f"LLM_AVAILABLE = {LLM_AVAILABLE}\n")

# Test 1: Hindi text -> should translate to English
state_hindi = {"raw_text": "mujhe sir dard aur ulti ho rahi hai paracetamol lene ke baad"}
result1 = translation_node(state_hindi)
print(f"[TEST 1] Input  : {state_hindi['raw_text']}")
print(f"[TEST 1] Output : {result1['raw_text']}")
print()

# Test 2: English passthrough -> should return unchanged
state_en = {"raw_text": "Patient experienced severe headache after taking ibuprofen."}
result2 = translation_node(state_en)
print(f"[TEST 2] Input  : {state_en['raw_text']}")
print(f"[TEST 2] Output : {result2['raw_text']}")
print()

# Test 3: Full pipeline run
print("[TEST 3] Running full pipeline on English text...")
pipeline_result = ayu_scout_ai.invoke({"raw_text": "Patient took aspirin 500mg and developed severe stomach bleeding."})
print(f"[TEST 3] Pipeline returned keys: {list(pipeline_result.keys())}")
print(f"[TEST 3] Extracted data: {pipeline_result.get('extracted_data', 'N/A')}")
print("\n=== TESTS COMPLETE ===")
