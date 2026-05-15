"""E2E test suite for the PII-safe ingestion workflow."""
import sys, json, re
sys.stdout.reconfigure(encoding='utf-8')

from database import (
    save_intake, save_intelligence, get_all_intake, get_all_intelligence,
    get_notifications, create_notification, update_status,
    sanitize_pii_for_display, _detect_pii_types
)
from core.pii_vault import PIIVault

print('=== TEST SUITE: Full E2E PII-Safe Workflow ===\n')

# T1: PIIVault masking
v = PIIVault()
text = 'My name is Rahul Sharma. I live at 45 MG Road Bangalore. My phone is 9876543210 and email is rahul@gmail.com. I took amoxicillin yesterday and now I have rash and swelling.'
masked, vault = v.mask(text, source='e2e-test')
assert 'Rahul Sharma' not in masked
assert '9876543210' not in masked
assert 'rahul@gmail.com' not in masked
assert 'amoxicillin' in masked
assert 'rash' in masked
print('T1 PASS: PII masked, medical terms preserved')
print(f'   Masked: {masked[:120]}')

# T2: save_intake
iid = save_intake(masked, 'Test', 'amoxicillin', json.dumps(vault))
assert isinstance(iid, int) and iid > 0
print(f'\nT2 PASS: save_intake id={iid}')

# T3: save_intelligence
mock_result = {
    'extracted_data': json.dumps({
        'suspect_drug': 'Amoxicillin',
        'adverse_event': 'Rash and Swelling',
        'meddra_term': 'Angioedema',
        'concomitant_drugs': [],
        'time_to_onset': '1 hour',
        'sentiment': 'Negative'
    }),
    'doctor_verdict': json.dumps({
        'causality_score': 'Probable',
        'confidence_score': '85%',
        'severity': 'High',
        'reasoning': 'Amoxicillin-induced allergic reaction with rash and swelling.',
        'pubmed_search_link': 'https://pubmed.ncbi.nlm.nih.gov/?term=amoxicillin+angioedema',
        'who_umc_details': {'score': 6, 'factors': ['Plausible time to onset', 'Known reaction type']},
        'ddi_risk_level': 'Low',
        'alternative_cause_likely': False
    }),
    'raw_text': masked
}
intel_id = save_intelligence(iid, mock_result)
assert isinstance(intel_id, int) and intel_id > 0
print(f'\nT3 PASS: save_intelligence id={intel_id}')

# T4: update_status
update_status(iid, 'analyzed')
print('\nT4 PASS: update_status(analyzed)')

# T5: get_all_intelligence includes emotion
records = get_all_intelligence()
latest = next((r for r in records if r['id'] == intel_id), None)
assert latest is not None, 'Intelligence record not found!'
drug = latest.get('drug', '')
event = latest.get('event', '')
sentiment = latest.get('sentiment', '')
emotion = latest.get('emotion', '')
assert drug not in ('', None)
assert event not in ('', None)
assert sentiment not in ('Unknown', '', None), f'Sentiment is still Unknown! got: {sentiment}'
assert 'emotion' in latest, 'emotion key missing from intelligence!'
print(f'\nT5 PASS: intelligence drug={drug}, event={event}, sentiment={sentiment}, emotion={emotion}')

# T6: get_all_intake - full join fields
intake_rows = get_all_intake()
row = next((r for r in intake_rows if r['id'] == iid), None)
assert row is not None, 'Intake row not found!'
assert row['pii_masked'] == True, 'pii_masked should be True!'
assert row['status'] == 'analyzed', f'status should be analyzed, got: {row["status"]}'
assert 'pii_map' not in row, 'pii_map MUST NOT be returned!'
assert 'intelligence_id' in row
assert row.get('intelligence_id') == intel_id
assert 'emotion' in row
assert row.get('sentiment') not in ('Unknown', None, ''), f'sentiment should not be Unknown, got: {row.get("sentiment")}'
print(f'\nT6 PASS: intake row:')
print(f'   status={row["status"]}, pii_masked={row["pii_masked"]}')
print(f'   sentiment={row.get("sentiment")}, emotion={row.get("emotion")}')
print(f'   intelligence_id={row.get("intelligence_id")}, e2b_available={row.get("e2b_available")}')
print(f'   pii_types={row.get("pii_types_detected")}')

# T7: create_notification + get_notifications
notif = create_notification(
    title='New protected safety signal: Amoxicillin - Angioedema',
    desc='Severity: High | WHO-UMC: Probable | PII Protected by PIIVault',
    icon='warning', type='signal', category='Signal', priority='high'
)
assert notif is not None
notif_id = notif['id']
notifs = get_notifications()
found = next((n for n in notifs if n['id'] == notif_id), None)
assert found is not None, 'Notification not found in DB!'
assert found['unread'] == True
assert found['type'] == 'signal'
assert 'Amoxicillin' in found['title']
assert 'pii_map' not in found
print(f'\nT7 PASS: notification id={notif_id}, unread={found["unread"]}, title={found["title"][:50]}')

# T8: Zero raw PII in any API response
all_data = str(records) + str(intake_rows) + str(notifs)
pii_terms = ['Rahul Sharma', '9876543210', 'rahul@gmail.com', '45 MG Road']
for pii_term in pii_terms:
    assert pii_term not in all_data, f'RAW PII LEAKED: {pii_term}'
print('\nT8 PASS: Zero raw PII in intelligence/intake/notifications responses')

print('\n' + '='*50)
print('ALL E2E TESTS PASSED')
print('='*50)
