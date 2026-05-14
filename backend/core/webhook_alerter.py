"""
AyuScout V2 — Automated Webhook Alerter (Command Center)
=========================================================
Triggers mock webhook alerts when adverse events are flagged
with High Confidence + High/Critical Severity.

Simulates Slack/Email payloads by writing to alerts.log.
Can be connected to real Slack/Email webhooks in production.
"""

import os
import json
from datetime import datetime


ALERT_LOG_PATH = os.getenv("ALERT_LOG_PATH", "./alerts.log")
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "https://hooks.slack.com/services/PLACEHOLDER")

# Severity levels that trigger urgent alerts
URGENT_SEVERITIES = {"Critical", "High"}

# Confidence thresholds that trigger urgent alerts (percentage)
HIGH_CONFIDENCE_THRESHOLD = 60


def _parse_confidence(confidence_str: str) -> int:
    """Extract numeric confidence from strings like '85%' or 'High (85%)'."""
    try:
        # Try to extract numeric value
        import re
        numbers = re.findall(r'\d+', str(confidence_str))
        if numbers:
            return int(numbers[0])
    except (ValueError, IndexError):
        pass
    
    # Keyword-based fallback
    conf_lower = str(confidence_str).lower()
    if any(k in conf_lower for k in ["certain", "high"]):
        return 90
    elif any(k in conf_lower for k in ["probable"]):
        return 75
    elif any(k in conf_lower for k in ["possible"]):
        return 50
    return 30


def _determine_severity(causality: str, event: str) -> str:
    """Determine severity based on causality score and event type."""
    # Critical events
    critical_events = ["angioedema", "anaphylaxis", "seizure", "hepatotoxicity", 
                       "nephrotoxicity", "cardiac arrest", "death", "stevens-johnson"]
    
    event_lower = str(event).lower()
    causality_lower = str(causality).lower()
    
    if any(ce in event_lower for ce in critical_events):
        return "Critical"
    elif "certain" in causality_lower or "probable" in causality_lower:
        return "High"
    elif "possible" in causality_lower:
        return "Medium"
    else:
        return "Low"


def check_and_alert(drug: str, event: str, causality: str, confidence: str, 
                     reasoning: str, intake_id: int = None) -> dict:
    """
    Check if an adverse event meets the threshold for urgent alerting.
    If yes, write a mock Slack webhook payload to alerts.log.
    
    Args:
        drug: Suspect drug name
        event: Adverse event / MedDRA term
        causality: WHO-UMC causality category
        confidence: Confidence score (e.g., "85%")
        reasoning: AI reasoning for the assessment
        intake_id: Database record ID
        
    Returns:
        dict: Alert status and details
    """
    severity = _determine_severity(causality, event)
    confidence_num = _parse_confidence(confidence)
    
    should_alert = (
        severity in URGENT_SEVERITIES and 
        confidence_num >= HIGH_CONFIDENCE_THRESHOLD
    )
    
    alert_record = {
        "timestamp": datetime.now().isoformat(),
        "drug": drug,
        "event": event,
        "causality": causality,
        "confidence": confidence,
        "confidence_numeric": confidence_num,
        "severity": severity,
        "reasoning": reasoning,
        "intake_id": intake_id,
        "alert_triggered": should_alert
    }
    
    if should_alert:
        # Build mock Slack webhook payload
        slack_payload = {
            "channel": "#pharmacovigilance-urgent",
            "username": "AyuScout V2 Alert Bot",
            "icon_emoji": ":rotating_light:",
            "attachments": [{
                "color": "#FF0000" if severity == "Critical" else "#FF8C00",
                "title": f"🚨 URGENT: {severity} Adverse Event Detected",
                "fields": [
                    {"title": "Suspect Drug", "value": drug, "short": True},
                    {"title": "Adverse Event", "value": event, "short": True},
                    {"title": "WHO-UMC Causality", "value": causality, "short": True},
                    {"title": "Confidence", "value": f"{confidence} ({confidence_num}%)", "short": True},
                    {"title": "AI Reasoning", "value": reasoning, "short": False},
                ],
                "footer": f"AyuScout V2 | Case #{intake_id or 'N/A'} | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
                "ts": int(datetime.now().timestamp())
            }]
        }
        
        # Write to alert log (simulating webhook POST)
        _write_alert_log(alert_record, slack_payload)
        
        print(f"\n🚨 ═══════════════════════════════════════════════════")
        print(f"   URGENT ALERT TRIGGERED!")
        print(f"   💊 Drug: {drug}")
        print(f"   ⚠️  Event: {event} [{severity}]")
        print(f"   📊 Causality: {causality} | Confidence: {confidence}")
        print(f"   📤 Mock webhook payload written to: {ALERT_LOG_PATH}")
        print(f"🚨 ═══════════════════════════════════════════════════\n")
    
    return {
        **alert_record,
        "severity": severity
    }


def _write_alert_log(alert_record: dict, slack_payload: dict):
    """Write alert to the log file (simulates webhook POST)."""
    try:
        with open(ALERT_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"\n{'='*80}\n")
            f.write(f"ALERT TRIGGERED: {alert_record['timestamp']}\n")
            f.write(f"{'='*80}\n")
            f.write(f"Severity: {alert_record['severity']}\n")
            f.write(f"Drug: {alert_record['drug']} -> Event: {alert_record['event']}\n")
            f.write(f"Causality: {alert_record['causality']} | Confidence: {alert_record['confidence']}\n")
            f.write(f"Reasoning: {alert_record['reasoning']}\n")
            f.write(f"\nMock Slack Webhook Payload:\n")
            f.write(f"POST {WEBHOOK_URL}\n")
            f.write(json.dumps(slack_payload, indent=2))
            f.write(f"\n{'='*80}\n\n")
    except Exception as e:
        print(f"⚠️ Failed to write alert log: {e}")


def get_recent_alerts(limit: int = 20) -> list:
    """Read recent alerts from the log file. Returns structured dicts."""
    import re
    try:
        if not os.path.exists(ALERT_LOG_PATH):
            return []
        
        with open(ALERT_LOG_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Use regex to find complete alert blocks between separator lines
        # Each alert block starts with ALERT TRIGGERED and contains Drug/Event/Severity
        pattern = r'ALERT TRIGGERED:\s*(\S+).*?Severity:\s*(\S+)\s*\nDrug:\s*(.+?)\s*->\s*Event:\s*(.+?)\s*\n'
        matches = re.findall(pattern, content, re.DOTALL)
        
        alerts = []
        for timestamp, severity, drug, event in matches:
            alerts.append({
                "time": timestamp[:19],
                "severity": severity.strip(),
                "drug": drug.strip(),
                "event": event.strip()
            })
        
        return alerts[-limit:]  # Return most recent
    except Exception:
        return []
