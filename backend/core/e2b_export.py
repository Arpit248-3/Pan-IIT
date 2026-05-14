"""
AyuScout V2 — E2B Export Generator
=====================================
Generates ICH E2B (R2 SGML and R3 XML) compliant reports for adverse event reporting.

Reference: ICH E2B(R2) and ICH E2B(R3)
"""

import os
from datetime import datetime
from typing import Optional


# ============================================================
# E2B (R3) — ICH XML Format (Modern)
# ============================================================
def generate_e2b_xml(record: dict) -> str:
    """
    Generate an ICH E2B (R3) compliant XML document.
    """
    record_id = record.get('id', '001')
    drug      = _escape_xml(str(record.get('drug', 'Unknown')))
    event     = _escape_xml(str(record.get('event', 'Unknown')))
    causality = _escape_xml(str(record.get('causality', 'Unassessable')))
    confidence= _escape_xml(str(record.get('confidence', 'Unknown')))
    reasoning = _escape_xml(str(record.get('reasoning', 'AI assessment')))
    sentiment = _escape_xml(str(record.get('sentiment', 'Negative')))
    pubmed    = _escape_xml(str(record.get('pubmed_link', 'N/A')))
    time_onset= _escape_xml(str(record.get('time_to_onset', 'Unknown')))
    concomitant = record.get('concomitant_drugs', '[]')
    try:
        import json
        concomitant_list = json.loads(concomitant) if isinstance(concomitant, str) else concomitant
    except Exception:
        concomitant_list = []

    now          = datetime.now()
    message_date = now.strftime("%Y%m%d%H%M%S")
    report_date  = now.strftime("%Y%m%d")

    concomitant_xml = ""
    for cd in concomitant_list:
        cd_escaped = _escape_xml(str(cd))
        concomitant_xml += f"""
      <drug>
        <drugcharacterization>2</drugcharacterization>
        <medicinalproduct>{cd_escaped}</medicinalproduct>
      </drug>"""

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!--
  AyuScout V2 — ICH E2B (R3) Individual Case Safety Report
  Generated: {now.isoformat()}
  Record ID: {record_id}
  Format: ICH E2B(R3) XML
-->
<ichicsr lang="en" xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">

  <!-- === MESSAGE HEADER === -->
  <ichicsrmessageheader>
    <messagetype>ichicsr</messagetype>
    <messageformatversion>2.1</messageformatversion>
    <messageformatrelease>2.0</messageformatrelease>
    <messagenumb>AYUSCOUT-{str(record_id).zfill(5)}</messagenumb>
    <messagesenderidentifier>AyuScout-V2-AI-Engine</messagesenderidentifier>
    <messagereceiveridentifier>REGULATORY-AUTHORITY</messagereceiveridentifier>
    <messagedateformat>204</messagedateformat>
    <messagedate>{message_date}</messagedate>
  </ichicsrmessageheader>

  <!-- === SAFETY REPORT === -->
  <safetyreport>
    <safetyreportversion>1</safetyreportversion>
    <safetyreportid>AYUSCOUT-ICSR-{str(record_id).zfill(5)}</safetyreportid>
    <primarysourcecountry>IN</primarysourcecountry>
    <occurcountry>IN</occurcountry>
    <transmissiondateformat>102</transmissiondateformat>
    <transmissiondate>{report_date}</transmissiondate>
    <reporttype>1</reporttype>
    <serious>1</serious>
    <seriousnessdeath>2</seriousnessdeath>
    <seriousnesslifethreatening>2</seriousnesslifethreatening>
    <seriousnesshospitalization>2</seriousnesshospitalization>
    <seriousnessdisabling>2</seriousnessdisabling>
    <seriousnessother>1</seriousnessother>

    <primarysource>
      <reportergivename>AyuScout AI System</reportergivename>
      <reporterorganization>AyuScout V2 Pharmacovigilance Platform</reporterorganization>
      <qualification>5</qualification>
    </primarysource>

    <sender>
      <sendertype>1</sendertype>
      <senderorganization>AyuScout V2</senderorganization>
      <senderdepartment>AI Signal Detection Engine</senderdepartment>
    </sender>

    <receiver>
      <receivertype>2</receivertype>
      <receiverorganization>Regulatory Authority</receiverorganization>
    </receiver>

    <!-- === PATIENT === -->
    <patient>
      <patientinitial>[REDACTED-BY-PII-VAULT]</patientinitial>

      <!-- Suspect Drug -->
      <drug>
        <drugcharacterization>1</drugcharacterization>
        <medicinalproduct>{drug}</medicinalproduct>
        <drugauthorizationnumb>N/A</drugauthorizationnumb>
        <drugindication>Under Investigation</drugindication>
        <drugtimetoachievefirstdose>{time_onset}</drugtimetoachievefirstdose>
        <actiondrug>1</actiondrug>
        <drugreactionassessment>
          <drugassessmentmethod>WHO-UMC Causality System</drugassessmentmethod>
          <drugassessmentresult>{causality}</drugassessmentresult>
          <drugassessmentsource>AyuScout V2 AI Engine (Confidence: {confidence})</drugassessmentsource>
        </drugreactionassessment>
      </drug>{concomitant_xml}

      <!-- Adverse Event -->
      <reaction>
        <primarysourcereaction>{event}</primarysourcereaction>
        <reactionmeddraversionlmp>26.0</reactionmeddraversionlmp>
        <reactionmeddrapt>{event}</reactionmeddrapt>
        <reactionoutcome>6</reactionoutcome>
      </reaction>

      <!-- AI Summary -->
      <summary>
        <narrativeincludeclinical>
