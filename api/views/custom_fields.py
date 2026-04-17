"""Custom field views."""

import json

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required, org_required
from api.models import CustomField, CustomFieldValue, Lead

VALID_FIELD_TYPES = ("text", "number", "date", "select", "checkbox")


@require_http_methods(["GET"])
@org_required
def list_custom_fields(request, slug):
    org = request.amplex_org
    fields = CustomField.objects.filter(active=True, org=org)
    return JsonResponse(
        {
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
    )


@require_http_methods(["POST"])
@org_admin_required
def create_custom_field(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)

    name = (body.get("name") or "").strip()
    field_type = body.get("field_type", "text")
    if not name:
        return JsonResponse({"detail": "name is required"}, status=400)
    if field_type not in VALID_FIELD_TYPES:
        field_type = "text"

    cf = CustomField.objects.create(
        name=name,
        org=org,
        field_type=field_type,
        options=body.get("options", ""),
        required=body.get("required", False),
    )
    return JsonResponse(
        {"id": cf.id, "name": cf.name, "field_type": cf.field_type}, status=201
    )


@require_http_methods(["PUT"])
@org_admin_required
def update_custom_field(request, slug, field_id):
    org = request.amplex_org
    body = json.loads(request.body)

    cf = CustomField.objects.filter(id=field_id, org=org).first()
    if not cf:
        return JsonResponse({"detail": "Not found"}, status=404)

    if "name" in body:
        cf.name = body["name"]
    if "field_type" in body:
        cf.field_type = body["field_type"]
    if "options" in body:
        cf.options = body["options"]
    if "required" in body:
        cf.required = body["required"]

    cf.save()
    return JsonResponse({"id": cf.id, "name": cf.name, "field_type": cf.field_type})


@require_http_methods(["DELETE"])
@org_admin_required
def delete_custom_field(request, slug, field_id):
    org = request.amplex_org
    cf = CustomField.objects.filter(id=field_id, org=org).first()
    if not cf:
        return JsonResponse({"detail": "Not found"}, status=404)

    cf.active = False
    cf.save(update_fields=["active"])
    return JsonResponse({"deleted": True})


@require_http_methods(["GET"])
@org_required
def list_lead_custom_fields(request, slug, lead_id):
    org = request.amplex_org
    lead = Lead.objects.filter(id=lead_id, org=org).first()
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)

    values = CustomFieldValue.objects.filter(lead=lead)
    return JsonResponse(
        {
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
    )


@require_http_methods(["POST"])
@org_required
def set_lead_custom_field(request, slug, lead_id):
    org = request.amplex_org
    body = json.loads(request.body)

    lead = Lead.objects.filter(id=lead_id, org=org).first()
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)

    field_id = body.get("field_id")
    value = body.get("value", "")
    if not field_id:
        return JsonResponse({"detail": "field_id is required"}, status=400)

    definition = CustomField.objects.filter(id=int(field_id), org=org).first()
    if not definition:
        return JsonResponse({"detail": "Field definition not found"}, status=404)

    existing = CustomFieldValue.objects.filter(lead=lead, field=definition).first()

    if existing:
        existing.value = value
        existing.save(update_fields=["value"])
        rec = existing
    else:
        rec = CustomFieldValue.objects.create(
            lead=lead,
            field=definition,
            field_name=definition.name,
            field_type=definition.field_type,
            value=value,
            sequence=definition.sequence,
        )

    return JsonResponse(
        {
            "id": rec.id,
            "field_id": rec.field_id,
            "field_name": rec.field_name,
            "field_type": rec.field_type,
            "value": rec.value or "",
        }
    )


@require_http_methods(["DELETE"])
@org_required
def delete_lead_custom_field(request, slug, lead_id, value_id):
    rec = CustomFieldValue.objects.filter(id=value_id, lead_id=lead_id).first()
    if not rec:
        return JsonResponse({"detail": "Not found"}, status=404)

    rec.delete()
    return JsonResponse({"deleted": True})
