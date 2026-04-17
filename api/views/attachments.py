"""Attachment views."""

import json
import os
import uuid

from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import Lead, LeadAttachment
from api.storage import delete_object, download_bytes, upload_bytes

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIMETYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/zip",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "text/plain",
    "text/csv",
}


def _attachment_dict(att):
    return {
        "id": att.id,
        "lead_id": att.lead_id,
        "filename": att.filename,
        "content_type": att.content_type,
        "size": att.size,
        "description": att.description or "",
        "uploaded_by_id": att.uploaded_by_id,
        "created_at": att.created_at.isoformat() if att.created_at else None,
    }


@require_http_methods(["GET"])
@org_required
def list_attachments(request, slug, lead_id):
    org = request.amplex_org
    lead = Lead.objects.filter(id=lead_id, org=org).first()
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)

    atts = LeadAttachment.objects.filter(lead=lead).order_by("-created_at")
    return JsonResponse({"items": [_attachment_dict(a) for a in atts]})


@require_http_methods(["POST"])
@org_required
def upload_attachment(request, slug, lead_id):
    org = request.amplex_org
    user = request.amplex_user

    lead = Lead.objects.filter(id=lead_id, org=org).first()
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)

    file = request.FILES.get("file")
    if not file:
        return JsonResponse({"detail": "file is required"}, status=400)

    if file.size > MAX_FILE_SIZE:
        return JsonResponse({"detail": "File too large (max 10 MB)"}, status=400)

    ct = file.content_type or "application/octet-stream"
    if ct not in ALLOWED_MIMETYPES:
        return JsonResponse({"detail": f"MIME type {ct} not allowed"}, status=400)

    ext = file.name.rsplit(".", 1)[-1] if "." in file.name else ""
    key = f"amplex/{org.id}/attachments/{uuid.uuid4().hex}.{ext}"
    content = file.read()

    upload_bytes(key, content, ct)

    # Sanitize filename: strip directory components
    safe_filename = os.path.basename(file.name)[:255]

    att = LeadAttachment.objects.create(
        lead=lead,
        filename=safe_filename,
        storage_key=key,
        content_type=ct,
        size=len(content),
        description=request.POST.get("description", ""),
        uploaded_by_id=user["user_id"],
    )
    return JsonResponse(_attachment_dict(att), status=201)


@require_http_methods(["PUT"])
@org_required
def update_attachment(request, slug, lead_id, attachment_id):
    org = request.amplex_org
    body = json.loads(request.body)

    att = LeadAttachment.objects.filter(
        id=attachment_id, lead_id=lead_id, lead__org=org
    ).first()
    if not att:
        return JsonResponse({"detail": "Not found"}, status=404)

    if "description" in body:
        att.description = body["description"]
        att.save(update_fields=["description"])

    return JsonResponse(_attachment_dict(att))


@require_http_methods(["DELETE"])
@org_required
def delete_attachment(request, slug, lead_id, attachment_id):
    org = request.amplex_org

    att = LeadAttachment.objects.filter(
        id=attachment_id, lead_id=lead_id, lead__org=org
    ).first()
    if not att:
        return JsonResponse({"detail": "Not found"}, status=404)

    delete_object(att.storage_key)
    att.delete()
    return JsonResponse({"deleted": True})


@require_http_methods(["GET"])
@org_required
def download_attachment(request, slug, lead_id, attachment_id):
    org = request.amplex_org

    att = LeadAttachment.objects.filter(
        id=attachment_id, lead_id=lead_id, lead__org=org
    ).first()
    if not att:
        return JsonResponse({"detail": "Not found"}, status=404)

    data = download_bytes(att.storage_key)
    if data is None:
        return JsonResponse({"detail": "File not found in storage"}, status=404)

    resp = HttpResponse(data, content_type=att.content_type)
    resp["Content-Disposition"] = f'attachment; filename="{att.filename}"'
    return resp
