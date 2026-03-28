"""Service-to-service endpoints for the IgaraLead ecosystem.

All endpoints here are internal-only, protected by X-Api-Key.
Covers: metrics (Hub pull), opportunities (Nexus→Amplex), contacts/import.
"""

import hmac
import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import SharedSessionLocal, get_db
from app.models import Contact, Lead, Organization, Source, Stage, User
from app.shared_models import SharedSubscription

logger = logging.getLogger(__name__)

router = APIRouter(tags=["service-to-service"])

_API_KEY = os.getenv("AMPLEX_SERVICE_API_KEY", "")


def _verify_api_key(x_api_key: str = Header(alias="X-Api-Key", default="")):
    if not _API_KEY or not x_api_key:
        raise HTTPException(status_code=401, detail="API key ausente")
    if not hmac.compare_digest(x_api_key, _API_KEY):
        raise HTTPException(status_code=401, detail="API key inválida")


# ── GET /amplex/metrics ──────────────────────────────────────────────


@router.get("/amplex/metrics", dependencies=[Depends(_verify_api_key)])
def metrics(db: Session = Depends(get_db)):
    """Aggregated Amplex metrics for Hub pull."""
    won_ids = (
        db.query(Stage.id)
        .filter(Stage.is_won.is_(True))
        .subquery()
    )

    total_leads = (
        db.query(func.count(Lead.id))
        .filter(Lead.active.is_(True), Lead.type == "lead")
        .scalar() or 0
    )
    total_opps = (
        db.query(func.count(Lead.id))
        .filter(Lead.active.is_(True), Lead.type == "opportunity")
        .scalar() or 0
    )
    won = (
        db.query(func.count(Lead.id))
        .filter(Lead.active.is_(True), Lead.stage_id.in_(won_ids.select()))
        .scalar() or 0
    )
    lost = (
        db.query(func.count(Lead.id))
        .filter(Lead.active.is_(False), Lead.probability == 0)
        .scalar() or 0
    )
    expected_revenue = (
        db.query(func.coalesce(func.sum(Lead.expected_revenue), 0))
        .filter(Lead.active.is_(True))
        .scalar()
    )
    prorated_revenue = (
        db.query(
            func.coalesce(
                func.sum(Lead.expected_revenue * Lead.probability / 100), 0
            )
        )
        .filter(Lead.active.is_(True))
        .scalar()
    )

    stages = (
        db.query(Stage.id, Stage.name, Stage.is_won, func.count(Lead.id))
        .outerjoin(Lead, (Lead.stage_id == Stage.id) & Lead.active.is_(True))
        .group_by(Stage.id)
        .order_by(Stage.sequence)
        .all()
    )

    contacts_persons = (
        db.query(func.count(Contact.id))
        .filter(Contact.active.is_(True), Contact.is_company.is_(False))
        .scalar() or 0
    )
    contacts_companies = (
        db.query(func.count(Contact.id))
        .filter(Contact.active.is_(True), Contact.is_company.is_(True))
        .scalar() or 0
    )

    active_users = (
        db.query(func.count(User.id))
        .filter(User.active.is_(True))
        .scalar() or 0
    )

    # Active subscriptions from shared DB
    shared_db = SharedSessionLocal()
    try:
        active_subs = (
            shared_db.query(func.count(SharedSubscription.id))
            .filter(
                SharedSubscription.status == "active",
                SharedSubscription.amplex_users > 0,
            )
            .scalar() or 0
        )
    finally:
        shared_db.close()

    return {
        "pipeline": {
            "total_leads": total_leads,
            "total_opportunities": total_opps,
            "won": won,
            "lost": lost,
            "expected_revenue": float(expected_revenue),
            "prorated_revenue": float(prorated_revenue),
        },
        "stages": [
            {"id": s[0], "name": s[1], "is_won": s[2], "count": s[3]}
            for s in stages
        ],
        "contacts": {"persons": contacts_persons, "companies": contacts_companies},
        "active_users": active_users,
        "active_subscriptions": active_subs,
    }


# ── POST /amplex/api/opportunities ───────────────────────────────────


class OpportunityIn(BaseModel):
    name: str
    contact_name: str | None = None
    email_from: str | None = None
    phone: str | None = None
    expected_revenue: float = 0
    source: str | None = None
    source_id: str | None = None
    cnpj: str | None = None
    org_hub_id: str | None = None


