import sys
sys.path.insert(0, '.')

from ai_engine import translation_node, LLM_AVAILABLE

SEP = "=" * 55
print(SEP)
print("   TRANSLATOR NODE TEST")
print(SEP)
print(f"LLM_AVAILABLE : {LLM_AVAILABLE}")
print()

cases = [
    ("Hindi text",    "mujhe sir dard ho raha hai aur ulti aa rahi hai"),
    ("English text",  "Patient developed stomach bleeding after ibuprofen"),
    ("Mixed text",    "Patient ko 500mg aspirin diya gaya aur bleeding hui"),
    ("Empty string",  ""),
]

all_passed = True
for label, text in cases:
    r = translation_node({"raw_text": text})
    out = r.get("raw_text", None)
    status = "PASS" if isinstance(out, str) else "FAIL"
    if status == "FAIL":
        all_passed = False
    display_in  = repr(text[:60]) if text else "(empty)"
    display_out = repr(out[:60])  if out  else "(empty)"
    print(f"[{status}] {label}")
    print(f"  IN  : {display_in}")
    print(f"  OUT : {display_out}")
    print()

print(SEP)
print("  RESULT:", "ALL TESTS PASSED" if all_passed else "SOME TESTS FAILED")
print(SEP)
