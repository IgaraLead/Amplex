"""User listing routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context
from app.database import get_db
from app.models import OrgMember, User

router = APIRouter(prefix="/amplex/api/o/{org_id}/crm", tags=["users"])


@router.get("/users")
def list_users(
    db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_org_context)
):
    users = (
        db.query(User)
        .join(OrgMember, OrgMember.user_id == User.id)
        .filter(
            OrgMember.org_id == current_user.org_id,
            User.is_internal.is_(True),
            User.active.is_(True),
        )
        .all()
    )
    return {
        "users": [{"id": u.id, "name": u.name, "email": u.email or ""} for u in users]
    }