@router.post("/amplex/api/opportunities", dependencies=[Depends(_verify_api_key)])
def create_opportunity(
    body: OpportunityIn,
    db: Session = Depends(get_db),
):
    """Create an opportunity from another product (e.g. Nexus conversation)."""
    # Resolve organization
    org = None
    if body.org_hub_id:
        org = (
            db.query(Organization)
            .filter(Organization.hub_org_id == body.org_hub_id)
            .first()
        )
    if not org:
        org = db.query(Organization).first()
    if not org:
        raise HTTPException(400, "Nenhuma organização configurada")

    # Find or create contact
    contact = None
    if body.email_from:
        contact = (
            db.query(Contact)
            .filter(Contact.email == body.email_from, Contact.org_id == org.id)
            .first()
        )
    if not contact and body.phone:
        contact = (
            db.query(Contact)
            .filter(Contact.phone == body.phone, Contact.org_id == org.id)
            .first()
        )
    if not contact:
        contact = Contact(
            org_id=org.id,
            name=body.contact_name or body.name,
            email=body.email_from,
            phone=body.phone,
            vat=body.cnpj,
        )
        db.add(contact)
        db.flush()

    # Resolve or create source
    source = None
    if body.source:
        source = (
            db.query(Source)
            .filter(Source.org_id == org.id, Source.name == body.source)
            .first()
        )
        if not source:
            source = Source(org_id=org.id, name=body.source)
            db.add(source)
            db.flush()

    # Get first stage
    first_stage = (
        db.query(Stage)
        .filter(Stage.org_id == org.id, Stage.is_won.is_(False))
        .order_by(Stage.sequence)
        .first()
    )

    src_label = body.source or "integração"
    ref_label = body.source_id or "-"

    lead = Lead(
        org_id=org.id,
        name=body.name,
        type="opportunity",
        contact_name=body.contact_name,
        email_from=body.email_from,
        phone=body.phone,
        expected_revenue=body.expected_revenue,
        contact_id=contact.id,
        source_id=source.id if source else None,
        stage_id=first_stage.id if first_stage else None,
        description=f"Criado via {src_label}. Ref: {ref_label}",
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    return {
        "id": lead.id,
        "name": lead.name,
        "stage": first_stage.name if first_stage else None,
        "partner_id": contact.id,
        "url": f"/amplex/o/{org.id}/crm/opportunities/{lead.id}",
    }


# ── POST /amplex/api/contacts/import ─────────────────────────────────


class ContactImportItem(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    cnpj: str | None = None
    city: str | None = None
    state: str | None = None
    is_company: bool = False


class ContactImportIn(BaseModel):
    org_hub_id: str | None = None
    contacts: list[ContactImportItem]


@router.post("/amplex/api/contacts/import", dependencies=[Depends(_verify_api_key)])
def import_contacts(body: ContactImportIn, db: Session = Depends(get_db)):
    """Import contacts from another product (e.g. Entity enriched export)."""
    org = None
    if body.org_hub_id:
        org = (
            db.query(Organization)
            .filter(Organization.hub_org_id == body.org_hub_id)
            .first()
        )
    if not org:
        org = db.query(Organization).first()
    if not org:
        raise HTTPException(400, "Nenhuma organização configurada")

    created = 0
    updated = 0
    for item in body.contacts:
        existing = None
        if item.email:
            existing = (
                db.query(Contact)
                .filter(Contact.email == item.email, Contact.org_id == org.id)
                .first()
            )
        if not existing and item.cnpj:
            existing = (
                db.query(Contact)
                .filter(Contact.vat == item.cnpj, Contact.org_id == org.id)
                .first()
            )

        if existing:
            if item.name:
                existing.name = item.name
            if item.phone:
                existing.phone = item.phone
            if item.city:
                existing.city = item.city
            if item.state:
                existing.state_name = item.state
            if item.cnpj:
                existing.vat = item.cnpj
            existing.is_company = item.is_company
            updated += 1
        else:
            contact = Contact(
                org_id=org.id,
                name=item.name,
                email=item.email,
                phone=item.phone,
                vat=item.cnpj,
                city=item.city,
                state_name=item.state,
                is_company=item.is_company,
            )
            db.add(contact)
            created += 1

    db.commit()
    return {"created": created, "updated": updated, "total": created + updated}
