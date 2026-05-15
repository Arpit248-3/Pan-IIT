"""
Fix script: replaces the emoji-laden Step 6 notification block in server.py
with a clean ASCII-safe, DB-backed notification call.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the block boundaries by the Step 6 comment
step6_start = content.find('\u2500\u2500 Step 6: Create notification')
if step6_start == -1:
    step6_start = content.find('-- Step 6: Create notification')
if step6_start == -1:
    print('ERROR: Could not find Step 6 notification block.')
    exit(1)

# Back up to find the # at start of comment line
while step6_start > 0 and content[step6_start-1] != '\n':
    step6_start -= 1

# Find the end of the except block
end_marker = '[NOTIFY] Notification skipped: {e}")'
step6_end = content.find(end_marker, step6_start)
if step6_end == -1:
    print('ERROR: Could not find end marker.')
    exit(1)
step6_end += len(end_marker)

print(f'Found block: chars {step6_start} to {step6_end}')
print('Replacing...')

new_block = '''    # -- Step 6: Create DB-backed notification --
    sev = doctor_verdict.get("severity", "Unknown")
    drug_name = (extracted_json.get("suspect_drug") or "Unknown Drug") if isinstance(extracted_json, dict) else "Unknown Drug"
    event_name = (extracted_json.get("meddra_term") or extracted_json.get("adverse_event") or "Adverse Event") if isinstance(extracted_json, dict) else "Adverse Event"
    try:
        _icon  = "critical" if sev == "Critical" else "warning" if sev == "High" else "info"
        _type  = "signal"   if sev in ("Critical", "High") else "info"
        _prio  = "critical" if sev == "Critical" else "high" if sev == "High" else "normal"
        notif = create_notification(
            title=f"New protected safety signal: {drug_name} - {event_name}",
            desc=f"Severity: {sev} | Causality: {doctor_verdict.get('causality_score','Unknown')} | PII Protected by PIIVault",
            icon=_icon, type=_type, category="Signal", priority=_prio
        )
        if notif:
            print(f"[NOTIFICATION] Created protected signal notification: id={notif.get('id')}")
    except Exception as e:
        print(f"   [NOTIFY] Notification skipped: {e}")'''

new_content = content[:step6_start] + new_block + content[step6_end:]

with open('server.py', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('SUCCESS: Step 6 notification block replaced.')

import py_compile
try:
    py_compile.compile('server.py', doraise=True)
    print('SYNTAX OK: server.py compiles cleanly.')
except py_compile.PyCompileError as e:
    print(f'SYNTAX ERROR: {e}')
