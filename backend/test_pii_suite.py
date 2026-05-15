"""
AyuScout V2 — PII Masking Engine Test Suite
=============================================
Tests all 6 required cases from the spec.
Run from: backend/ directory

Usage:
    python test_pii_suite.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import a fresh vault instance for each test to avoid counter bleed
from core.pii_vault import PIIVault

def run_test(n, raw_input, expected_fragment, should_contain=None, should_not_contain=None):
    """
    Run a single test case.
    - expected_fragment: a substring the output MUST contain
    - should_contain: list of substrings that must remain (medical terms)
    - should_not_contain: list of raw PII strings that must NOT appear
    """
    vault = PIIVault()
    masked, _ = vault.mask(raw_input, source=f"test_{n}")

    ok = True
    failures = []

    if expected_fragment and expected_fragment.lower() not in masked.lower():
        ok = False
        failures.append(f"  MISSING fragment: '{expected_fragment}'")

    for term in (should_contain or []):
        if term.lower() not in masked.lower():
            ok = False
            failures.append(f"  MASKED wrongly: '{term}' should be preserved")

    for pii in (should_not_contain or []):
        if pii.lower() in masked.lower():
            ok = False
            failures.append(f"  PII LEAKED: '{pii}' still present in output")

    status = "PASS" if ok else "FAIL"
    print(f"\n[TEST {n}] {status}")
    print(f"  INPUT:  {raw_input}")
    print(f"  OUTPUT: {masked}")
    if failures:
        for f in failures:
            print(f)
    return ok


results = []

# ─── Test 1 ──────────────────────────────────────────────────────────────────
results.append(run_test(
    n=1,
    raw_input="i am arpit and suffering from fever and taken paracetamol today",
    expected_fragment="[PERSON]",
    should_contain=["fever", "paracetamol"],
    should_not_contain=["arpit"]
))

# ─── Test 2 ──────────────────────────────────────────────────────────────────
results.append(run_test(
    n=2,
    raw_input="my name is rahul and i had vomiting after aspirin",
    expected_fragment="[PERSON]",
    should_contain=["vomiting", "aspirin"],
    should_not_contain=["rahul"]
))

# ─── Test 3 ──────────────────────────────────────────────────────────────────
results.append(run_test(
    n=3,
    raw_input="arpit from bangalore had fever after paracetamol",
    expected_fragment="[PERSON]",
    should_contain=["fever", "paracetamol"],
    should_not_contain=["arpit", "bangalore"]
))

# ─── Test 4 ──────────────────────────────────────────────────────────────────
results.append(run_test(
    n=4,
    raw_input="mai arpit hu aur mujhe fever hai",
    expected_fragment="[PERSON]",
    should_contain=["fever"],
    should_not_contain=["arpit"]
))

# ─── Test 5 ──────────────────────────────────────────────────────────────────
results.append(run_test(
    n=5,
    raw_input="my phone number is 9876543210 and i have chest pain",
    expected_fragment="[PHONE]",
    should_contain=["chest pain"],
    should_not_contain=["9876543210"]
))

# ─── Test 6 ──────────────────────────────────────────────────────────────────
results.append(run_test(
    n=6,
    raw_input="rahul's mother from delhi had dizziness",
    expected_fragment="[PERSON]",
    should_contain=["dizziness", "mother"],
    should_not_contain=["rahul", "delhi"]
))

# ─── Summary ─────────────────────────────────────────────────────────────────
passed = sum(results)
total  = len(results)
print(f"\n{'='*50}")
print(f"Results: {passed}/{total} tests PASSED")
if passed == total:
    print("ALL TESTS PASSED")
else:
    print(f"{total - passed} TESTS FAILED")
print('='*50)
