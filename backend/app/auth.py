"""Hub JWT token authentication and user resolution."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

logger = logging.getLogger(__name__)


@dataclass
class CurrentUser:
    user_id: int
    name: str
    email: str
    role: str  # 'admin' | 'user'
    hub_id: Optional[str]


async def get_current_user(request: Request, db: Session = Depends(get_db)) -> CurrentUser:
    """Validate Hub JWT from Authorization header, resolve or create local user."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")

    token = auth[7:]
    if not settings.hub_api_url:
        raise HTTPException(500, "Hub not configured")

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(
                f"{settings.hub_api_url}/api/v1/auth/userinfo",
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.RequestError:
            raise HTTPException(401, "Token validation failed")

    if resp.status_code != 200:
        raise HTTPException(401, "Invalid token")

    claims = resp.json()
    hub_user_id = claims.get("user_id") or claims.get("sub")
    email = claims.get("email", "")
    name = claims.get("name", "")
    roles = claims.get("roles", [])

    # Resolve local user
    user: Optional[User] = None
    if hub_user_id:
        user = db.query(User).filter(User.hub_id == str(hub_user_id)).first()
    if not user and email:
        user = db.query(User).filter(User.email == email).first()
    if not user and email:
        user = db.query(User).filter(User.login == email).first()

    if not user:
        # Auto-provision
        display_name = name or email.split("@")[0]
        user = User(
            name=display_name,
            email=email,
            login=email,
            hub_id=str(hub_user_id) if hub_user_id else None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Auto-provisioned user %s (hub_id=%s)", email, hub_user_id)

    role = "admin" if any(r in ("admin", "super_admin") for r in roles) else "user"
    return CurrentUser(
        user_id=user.id,
        name=name or user.name,
        email=email or user.email,
        role=role,
        hub_id=hub_user_id,
    )


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency that ensures the user is an admin."""
    if current_user.role != "admin":
        raise HTTPException(403, "Permissão negada")
    return current_user
