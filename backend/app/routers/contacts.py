"""Contact routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context
from app.database import get_db
from app.models import Contact, Lead

router = APIRouter(prefix="/amplex/api/o/{org_id}/crm", tags=["contacts"])


@router.get("/contacts")
def list_contacts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(None),
    type: str = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    offset = (page - 1) * limit
    filters = [Contact.active.is_(True), Contact.org_id == current_user.org_id]

    if type == "company":
        filters.append(Contact.is_company.is_(True))
    elif type == "person":
        filters.append(Contact.is_company.is_(False))

    if search:
        filters.append(
            or_(
                Contact.name.ilike(f"%{search}%"),
                Contact.email.ilike(f"%{search}%"),
                Contact.phone.ilike(f"%{search}%"),
            )
        )

    total = db.query(Contact).filter(*filters).count()
    contacts = (
        db.query(Contact)
        .filter(*filters)
        .order_by(Contact.name)
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = []
    for c in contacts:
        opp_count = (
            db.query(func.count(Lead.id))
            .filter(
                Lead.contact_id == c.id,
                Lead.active.is_(True),
                Lead.org_id == current_user.org_id,
            )
            .scalar()
            or 0
        )
        items.append(
            {
                "id": c.id,
                "name": c.name,
                "email": c.email or "",
                "phone": c.phone or "",
                "mobile": c.mobile or "",
                "is_company": c.is_company,
                "city": c.city or "",
                "state": c.state_name or "",
                "opportunity_count": opp_count,
            }
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total else 0,
    }


@router.post("/contacts", status_code=201)
def create_contact(
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name is required")

    contact = Contact(
        name=name,
        org_id=current_user.org_id,
        email=body.get("email", ""),
        phone=body.get("phone", ""),
        mobile=body.get("mobile", ""),
        is_company=body.get("is_company", False),
        street=body.get("street", ""),
        city=body.get("city", ""),
        vat=body.get("cnpj", ""),
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)

    return {"id": contact.id, "name": contact.name}


@router.get("/contacts/{contact_id}")
def get_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    contact = (
        db.query(Contact)
        .filter(Contact.id == contact_id, Contact.org_id == current_user.org_id)
        .first()
    )
    if not contact:
        raise HTTPException(404, "Not found")

    return {
        "id": contact.id,
        "name": contact.name,
        "email": contact.email or "",
        "phone": contact.phone or "",
        "mobile": contact.mobile or "",
        "is_company": contact.is_company,
        "street": contact.street or "",
        "street2": contact.street2 or "",
        "city": contact.city or "",
        "state_id": None,
        "state_name": contact.state_name or "",
        "country_id": None,
        "country_name": contact.country_name or "",
        "vat": contact.vat or "",
        "website": contact.website or "",
        "comment": contact.comment or "",
    }
