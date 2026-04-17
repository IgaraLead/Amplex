"""Timeline / Interaction views."""

import json
from html import escape as _esc

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import Activity, Interaction, InteractionFile, Lead
from api.storage import upload_bytes

VALID_TYPES = ("phone", "email", "whatsapp", "meeting", "visit", "note")
TYPE_LABELS = {
    "phone": "📞 Ligação",
    "email": "📧 E-mail",
    "whatsapp": "💬 WhatsApp",
    "meeting": "🤝 Reunião",
    "visit": "🏢 Visita",
    "note": "📝 Nota",
}
ACTIVITY_TYPE_MAP = {"phone": "phone", "email": "email", "meeting": "meeting"}


@require_http_methods(["GET"])
@org_required
def list_interactions(request, slug, lead_id):
    org = request.amplex_org
    lead = Lead.objects.filter(id=lead_id, org=org).first()
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)

    interactions = (
        Interaction.objects.filter(lead=lead)
        .select_related("author")
        .prefetch_related("files")
        .order_by("-created_at")[:100]
    )

    items = []
    for inter in interactions:
        items.append(
            {
                "id": inter.id,
                "type": inter.interaction_type,
                "body": inter.body or "",
                "preview": inter.preview or "",
                "date": inter.created_at,
                "author_name": inter.author.name if inter.author else "",
                "author_id": inter.author_id,
                "attachments": [
                    {"id": f.id, "name": f.filename, "size": f.file_size}
                    for f in inter.files.all()
                ],
            }
        )

    return JsonResponse({"items": items, "total": len(items)})


@require_http_methods(["POST"])
@org_required
def create_interaction(request, slug, lead_id):
    user = request.amplex_user
    org = request.amplex_org

    lead = Lead.objects.filter(id=lead_id, org=org).first()
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)

    content_type = request.content_type or ""

    if "multipart/form-data" in content_type:
        description = (request.POST.get("description") or "").strip()
        interaction_type = request.POST.get("type", "note")
        followup_date = request.POST.get("followup_date", "")
        uploaded_files = request.FILES.getlist("files")
    else:
        body = json.loads(request.body)
        description = (body.get("description") or "").strip()
        interaction_type = body.get("type", "note")
        followup_date = body.get("followup_date", "")
        uploaded_files = []

    if not description:
        return JsonResponse({"detail": "description is required"}, status=400)

    if interaction_type not in VALID_TYPES:
        interaction_type = "note"

    label = TYPE_LABELS.get(interaction_type, "📝 Nota")
    html_body = f"<p><strong>{_esc(label)}</strong></p><p>{_esc(description)}</p>"

    interaction = Interaction.objects.create(
        lead=lead,
        interaction_type=interaction_type,
        body=html_body,
        preview=description[:500],
        author_id=user["user_id"],
    )

    for f in uploaded_files:
        file_data = f.read()
        filename = f.name
        mimetype = f.content_type or "application/octet-stream"
        import uuid

        storage_path = f"interactions/{uuid.uuid4().hex}/{filename}"
        upload_bytes(storage_path, file_data, mimetype)
        InteractionFile.objects.create(
            interaction=interaction,
            filename=filename,
            storage_path=storage_path,
            file_size=len(file_data),
            mimetype=mimetype,
        )

    scheduled_activity = None
    if followup_date:
        try:
            from datetime import datetime

            parsed_date = datetime.strptime(followup_date, "%Y-%m-%d").date()
            activity_type = ACTIVITY_TYPE_MAP.get(interaction_type, "todo")
            act = Activity.objects.create(
                lead=lead,
                user_id=lead.user_id or user["user_id"],
                activity_type=activity_type,
                summary=f"Retorno: {label} - {lead.name}",
                note=f"<p>Agendar retorno com o cliente.</p><p>{description[:200]}</p>",
                date_deadline=parsed_date,
            )
            scheduled_activity = {
                "id": act.id,
                "summary": act.summary,
                "date_deadline": str(act.date_deadline),
            }
        except (ValueError, TypeError):
            pass

    result = {
        "id": interaction.id,
        "type": interaction.interaction_type,
        "body": interaction.body,
        "date": interaction.created_at,
        "author_name": interaction.author.name if interaction.author else "",
        "attachments": [
            {"id": f.id, "name": f.filename, "size": f.file_size}
            for f in interaction.files.all()
        ],
    }
    if scheduled_activity:
        result["scheduled_activity"] = scheduled_activity

    return JsonResponse(result, status=201)
