"""Lead source routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context, require_org_admin
from app.database import get_db
from app.models import Source

router = APIRouter(prefix="/amplex/api/o/{org_id}/crm", tags=["sources"])


@router.get("/sources")
def list_sources(
    db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_org_context)
):
    sources = db.query(Source).filter(Source.org_id == current_user.org_id).all()
    return {"items": [{"id": s.id, "name": s.name} for s in sources]}


@router.post("/sources", status_code=201)
def create_source(
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name is required")

    source = Source(name=name, org_id=current_user.org_id)
    db.add(source)
    db.commit()
    db.refresh(source)
    return {"id": source.id, "name": source.name}
