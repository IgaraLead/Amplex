"""Cross-product integration routes (Hub, Nexus, Entity proxies)."""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context
from app.config import settings
from app.database import get_db
from app.models import Lead

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/amplex/api/o/{org_id}/crm/integrations", tags=["integrations"]
)


@router.get("")
async def get_integrations(current_user: CurrentUser = Depends(get_org_context)):
    if not settings.hub_api_url or not settings.hub_api_key:
        return {"actions": [], "product_urls": {}}

    slug = settings.hub_client_slug or "demo"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(
                f"{settings.hub_api_url}/api/v1/integrations/{slug}/actions/amplex",
                headers={"X-Api-Key": settings.hub_api_key},
            )
            if resp.is_success:
                return resp.json()
        except httpx.RequestError as exc:
            logger.warning("Hub integrations fetch failed: %s", exc)

    return {"actions": [], "product_urls": {}}


@router.post("/open-conversation")
async def open_nexus_conversation(
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    lead_id = body.get("lead_id")
    if not lead_id:
        raise HTTPException(400, "lead_id required")

    lead = (
        db.query(Lead)
        .filter(Lead.id == int(lead_id), Lead.org_id == current_user.org_id)
        .first()
    )
    if not lead:
        raise HTTPException(404, "Lead not found")

    phone = lead.mobile or lead.phone
    if not phone:
        raise HTTPException(400, "Lead has no phone/mobile number")

    if not settings.nexus_url:
        raise HTTPException(500, "Nexus not configured")

    contact_name = lead.contact_name or (
        lead.contact.name if lead.contact else lead.name
    )
    payload = {
        "phone_number": phone,
        "name": contact_name,
        "email": lead.email_from or "",
        "source": "amplex",
        "source_id": str(lead.id),
    }

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(
                f"{settings.nexus_url}/igaralead/api/conversations/find_or_create",
                json=payload,
                headers={
                    "X-Api-Key": settings.hub_api_key,
                    "Content-Type": "application/json",
                },
            )
            if resp.is_success:
                data = resp.json()
                return {
                    "conversation_url": data.get("conversation_url", ""),
                    "conversation_id": data.get("conversation_id"),
                    "contact_id": data.get("contact_id"),
                }
            raise HTTPException(
                resp.status_code, f"Nexus returned error: {resp.text[:200]}"
            )
        except httpx.RequestError:
            raise HTTPException(502, "Failed to contact Nexus")


@router.post("/enrich-cnpj")
async def enrich_cnpj(
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    lead_id = body.get("lead_id")
    cnpj = body.get("cnpj", "")

    if not cnpj and lead_id:
        lead = (
            db.query(Lead)
            .filter(Lead.id == int(lead_id), Lead.org_id == current_user.org_id)
            .first()
        )
        if lead and lead.contact:
            cnpj = lead.contact.vat or ""

    if not cnpj:
        raise HTTPException(400, "CNPJ not provided and not found on lead")

    if not settings.entity_url:
        raise HTTPException(500, "Entity not configured")

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(
                f"{settings.entity_url}/api/v1/integrations/enrich",
                json={
                    "cnpj": cnpj,
                    "source": "amplex",
                    "source_id": str(lead_id or ""),
                },
                headers={
                    "X-Api-Key": settings.hub_api_key,
                    "Content-Type": "application/json",
                },
            )
            if resp.is_success:
                enriched = resp.json()
                # Store enriched data in lead description
                if lead_id and enriched.get("data"):
                    lead = (
                        db.query(Lead)
                        .filter(
                            Lead.id == int(lead_id), Lead.org_id == current_user.org_id
                        )
                        .first()
                    )
                    if lead:
                        d = enriched["data"]
                        info_parts = []
                        if isinstance(d, dict):
                            from html import escape as _esc
                            for key in [
                                "razao_social",
                                "nome_fantasia",
                                "situacao_cadastral",
                                "porte",
                                "cnae_fiscal_principal",
                                "municipio",
                                "uf",
                                "logradouro",
                                "bairro",
                                "capital_social",
                            ]:
                                if d.get(key):
                                    info_parts.append(f"{key}: {_esc(str(d[key]))}")
                        if info_parts:
                            existing = lead.description or ""
                            separator = (
                                "\n\n--- Dados CNPJ (Entity) ---\n"
                                if existing
                                else "--- Dados CNPJ (Entity) ---\n"
                            )
                            lead.description = (
                                existing + separator + "\n".join(info_parts)
                            )
                            db.commit()
                return enriched
            raise HTTPException(resp.status_code, "Entity returned error")
        except httpx.RequestError:
            raise HTTPException(502, "Failed to contact Entity")


@router.get("/search-lead")
def integration_search_lead(
    phone: str = Query(None),
    email: str = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    if not phone and not email:
        raise HTTPException(400, "phone or email required")

    filters = []
    if phone:
        suffix = phone[-9:].replace("%", "\\%").replace("_", "\\_")
        filters.append(
            or_(
                Lead.phone.ilike(f"%{suffix}%", escape="\\"),
                Lead.mobile.ilike(f"%{suffix}%", escape="\\"),
            )
        )
    if email:
        safe_email = email.replace("%", "\\%").replace("_", "\\_")
        filters.append(Lead.email_from.ilike(safe_email, escape="\\"))

    if len(filters) > 1:
        combined = or_(*filters)
    else:
        combined = filters[0]

    leads = (
        db.query(Lead)
        .filter(combined, Lead.org_id == current_user.org_id)
        .order_by(Lead.updated_at.desc())
        .limit(5)
        .all()
    )

    items = []
    for lead in leads:
        items.append(
            {
                "id": lead.id,
                "name": lead.name,
                "stage_name": lead.stage.name if lead.stage else "",
                "expected_revenue": lead.expected_revenue or 0,
                "contact_name": lead.contact_name or "",
                "email": lead.email_from or "",
                "phone": lead.mobile or lead.phone or "",
                "user_name": lead.user.name if lead.user else "",
                "create_date": lead.created_at,
                "write_date": lead.updated_at,
            }
        )
    return {"leads": items}
