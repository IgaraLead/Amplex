"""Tag routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context
from app.database import get_db
from app.models import Tag

router = APIRouter(prefix="/amplex/api/o/{org_id}/crm", tags=["tags"])


@router.get("/tags")
def list_tags(
    db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_org_context)
):
    tags = db.query(Tag).filter(Tag.org_id == current_user.org_id).all()
    return {"tags": [{"id": t.id, "name": t.name, "color": t.color} for t in tags]}