AI-GENERATED CASE NARRATIVE (AyuScout V2 E2B R3):

Suspect Drug       : {drug}
Adverse Event PT   : {event}
Time to Onset      : {time_onset}
Sentiment          : {sentiment}
WHO-UMC Causality  : {causality}
AI Confidence      : {confidence}
AI Reasoning       : {reasoning}
PubMed Reference   : {pubmed}

NOTE: Auto-generated by AyuScout V2 AI Engine from social media signal detection.
Patient PII has been masked by the PII Vault. Requires human review before regulatory submission.
        </narrativeincludeclinical>
      </summary>
    </patient>
  </safetyreport>
</ichicsr>"""

    return xml


# ============================================================
# E2B (R2) — ICH SGML-style XML Format (Legacy / Widely Used)
# ============================================================
def generate_e2b_r2_xml(record: dict) -> str:
    """
    Generate an ICH E2B (R2) XML document.
    E2B R2 uses flat element names (SAFETYREPORTID, MEDICALLYCONFIRM, etc.)
    as defined in ICH M2 EWG guidance.
    """
    record_id  = record.get('id', '001')
    drug       = _escape_xml(str(record.get('drug', 'Unknown')))
    event      = _escape_xml(str(record.get('event', 'Unknown')))
    causality  = _escape_xml(str(record.get('causality', 'Unassessable')))
    confidence = _escape_xml(str(record.get('confidence', 'Unknown')))
    reasoning  = _escape_xml(str(record.get('reasoning', 'AI assessment')))
    sentiment  = _escape_xml(str(record.get('sentiment', 'Negative')))
    pubmed     = _escape_xml(str(record.get('pubmed_link', 'N/A')))
    time_onset = _escape_xml(str(record.get('time_to_onset', 'Unknown')))

    now = datetime.now()
    report_date  = now.strftime("%Y%m%d")
    message_date = now.strftime("%Y%m%d%H%M%S")

    # Map WHO-UMC causality to E2B R2 assessment codes
    causality_code_map = {
        "Certain":       "1",
        "Probable":      "2",
        "Possible":      "3",
        "Unlikely":      "4",
        "Unassessable":  "0",
        "Pending":       "0",
    }
    causality_code = causality_code_map.get(causality, "0")

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ich_icsr SYSTEM "ich-icsr-v2-0.dtd">
<!--
  AyuScout V2 — ICH E2B (R2) Individual Case Safety Report
  Generated : {now.isoformat()}
  Record ID : {record_id}
  Format    : ICH E2B(R2) XML (SGML-compatible)
  Reference : ICH M2 EWG E2B(R2) Implementation Guide
-->
<ich_icsr>

  <!-- A: ADMINISTRATIVE INFORMATION -->
  <safetyreportid>AYUSCOUT-R2-{str(record_id).zfill(5)}</safetyreportid>
  <safetyreportversion>1</safetyreportversion>
  <primarysourcecountry>IN</primarysourcecountry>
  <occurcountry>IN</occurcountry>
  <transmissiondate>{report_date}</transmissiondate>
  <reporttype>1</reporttype>

  <!-- B: CASE SAFETY INFORMATION -->
  <serious>1</serious>
  <seriousnessdeath>2</seriousnessdeath>
  <seriousnesslifethreatening>2</seriousnesslifethreatening>
  <seriousnesshospitalization>2</seriousnesshospitalization>
  <seriousnessdisabling>2</seriousnessdisabling>
  <seriousnesscongenitalanomali>2</seriousnesscongenitalanomali>
  <seriousnessother>1</seriousnessother>

  <!-- C: PRIMARY SOURCE INFORMATION -->
  <primarysource>
    <reportergivename>AyuScout AI System</reportergivename>
    <reporterorganization>AyuScout V2 Pharmacovigilance Platform</reporterorganization>
    <qualification>5</qualification>
  </primarysource>

  <!-- D: SENDER INFORMATION -->
  <sender>
    <sendertype>1</sendertype>
    <senderorganization>AyuScout V2</senderorganization>
    <senderdepartment>AI Signal Detection Engine</senderdepartment>
  </sender>

  <!-- E: PATIENT CHARACTERISTICS -->
  <patient>
    <patientinitial>[REDACTED]</patientinitial>
    <patientonsetage>Unknown</patientonsetage>
    <patientsex>0</patientsex>

    <!-- F: REACTION(S) / EVENT(S) -->
    <reaction>
      <primarysourcereaction>{event}</primarysourcereaction>
      <reactionmeddrapt>{event}</reactionmeddrapt>
      <reactionmeddraversionlmp>26.0</reactionmeddraversionlmp>
      <reactionoutcome>6</reactionoutcome>
      <reactionfirsttime>{time_onset}</reactionfirsttime>
    </reaction>

    <!-- G: TEST RESULTS -->
    <!-- No laboratory tests available from social media source -->

    <!-- H: DRUG(S) INFORMATION -->
    <drug>
      <drugcharacterization>1</drugcharacterization>
      <medicinalproduct>{drug}</medicinalproduct>
      <drugindication>Under Investigation</drugindication>
      <drugreactionassessment>
        <drugassessmentmethod>WHO-UMC</drugassessmentmethod>
        <drugassessmentresult>{causality}</drugassessmentresult>
        <drugassessmentsource>AyuScout V2 (Confidence: {confidence})</drugassessmentsource>
        <drugcausalityassessmentcode>{causality_code}</drugcausalityassessmentcode>
      </drugreactionassessment>
      <drugtimetoachievefirstdose>{time_onset}</drugtimetoachievefirstdose>
    </drug>

    <!-- I: NARRATIVE SUMMARY -->
    <summary>
      <narrativeincludeclinical>
E2B(R2) AI-GENERATED CASE NARRATIVE — AyuScout V2:

Suspect Drug      : {drug}
Adverse Event PT  : {event}
Time to Onset     : {time_onset}
Sentiment Source  : {sentiment}

WHO-UMC Causality : {causality} (Code: {causality_code})
AI Confidence     : {confidence}

AI Clinical Reasoning:
{reasoning}

Literature Reference (PubMed):
{pubmed}

Source: Social media pharmacovigilance signal (AyuScout V2 AI Engine)
Patient PII masked by PII Vault. Requires human medical review before regulatory submission.
      </narrativeincludeclinical>
    </summary>
  </patient>

</ich_icsr>"""

    return xml


def _escape_xml(text: str) -> str:
    """Escape special XML characters."""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;"))


def save_e2b_file(record: dict, output_dir: str = "./e2b_exports", format: str = "r3") -> str:
    """Generate and save E2B XML to a file."""
    os.makedirs(output_dir, exist_ok=True)
    record_id = record.get('id', 'unknown')
    fmt_label = "R2" if format == "r2" else "R3"
    filename = f"E2B_ICSR_{fmt_label}_{record_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xml"
    filepath = os.path.join(output_dir, filename)
    xml_content = generate_e2b_r2_xml(record) if format == "r2" else generate_e2b_xml(record)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(xml_content)
    print(f"📄 E2B ({fmt_label}) Report saved: {filepath}")
    return filepath
