"""
Fix script: 
1. Fix all remaining emoji print statements in database.py (settings, notification, audit, project failures)
2. Add emotion derivation to save_intelligence()
3. Enrich get_all_intelligence() to return emotion field
4. Enrich get_all_signals() to return emotion field
"""
import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open('database.py', 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Original file: {len(content)} chars")

# ── Fix 1: All remaining emoji print statements ──────────────────────────────
# Replace pattern: print(f"   <emoji> <message>") with ASCII version
emoji_fixes = [
    # Settings upsert failed
    ('print(f"   \u274c Settings upsert failed: {e}")', 'print(f"   [DB-ERROR] Settings upsert failed: {e}")'),
    # Notification create failed
    ('print(f"   \u274c Notification create failed: {e}")', 'print(f"   [DB-ERROR] Notification create failed: {e}")'),
    # Audit log skipped
    ('print(f"   \u26a0\ufe0f Audit log skipped: {e}")', 'print(f"   [WARN] Audit log skipped: {e}")'),
    # Project create failed
    ('print(f"   \u274c Project create failed: {e}")', 'print(f"   [DB-ERROR] Project create failed: {e}")'),
    # Status update failed
    ('print(f"   \u274c Status update failed: {e}")', 'print(f"   [DB-ERROR] Status update failed: {e}")'),
    # Admin seed skipped
    ('print(f"\u26a0\ufe0f Admin seed skipped: {e}")', 'print(f"[WARN] Admin seed skipped: {e}")'),
    ('print("Database initialized (SQLAlchemy ORM)")', 'print("[DB] Database initialized (SQLAlchemy ORM)")'),
    ('print("Admin user seeded: admin@ayuscout.ai / Admin@123")', 'print("[DB] Admin user seeded: admin@ayuscout.ai / Admin@123")'),
]
for old, new in emoji_fixes:
    if old in content:
        content = content.replace(old, new)
        print(f"  Fixed: {old[:60]}")
    else:
        print(f"  [skip] not found: {old[:60]}")

# ── Fix 2: Add emotion derivation to save_intelligence() ────────────────────
# Insert after the sentiment derivation block, before saving to database
emotion_anchor = '        # WHO-UMC details\n'
if emotion_anchor in content:
    emotion_code = '''        # --- EMOTION DERIVATION ---
        # Derive emotion from event/sentiment keywords; store as prefix in reasoning
        _ev_lower = (event or '').lower()
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
        # Prefix emotion into reasoning so it can be extracted later
        if emotion and not reasoning.startswith('[Emotion:'):
            reasoning = f'[Emotion: {emotion}] {reasoning}'

'''
    content = content.replace(emotion_anchor, emotion_code + emotion_anchor, 1)
    print("  Added emotion derivation to save_intelligence()")
else:
    print("  [WARN] Could not find WHO-UMC details anchor")

# ── Fix 3: Add emotion to get_all_intelligence() return dict ─────────────────
# Find the reasoning line in get_all_intelligence and add emotion after it
old_intel_reasoning = '''                "reasoning": sanitize_pii_for_display(r.reasoning or ""),'''
new_intel_reasoning = '''                "reasoning": sanitize_pii_for_display(r.reasoning or ""),
                "emotion": (lambda raw: re.match(r'^\\[Emotion:\\s*([^\\]]+)\\]', raw).group(1).strip() if re.match(r'^\\[Emotion:\\s*([^\\]]+)\\]', raw) else '')(r.reasoning or ''),'''
if old_intel_reasoning in content:
    content = content.replace(old_intel_reasoning, new_intel_reasoning, 1)
    print("  Added emotion to get_all_intelligence()")
else:
    print("  [WARN] Could not find reasoning line in get_all_intelligence()")

# ── Fix 4: Add emotion to get_all_intake() return dict ───────────────────────
old_intake_evt = '                "has_analysis": intel is not None,'
new_intake_evt = '''                "has_analysis": intel is not None,
                "emotion": (lambda raw: re.match(r'^\\[Emotion:\\s*([^\\]]+)\\]', raw).group(1).strip() if intel and raw and re.match(r'^\\[Emotion:\\s*([^\\]]+)\\]', raw) else '')(intel.reasoning if intel else ''),'''
if old_intake_evt in content and '# Intelligence join fields' in content:
    # Only replace the first occurrence (inside get_all_intake)
    idx = content.find('# Intelligence join fields')
    idx2 = content.find(old_intake_evt, idx)
    if idx2 != -1:
        content = content[:idx2] + new_intake_evt + content[idx2+len(old_intake_evt):]
        print("  Added emotion to get_all_intake()")
    else:
        print("  [WARN] Could not find has_analysis in get_all_intake() scope")
else:
    print("  [WARN] Could not locate get_all_intake() emotion anchor")

# ── Fix 5: Also remove leftover emoji from database init prints ──────────────
# Use regex to catch any remaining emoji-heavy chars in print statements
def ascii_print_fixer(m):
    txt = m.group(0)
    # Replace common emoji used in this file
    replacements = [
        ('\u2705', ''),  # checkmark
        ('\u274c', ''),  # X
        ('\u26a0\ufe0f', ''),  # warning
        ('\U0001f4be', ''),  # floppy disk
        ('\U0001f4ca', ''),  # bar chart
        ('\U0001f9e0', ''),  # brain
        ('\U0001f517', ''),  # link
        ('\U0001f4a0', ''),  # diamond
        ('\U0001f680', ''),  # rocket
    ]
    for e, r in replacements:
        txt = txt.replace(e, r)
    return txt

content = re.sub(r'print\([^)]*\)', ascii_print_fixer, content)
print("  Applied emoji cleanup pass to all print() calls")

with open('database.py', 'w', encoding='utf-8') as f:
    f.write(content)
print(f"\nSaved database.py: {len(content)} chars")

import py_compile
try:
    py_compile.compile('database.py', doraise=True)
    print('SYNTAX OK: database.py compiles cleanly.')
except py_compile.PyCompileError as e:
    print(f'SYNTAX ERROR: {e}')
