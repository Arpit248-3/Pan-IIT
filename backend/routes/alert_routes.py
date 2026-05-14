"""
Alert Routes — Count endpoint for sidebar badge.
GET /api/alerts/count → returns count of Critical+High severity signals.
"""
from fastapi import APIRouter
from database import get_critical_alerts_count

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


@router.get("/count")
async def alerts_count():
    """Return the count of critical/high severity alerts for the sidebar badge."""
    count = get_critical_alerts_count()
    return {"status": "success", "count": count}
