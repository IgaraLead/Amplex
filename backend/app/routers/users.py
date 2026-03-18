"""User listing routes."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/amplex/api/crm", tags=["users"])


@router.get("/users")
def list_users(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    users = db.query(User).filter(User.is_internal.is_(True), User.active.is_(True)).all()
    return {
        "users": [{"id": u.id, "name": u.name, "email": u.email or ""} for u in users]
    }
