"""
Auth Routes — /api/auth/me and extended auth endpoints.
These complement the existing auth routes in server.py.
"""
from fastapi import APIRouter, HTTPException
from database import get_user_by_id, get_user_by_email, get_settings

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.get("/me")
async def get_current_user(user_id: int):
    """
    Return full profile for the logged-in user.
    Frontend passes user_id from localStorage token.
    """
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Also attach their settings
    settings = get_settings(user_id)
    return {
        "status": "success",
        "user": user,
        "settings": settings
    }
