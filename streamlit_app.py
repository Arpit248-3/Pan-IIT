"""
Lightweight Streamlit wrapper for AyuScout demo.
Uses the AI engine's mock pipeline when Ollama isn't available,
so it can run on Streamlit Cloud for a simple demo.
"""
import streamlit as st
from backend.ai_engine import _generate_mock_result

st.set_page_config(page_title="AyuScout Demo", layout="centered")

st.title("AyuScout — Pharmacovigilance Demo")
st.markdown("Paste a patient/case report below and click Analyze to run the demo pipeline.")

report = st.text_area("Case report text", height=240)

if st.button("Analyze"):
    if not report.strip():
        st.warning("Please enter a case report to analyze.")
    else:
        with st.spinner("Running AI pipeline (mock/fast)..."):
            result = _generate_mock_result(report)

        st.subheader("Summary")
        doc = result.get("doctor_verdict", {})
        col1, col2 = st.columns(2)
        col1.metric("Causality", doc.get("causality_score", "Unknown"))
        col2.metric("Confidence", doc.get("confidence_score", "Unknown"))

        st.subheader("Extracted Clinical Data")
        st.json(result.get("extracted_data", {}))

        st.subheader("Doctor Verdict & Reasoning")
        st.json(doc)

        st.subheader("Raw Pipeline Output")
        st.json({k: v for k, v in result.items() if k not in ("extracted_data", "doctor_verdict")})

st.sidebar.header("Deploying")
st.sidebar.markdown(
    "- Run locally: `streamlit run streamlit_app.py`\n- Deploy: push to GitHub and connect the repo on Streamlit Cloud."
)
