"""Custom field definition and lead-value routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context, require_org_admin
from app.database import get_db
from app.models import CustomField, CustomFieldValue, Lead

router = APIRouter(prefix="/amplex/api/o/{org_id}/crm", tags=["custom-fields"])

VALID_FIELD_TYPES = ("text", "number", "date", "select", "checkbox")


# ── Global definitions ──


@router.get("/custom-fields")
def list_custom_fields(
    db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_org_context)
):
    fields = (
        db.query(CustomField)
        .filter(CustomField.active.is_(True), CustomField.org_id == current_user.org_id)
        .all()
    )
    return {
        "items": [
            {
                "id": f.id,
                "name": f.name,
                "field_type": f.field_type,
                "options": f.options or "",
                "sequence": f.sequence,
                "required": f.required,
            }
            for f in fields
        ]
    }


@router.post("/custom-fields", status_code=201)
def create_custom_field(
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    name = (body.get("name") or "").strip()
    field_type = body.get("field_type", "text")
    if not name:
        raise HTTPException(400, "name is required")
    if field_type not in VALID_FIELD_TYPES:
        field_type = "text"

    cf = CustomField(
        name=name,
        org_id=current_user.org_id,
        field_type=field_type,
        options=body.get("options", ""),
        required=body.get("required", False),
    )
    db.add(cf)
    db.commit()
    db.refresh(cf)
    return {"id": cf.id, "name": cf.name, "field_type": cf.field_type}


@router.put("/custom-fields/{field_id}")
def update_custom_field(
    field_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    cf = (
        db.query(CustomField)
        .filter(CustomField.id == field_id, CustomField.org_id == current_user.org_id)
        .first()
    )
    if not cf:
        raise HTTPException(404, "Not found")

    if "name" in body:
        cf.name = body["name"]
    if "field_type" in body:
        cf.field_type = body["field_type"]
    if "options" in body:
        cf.options = body["options"]
    if "required" in body:
        cf.required = body["required"]

    db.commit()
    db.refresh(cf)
    return {"id": cf.id, "name": cf.name, "field_type": cf.field_type}


@router.delete("/custom-fields/{field_id}")
def delete_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    cf = (
        db.query(CustomField)
        .filter(CustomField.id == field_id, CustomField.org_id == current_user.org_id)
        .first()
    )
    if not cf:
        raise HTTPException(404, "Not found")

    cf.active = False
    db.commit()
    return {"deleted": True}


# ── Lead-scoped values ──


@router.get("/leads/{lead_id}/custom-fields")
def list_lead_custom_fields(
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

    values = (
        db.query(CustomFieldValue).filter(CustomFieldValue.lead_id == lead.id).all()
    )
    return {
        "items": [
            {
                "id": v.id,
                "field_id": v.field_id,
                "field_name": v.field_name,
                "field_type": v.field_type,
                "value": v.value or "",
                "sequence": v.sequence,
            }
            for v in values
        ]
    }


@router.post("/leads/{lead_id}/custom-fields")
def set_lead_custom_field(
    lead_id: int,
    body: dict,
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

    field_id = body.get("field_id")
    value = body.get("value", "")

    if not field_id:
        raise HTTPException(400, "field_id is required")

    definition = (
        db.query(CustomField)
        .filter(
            CustomField.id == int(field_id), CustomField.org_id == current_user.org_id
        )
        .first()
    )
    if not definition:
        raise HTTPException(404, "Field definition not found")

    existing = (
        db.query(CustomFieldValue)
        .filter(
            CustomFieldValue.lead_id == lead.id,
            CustomFieldValue.field_id == definition.id,
        )
        .first()
    )
    if existing:
        existing.value = value
        db.commit()
        db.refresh(existing)
        rec = existing
    else:
        rec = CustomFieldValue(
            lead_id=lead.id,
            field_id=definition.id,
            field_name=definition.name,
            field_type=definition.field_type,
            value=value,
            sequence=definition.sequence,
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)

    return {
        "id": rec.id,
        "field_id": rec.field_id,
        "field_name": rec.field_name,
        "field_type": rec.field_type,
        "value": rec.value or "",
    }


@router.delete("/leads/{lead_id}/custom-fields/{value_id}")
def delete_lead_custom_field(
    lead_id: int,
    value_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    rec = (
        db.query(CustomFieldValue)
        .filter(
            CustomFieldValue.id == value_id,
            CustomFieldValue.lead_id == lead_id,
        )
        .first()
    )
    if not rec:
        raise HTTPException(404, "Not found")

    db.delete(rec)
    db.commit()
    return {"deleted": True}
