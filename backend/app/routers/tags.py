"""Tag routes."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.database import get_db
from app.models import Tag

router = APIRouter(prefix="/amplex/api/crm", tags=["tags"])


@router.get("/tags")
def list_tags(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    tags = db.query(Tag).all()
    return {"tags": [{"id": t.id, "name": t.name, "color": t.color} for t in tags]}
