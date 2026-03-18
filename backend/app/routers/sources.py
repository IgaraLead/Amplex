"""Lead source routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user, require_admin
from app.database import get_db
from app.models import Source

router = APIRouter(prefix="/amplex/api/crm", tags=["sources"])


@router.get("/sources")
def list_sources(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    sources = db.query(Source).all()
    return {"items": [{"id": s.id, "name": s.name} for s in sources]}


@router.post("/sources", status_code=201)
def create_source(
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name is required")

    source = Source(name=name)
    db.add(source)
    db.commit()
    db.refresh(source)
    return {"id": source.id, "name": source.name}
