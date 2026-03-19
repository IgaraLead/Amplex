"""Lead CRUD routes."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context, require_org_admin
from app.database import get_db
from app.models import (
    Contact,
    Interaction,
    Lead,
    LostReason,
    OrgMember,
    Stage,
    Tag,
    User,
)
from app.routers.permissions import get_user_permission

router = APIRouter(prefix="/amplex/api/o/{org_id}/crm", tags=["leads"])


# ── Pydantic schemas ────────────────────────────────────────


class LeadCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    type: str = Field("opportunity", pattern="^(lead|opportunity)$")
    contact_name: str = ""
    email_from: str = ""
    phone: str = ""
    expected_revenue: float = 0
    description: str = ""
    priority: str = Field("0", pattern="^[0-3]$")
    function: str = ""
    source_id: Optional[int] = None
    stage_id: Optional[int] = None
    partner_id: Optional[int] = None


class LeadUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=300)
    type: Optional[str] = Field(None, pattern="^(lead|opportunity)$")
    contact_name: Optional[str] = None
    email_from: Optional[str] = None
    phone: Optional[str] = None
    expected_revenue: Optional[float] = None
    probability: Optional[float] = None
    priority: Optional[str] = Field(None, pattern="^[0-3]$")
    description: Optional[str] = None
    street: Optional[str] = None
    city: Optional[str] = None
    date_deadline: Optional[str] = None
    function: Optional[str] = None
    stage_id: Optional[int] = None
    partner_id: Optional[int] = None
    user_id: Optional[int] = None
    source_id: Optional[int] = None
    tag_ids: Optional[List[int]] = None


class LeadMove(BaseModel):
    stage_id: int


class LeadTransfer(BaseModel):
    user_id: int


class LeadLost(BaseModel):
    lost_reason_id: int


# ── Helpers ──────────────────────────────────────────────────


def _check_lead_access(lead: Lead, current_user: CurrentUser, db: Session) -> None:
    """Raise 404 if user has no access to this lead."""
    if current_user.role == "admin":
        return
    user_model = db.query(User).filter(User.id == current_user.user_id).first()
    if user_model and get_user_permission(user_model, "view_all_leads"):
        return
    if lead.user_id != current_user.user_id:
        raise HTTPException(404, "Not found")


def _lead_list_item(lead: Lead) -> dict:
    return {
        "id": lead.id,
        "name": lead.name,
        "type": lead.type,
        "stage_id": lead.stage_id,
        "stage_name": lead.stage.name if lead.stage else "",
        "contact_name": lead.contact_name or "",
        "partner_name": lead.contact.name if lead.contact else "",
        "email_from": lead.email_from or "",
        "phone": lead.phone or "",
        "expected_revenue": lead.expected_revenue or 0,
        "probability": lead.probability or 0,
        "priority": lead.priority or "0",
        "user_name": lead.user.name if lead.user else "",
        "source_id": lead.source_id,
        "source_name": lead.source.name if lead.source else "",
        "function": lead.function or "",
        "create_date": lead.created_at,
    }


@router.get("/leads")
def list_leads(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(None),
    type: str = Query(None),
    stage_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    offset = (page - 1) * limit
    filters = [Lead.active.is_(True), Lead.org_id == current_user.org_id]

    # Admins and users with view_all_leads see all; others see only own
    if current_user.role != "admin":
        user_model = db.query(User).filter(User.id == current_user.user_id).first()
        if not user_model or not get_user_permission(user_model, "view_all_leads"):
            filters.append(Lead.user_id == current_user.user_id)

    if type in ("lead", "opportunity"):
        filters.append(Lead.type == type)
    if stage_id:
        filters.append(Lead.stage_id == stage_id)
    if search:
        filters.append(
            or_(
                Lead.name.ilike(f"%{search}%"),
                Lead.contact_name.ilike(f"%{search}%"),
                Lead.email_from.ilike(f"%{search}%"),
            )
        )

    total = db.query(Lead).filter(*filters).count()
    leads = (
        db.query(Lead)
        .filter(*filters)
        .order_by(Lead.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "items": [_lead_list_item(lead) for lead in leads],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total else 0,
    }


@router.post("/leads", status_code=201)
def create_lead(
    body: LeadCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    lead = Lead(
        name=body.name.strip(),
        type=body.type,
        org_id=current_user.org_id,
        contact_name=body.contact_name,
        email_from=body.email_from,
        phone=body.phone,
        expected_revenue=body.expected_revenue,
        description=body.description,
        priority=body.priority,
        function=body.function,
        user_id=current_user.user_id,
    )

    if body.source_id:
        lead.source_id = body.source_id
    if body.stage_id:
        lead.stage_id = body.stage_id
    else:
        first_stage = (
            db.query(Stage)
            .filter(Stage.org_id == current_user.org_id)
            .order_by(Stage.sequence)
            .first()
        )
        if first_stage:
            lead.stage_id = first_stage.id

    if body.partner_id:
        lead.contact_id = body.partner_id
    elif body.email_from or body.phone:
        contact = None
        if body.email_from:
            contact = (
                db.query(Contact)
                .filter(
                    Contact.email == body.email_from,
                    Contact.org_id == current_user.org_id,
                )
                .first()
            )
        if not contact and body.phone:
            contact = (
                db.query(Contact)
                .filter(
                    Contact.phone == body.phone, Contact.org_id == current_user.org_id
                )
                .first()
            )
        if contact:
            lead.contact_id = contact.id

    db.add(lead)
    db.commit()
    db.refresh(lead)

    return {
        "id": lead.id,
        "name": lead.name,
        "stage_id": lead.stage_id,
        "stage_name": lead.stage.name if lead.stage else "",
    }


@router.get("/leads/{lead_id}")
def get_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    lead = (
        db.query(Lead)
        .filter(Lead.id == lead_id, Lead.org_id == current_user.org_id)
        .first()
    )
    if not lead:
        raise HTTPException(404, "Not found")
    _check_lead_access(lead, current_user, db)

    return {
        "id": lead.id,
        "name": lead.name,
        "type": lead.type,
        "stage_id": lead.stage_id,
        "stage_name": lead.stage.name if lead.stage else "",
        "contact_name": lead.contact_name or "",
        "partner_id": lead.contact_id,
        "partner_name": lead.contact.name if lead.contact else "",
        "email_from": lead.email_from or "",
        "phone": lead.phone or "",
        "mobile": lead.mobile or "",
        "expected_revenue": lead.expected_revenue or 0,
        "probability": lead.probability or 0,
        "priority": lead.priority or "0",
        "description": lead.description or "",
        "street": lead.street or "",
        "city": lead.city or "",
        "state_id": None,
        "state_name": lead.state_name or "",
        "country_id": None,
        "country_name": lead.country_name or "",
        "user_id": lead.user_id,
        "user_name": lead.user.name if lead.user else "",
        "team_id": None,
        "team_name": "",
        "source_id": lead.source_id,
        "source_name": lead.source.name if lead.source else "",
        "function": lead.function or "",
        "tag_ids": [{"id": t.id, "name": t.name, "color": t.color} for t in lead.tags],
        "create_date": lead.created_at,
        "write_date": lead.updated_at,
        "date_deadline": lead.date_deadline,
        "date_closed": lead.date_closed,
        "lost_reason_id": lead.lost_reason_id,
        "lost_reason": lead.lost_reason.name if lead.lost_reason else "",
    }


@router.put("/leads/{lead_id}")
def update_lead(
    lead_id: int,
    body: LeadUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    lead = (
        db.query(Lead)
        .filter(Lead.id == lead_id, Lead.org_id == current_user.org_id)
        .first()
    )
    if not lead:
        raise HTTPException(404, "Not found")
    _check_lead_access(lead, current_user, db)

    updates = body.model_dump(exclude_unset=True)

    writable = [
        "name",
        "type",
        "contact_name",
        "email_from",
        "phone",
        "expected_revenue",
        "probability",
        "priority",
        "description",
        "street",
        "city",
        "date_deadline",
        "function",
    ]
    for field in writable:
        if field in updates:
            setattr(lead, field, updates[field])

    if "stage_id" in updates:
        lead.stage_id = updates["stage_id"]
    if "partner_id" in updates:
        lead.contact_id = updates["partner_id"]
    if "user_id" in updates:
        lead.user_id = updates["user_id"]
    if "source_id" in updates:
        lead.source_id = updates["source_id"]
    if "tag_ids" in updates:
        tag_objs = (
            db.query(Tag)
            .filter(Tag.id.in_(updates["tag_ids"]), Tag.org_id == current_user.org_id)
            .all()
        )
        lead.tags = tag_objs

    db.commit()
    db.refresh(lead)

    return {
        "id": lead.id,
        "name": lead.name,
        "stage_name": lead.stage.name if lead.stage else "",
    }


@router.delete("/leads/{lead_id}")
def delete_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    lead = (
        db.query(Lead)
        .filter(Lead.id == lead_id, Lead.org_id == current_user.org_id)
        .first()
    )
    if not lead:
        raise HTTPException(404, "Not found")
    _check_lead_access(lead, current_user, db)

    lead.active = False
    db.commit()
    return {"id": lead.id, "archived": True}


@router.post("/leads/{lead_id}/move")
def move_lead(
    lead_id: int,
    body: LeadMove,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    lead = (
        db.query(Lead)
        .filter(Lead.id == lead_id, Lead.org_id == current_user.org_id)
        .first()
    )
    if not lead:
        raise HTTPException(404, "Not found")
    _check_lead_access(lead, current_user, db)

    stage = (
        db.query(Stage)
        .filter(Stage.id == body.stage_id, Stage.org_id == current_user.org_id)
        .first()
    )
    if not stage:
        raise HTTPException(404, "Stage not found")

    lead.stage_id = stage.id
    db.commit()

    return {
        "id": lead.id,
        "name": lead.name,
        "stage_id": stage.id,
        "stage_name": stage.name,
    }


@router.post("/leads/{lead_id}/transfer")
def transfer_lead(
    lead_id: int,
    body: LeadTransfer,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    lead = (
        db.query(Lead)
        .filter(Lead.id == lead_id, Lead.org_id == current_user.org_id)
        .first()
    )
    if not lead:
        raise HTTPException(404, "Not found")

    new_user = (
        db.query(User)
        .join(OrgMember, OrgMember.user_id == User.id)
        .filter(User.id == body.user_id, OrgMember.org_id == current_user.org_id)
        .first()
    )
    if not new_user:
        raise HTTPException(404, "User not found")

    old_user_name = lead.user.name if lead.user else "Ninguém"
    lead.user_id = new_user.id

    # Log transfer in timeline
    interaction = Interaction(
        lead_id=lead.id,
        interaction_type="note",
        body=(
            f"<p>🔄 <strong>Lead transferido</strong> de "
            f"{old_user_name} para {new_user.name}</p>"
        ),
        preview=f"Lead transferido de {old_user_name} para {new_user.name}",
        author_id=current_user.user_id,
    )
    db.add(interaction)
    db.commit()

    return {"id": lead.id, "user_id": new_user.id, "user_name": new_user.name}


@router.post("/leads/{lead_id}/lost")
def mark_lead_lost(
    lead_id: int,
    body: LeadLost,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    lead = (
        db.query(Lead)
        .filter(Lead.id == lead_id, Lead.org_id == current_user.org_id)
        .first()
    )
    if not lead:
        raise HTTPException(404, "Not found")
    _check_lead_access(lead, current_user, db)

    reason = (
        db.query(LostReason)
        .filter(
            LostReason.id == body.lost_reason_id,
            LostReason.org_id == current_user.org_id,
        )
        .first()
    )
    if not reason:
        raise HTTPException(404, "Lost reason not found")

    lead.active = False
    lead.lost_reason_id = reason.id
    lead.probability = 0

    # Log in timeline
    interaction = Interaction(
        lead_id=lead.id,
        interaction_type="note",
        body=f"<p>❌ <strong>Oportunidade perdida</strong>: {reason.name}</p>",
        preview=f"Oportunidade perdida: {reason.name}",
        author_id=current_user.user_id,
    )
    db.add(interaction)
    db.commit()

    return {"id": lead.id, "lost": True, "reason": reason.name}
