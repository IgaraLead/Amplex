"""Pipeline (Kanban) routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context
from app.database import get_db
from app.models import Lead, Stage

router = APIRouter(prefix="/amplex/api/o/{org_id}/crm", tags=["pipeline"])


@router.get("/pipeline")
def pipeline(
    type: str = Query("opportunity"),
    search: str = Query(None),
    user_id: int = Query(None),
    min_value: float = Query(None),
    max_value: float = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    filters = [Lead.active.is_(True), Lead.org_id == current_user.org_id]
    if type in ("lead", "opportunity"):
        filters.append(Lead.type == type)

    is_admin = current_user.role == "admin"
    if not is_admin:
        filters.append(Lead.user_id == current_user.user_id)
    elif user_id:
        filters.append(Lead.user_id == user_id)

    if search:
        filters.append(
            or_(
                Lead.name.ilike(f"%{search}%"),
                Lead.contact_name.ilike(f"%{search}%"),
                Lead.email_from.ilike(f"%{search}%"),
            )
        )

    if min_value is not None:
        filters.append(Lead.expected_revenue >= min_value)
    if max_value is not None:
        filters.append(Lead.expected_revenue <= max_value)

    columns = []
    for stage in (
        db.query(Stage)
        .filter(Stage.org_id == current_user.org_id)
        .order_by(Stage.sequence)
        .all()
    ):
        stage_filters = filters + [Lead.stage_id == stage.id]
        leads = (
            db.query(Lead)
            .filter(*stage_filters)
            .order_by(Lead.priority.desc(), Lead.id.desc())
            .limit(50)
            .all()
        )
        count = db.query(Lead).filter(*stage_filters).count()
        cards = []
        for lead in leads:
            cards.append(
                {
                    "id": lead.id,
                    "name": lead.name,
                    "contact_name": lead.contact_name or "",
                    "partner_name": lead.contact.name if lead.contact else "",
                    "email_from": lead.email_from or "",
                    "phone": lead.phone or "",
                    "expected_revenue": lead.expected_revenue or 0,
                    "probability": lead.probability or 0,
                    "priority": lead.priority or "0",
                    "create_date": lead.created_at,
                    "tag_ids": [
                        {"id": t.id, "name": t.name, "color": t.color}
                        for t in lead.tags
                    ],
                    "user_id": lead.user_id,
                    "user_name": lead.user.name if lead.user else "",
                }
            )
        columns.append(
            {
                "id": stage.id,
                "name": stage.name,
                "sequence": stage.sequence,
                "is_won": stage.is_won,
                "count": count,
                "cards": cards,
            }
        )

    return {"columns": columns}
