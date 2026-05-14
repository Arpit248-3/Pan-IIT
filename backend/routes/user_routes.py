"""
User Routes — Full CRUD for User Management
GET/POST/PUT/DELETE /api/users
Uses soft-delete (never hard-deletes) for audit integrity.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from database import (
    get_all_users, get_user_by_id, update_user, soft_delete_user,
    create_user, create_audit_log, change_password, verify_password,
    get_user_by_email
)

router = APIRouter(prefix="/api/users", tags=["Users"])

VALID_ROLES = ['user', 'admin', 'analyst', 'reviewer', 'safety_officer', 'Safety Officer', 'Analyst', 'Reviewer', 'Admin']


class CreateUserPayload(BaseModel):
    name: str
    email: str
    password: str
    role: Optional[str] = 'user'
    department: Optional[str] = 'Pharmacovigilance'
    requester_id: Optional[int] = None   # who is creating this user (for audit)


class UpdateUserPayload(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    status: Optional[str] = None
    requester_id: Optional[int] = None


class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str
    user_id: int


@router.get("")
async def list_users():
    """List all active (non-deleted) users."""
    users = get_all_users()
    return {"status": "success", "users": users, "total": len(users)}


@router.get("/{user_id}")
async def get_user(user_id: int):
    """Get a single user by ID."""
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "success", "user": user}


@router.post("")
async def create_new_user(payload: CreateUserPayload, request: Request):
    """Create a new user account with hashed password."""
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    user, error = create_user(
        name=payload.name,
        email=payload.email,
        password=payload.password,
        role=payload.role or 'user'
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    # Update department (create_user doesn't accept it yet, use update)
    if payload.department:
        update_user(user['id'], {'department': payload.department})
    create_audit_log(
        user_id=payload.requester_id,
        action="user.create",
        metadata={"created_email": payload.email, "role": payload.role},
        ip_address=request.client.host if request.client else None
    )
    # Refresh to get full data
    full_user = get_user_by_id(user['id'])
    return {"status": "success", "user": full_user, "message": "User created successfully"}


@router.put("/{user_id}")
async def update_existing_user(user_id: int, payload: UpdateUserPayload, request: Request):
    """Update user profile fields."""
    data = {k: v for k, v in payload.dict().items()
            if k not in ('requester_id',) and v is not None}
    user, error = update_user(user_id, data)
    if error:
        raise HTTPException(status_code=400, detail=error)
    create_audit_log(
        user_id=payload.requester_id,
        action="user.update",
        metadata={"target_user_id": user_id, "fields_updated": list(data.keys())},
        ip_address=request.client.host if request.client else None
    )
    return {"status": "success", "user": user, "message": "User updated successfully"}


@router.delete("/{user_id}")
async def delete_user(user_id: int, request: Request, requester_id: Optional[int] = None):
    """Soft-delete a user (sets deleted_at, status=Inactive). Never hard-deletes."""
    ok, error = soft_delete_user(user_id)
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    create_audit_log(
        user_id=requester_id,
        action="user.delete",
        metadata={"target_user_id": user_id},
        ip_address=request.client.host if request.client else None
    )
    return {"status": "success", "message": "User deactivated successfully"}


@router.put("/password/change")
async def change_user_password(payload: ChangePasswordPayload, request: Request):
    """Change a user's password with current password verification."""
    # Verify current password
    from database import get_user_by_id as _get_user, SessionLocal, User, verify_password as vp
    from database import SessionLocal, User
    session = SessionLocal()
    try:
        u = session.query(User).filter(User.id == payload.user_id).first()
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        if not vp(payload.current_password, u.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
    finally:
        session.close()

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    ok, error = change_password(payload.user_id, payload.new_password)
    if not ok:
        raise HTTPException(status_code=500, detail=error)

    create_audit_log(
        user_id=payload.user_id,
        action="security.password_change",
        metadata={},
        ip_address=request.client.host if request.client else None
    )
    return {"status": "success", "message": "Password updated successfully"}
