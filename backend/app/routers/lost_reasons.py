"""Lost reason routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context, require_org_admin
from app.database import get_db
from app.models import LostReason

router = APIRouter(prefix="/amplex/api/o/{org_id}/crm", tags=["lost-reasons"])


@router.get("/lost-reasons")
def list_lost_reasons(
    db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_org_context)
):
    reasons = (
        db.query(LostReason)
        .filter(LostReason.org_id == current_user.org_id, LostReason.active.is_(True))
        .all()
    )
    return {"items": [{"id": r.id, "name": r.name} for r in reasons]}


@router.post("/lost-reasons", status_code=201)
def create_lost_reason(
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name is required")

    reason = LostReason(name=name, org_id=current_user.org_id)
    db.add(reason)
    db.commit()
    db.refresh(reason)
    return {"id": reason.id, "name": reason.name}


@router.delete("/lost-reasons/{reason_id}")
def delete_lost_reason(
    reason_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    reason = (
        db.query(LostReason)
        .filter(LostReason.id == reason_id, LostReason.org_id == current_user.org_id)
        .first()
    )
    if not reason:
        raise HTTPException(404, "Not found")

    reason.active = False
    db.commit()
    return {"id": reason.id, "archived": True}
