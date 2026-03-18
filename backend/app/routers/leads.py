"""Lead CRUD routes."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user, require_admin
from app.database import get_db
from app.models import Lead, Contact, Stage, Tag, User, LostReason, Interaction

router = APIRouter(prefix="/amplex/api/crm", tags=["leads"])


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
    current_user: CurrentUser = Depends(get_current_user),
):
    offset = (page - 1) * limit
    filters = [Lead.active.is_(True)]

    if current_user.role != "admin":
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
        "items": [_lead_list_item(l) for l in leads],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total else 0,
    }


@router.post("/leads", status_code=201)
def create_lead(
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    name = (body.get("name") or "").strip()
    if not name:
        from fastapi import HTTPException
        raise HTTPException(400, "name is required")

    lead = Lead(
        name=name,
        type=body.get("type", "opportunity"),
        contact_name=body.get("contact_name", ""),
        email_from=body.get("email_from", ""),
        phone=body.get("phone", ""),
        expected_revenue=body.get("expected_revenue", 0),
        description=body.get("description", ""),
        priority=body.get("priority", "0"),
        function=body.get("function", ""),
        user_id=current_user.user_id,
    )

    if body.get("source_id"):
        lead.source_id = int(body["source_id"])
    if body.get("stage_id"):
        lead.stage_id = int(body["stage_id"])
    else:
        first_stage = db.query(Stage).order_by(Stage.sequence).first()
        if first_stage:
            lead.stage_id = first_stage.id

    # Link existing contact
    if body.get("partner_id"):
        lead.contact_id = int(body["partner_id"])
    elif body.get("email_from") or body.get("phone"):
        contact = None
        if body.get("email_from"):
            contact = db.query(Contact).filter(Contact.email == body["email_from"]).first()
        if not contact and body.get("phone"):
            contact = db.query(Contact).filter(Contact.phone == body["phone"]).first()
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
def get_lead(lead_id: int, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")

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
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")

    writable = [
        "name", "type", "contact_name", "email_from", "phone",
        "expected_revenue", "probability", "priority", "description",
        "street", "city", "date_deadline", "function",
    ]
    for field in writable:
        if field in body:
            setattr(lead, field, body[field])

    if "stage_id" in body:
        lead.stage_id = int(body["stage_id"]) if body["stage_id"] else None
    if "partner_id" in body:
        lead.contact_id = int(body["partner_id"]) if body["partner_id"] else None
    if "user_id" in body:
        lead.user_id = int(body["user_id"]) if body["user_id"] else None
    if "source_id" in body:
        lead.source_id = int(body["source_id"]) if body["source_id"] else None
    if "tag_ids" in body:
        tag_objs = db.query(Tag).filter(Tag.id.in_(body["tag_ids"])).all()
        lead.tags = tag_objs

    db.commit()
    db.refresh(lead)

    return {"id": lead.id, "name": lead.name, "stage_name": lead.stage.name if lead.stage else ""}


@router.delete("/leads/{lead_id}")
def delete_lead(lead_id: int, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")

    lead.active = False
    db.commit()
    return {"id": lead.id, "archived": True}


@router.post("/leads/{lead_id}/move")
def move_lead(
    lead_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    from fastapi import HTTPException

    stage_id = body.get("stage_id")
    if not stage_id:
        raise HTTPException(400, "stage_id is required")

    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Not found")

    stage = db.query(Stage).filter(Stage.id == int(stage_id)).first()
    if not stage:
        raise HTTPException(404, "Stage not found")

    lead.stage_id = stage.id
    db.commit()

    return {"id": lead.id, "name": lead.name, "stage_id": stage.id, "stage_name": stage.name}


@router.post("/leads/{lead_id}/transfer")
def transfer_lead(
    lead_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    from fastapi import HTTPException

    new_user_id = body.get("user_id")
    if not new_user_id:
        raise HTTPException(400, "user_id is required")

    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Not found")

    new_user = db.query(User).filter(User.id == int(new_user_id)).first()
    if not new_user:
        raise HTTPException(404, "User not found")

    old_user_name = lead.user.name if lead.user else "Ninguém"
    lead.user_id = new_user.id

    # Log transfer in timeline
    interaction = Interaction(
        lead_id=lead.id,
        interaction_type="note",
        body=f"<p>🔄 <strong>Lead transferido</strong> de {old_user_name} para {new_user.name}</p>",
        preview=f"Lead transferido de {old_user_name} para {new_user.name}",
        author_id=current_user.user_id,
    )
    db.add(interaction)
    db.commit()

    return {"id": lead.id, "user_id": new_user.id, "user_name": new_user.name}


@router.post("/leads/{lead_id}/lost")
def mark_lead_lost(
    lead_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    from fastapi import HTTPException

    reason_id = body.get("lost_reason_id")
    if not reason_id:
        raise HTTPException(400, "lost_reason_id is required")

    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Not found")

    reason = db.query(LostReason).filter(LostReason.id == int(reason_id)).first()
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
