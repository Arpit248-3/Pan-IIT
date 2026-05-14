"""
Settings Routes — GET/PUT /api/settings
Handles per-user persistent settings backed by the AppSettings table.
"""
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_settings, upsert_settings, create_audit_log

router = APIRouter(prefix="/api/settings", tags=["Settings"])


class SettingsPayload(BaseModel):
    user_id: int
    # General
    org_name: Optional[str] = None
    contact_email: Optional[str] = None
    timezone: Optional[str] = None
    dark_mode: Optional[bool] = None
    compact_tables: Optional[bool] = None
    show_kpi_trends: Optional[bool] = None
    # Notifications
    notif_critical_alerts: Optional[bool] = None
    notif_daily_digest: Optional[bool] = None
    notif_report_reminders: Optional[bool] = None
    notif_sentiment_spike: Optional[bool] = None
    notif_weekly_summary: Optional[bool] = None
    webhook_url: Optional[str] = None
    # AI Configuration
    llm_model: Optional[str] = None
    sensitivity: Optional[str] = None
    prr_threshold: Optional[float] = None
    min_case_count: Optional[int] = None
    auto_signal: Optional[bool] = None
    sentiment_ai: Optional[bool] = None
    duplicate_detect: Optional[bool] = None
    # Security
    two_fa: Optional[bool] = None
    session_timeout: Optional[str] = None
    audit_log_enabled: Optional[bool] = None
    ip_whitelist: Optional[bool] = None


@router.get("")
async def get_user_settings(user_id: int):
    """Return settings for a user (creates defaults if first time)."""
    settings = get_settings(user_id)
    if settings is None:
        raise HTTPException(status_code=500, detail="Failed to load settings")
    return {"status": "success", "settings": settings}


@router.put("")
async def save_user_settings(payload: SettingsPayload, request: Request):
    """Persist settings for a user and log the audit event."""
    data = {k: v for k, v in payload.dict().items() if k != 'user_id' and v is not None}
    updated = upsert_settings(payload.user_id, data)
    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to save settings")
    # Log the action
    create_audit_log(
        user_id=payload.user_id,
        action="settings.update",
        metadata={"fields_updated": list(data.keys())},
        ip_address=request.client.host if request.client else None
    )
    return {"status": "success", "settings": updated, "message": "Settings saved successfully"}
