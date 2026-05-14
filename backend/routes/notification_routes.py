"""
Notification Routes — Full CRUD + Count
Handles GET/PUT/DELETE for /api/notifications and count endpoint.
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
from database import (
    get_notifications, mark_notification_read, mark_all_notifications_read,
    delete_notification, get_unread_notification_count, create_notification
)

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("")
async def list_notifications(user_id: Optional[int] = None):
    """Get all notifications, optionally filtered by user."""
    notifs = get_notifications(user_id=user_id)
    return {
        "status": "success",
        "notifications": notifs,
        "total": len(notifs),
        "unread": sum(1 for n in notifs if n['unread'])
    }


@router.get("/count")
async def notification_count(user_id: Optional[int] = None):
    """Get unread notification count for sidebar badge."""
    count = get_unread_notification_count(user_id=user_id)
    return {"status": "success", "count": count}


@router.put("/read-all")
async def mark_all_read(user_id: Optional[int] = None):
    """Mark all notifications as read."""
    ok = mark_all_notifications_read(user_id=user_id)
    return {"status": "success" if ok else "error"}


@router.put("/{notif_id}/read")
async def mark_single_read(notif_id: int):
    """Mark a single notification as read."""
    ok = mark_notification_read(notif_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "success"}


@router.delete("/{notif_id}")
async def remove_notification(notif_id: int):
    """Permanently delete a notification."""
    ok = delete_notification(notif_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "success", "message": "Notification deleted"}


@router.post("")
async def create_new_notification(
    title: str, desc: str = '', icon: str = 'info',
    type: str = 'system', category: str = 'System',
    priority: str = 'normal', user_id: Optional[int] = None
):
    """Create a system notification (for internal use)."""
    n = create_notification(title=title, desc=desc, icon=icon,
                             type=type, category=category,
                             priority=priority, user_id=user_id)
    return {"status": "success", "notification": n}
