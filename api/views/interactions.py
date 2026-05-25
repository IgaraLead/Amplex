"""Timeline / Interaction views."""

import json
from datetime import datetime, time, timedelta
from html import escape as _esc

from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import Activity, ActivityReminder, Interaction, InteractionFile, Lead
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
ALLOWED_REMINDER_OFFSETS = {60, 120, 360, 1440, 2880, 10080}


def _parse_followup_at(value):
    if not value:
        return None

    parsed = parse_datetime(str(value))
    if parsed is None:
        try:
            parsed_date = datetime.strptime(str(value), "%Y-%m-%d").date()
        except (TypeError, ValueError):
            return None
        parsed = datetime.combine(parsed_date, time.min)

    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _parse_reminder_offsets(value):
    if value in (None, ""):
        return [], None

    raw_offsets = value
    if isinstance(value, str):
        try:
            raw_offsets = json.loads(value)
        except json.JSONDecodeError:
            raw_offsets = [item.strip() for item in value.split(",") if item.strip()]

    if not isinstance(raw_offsets, list | tuple):
        raw_offsets = [raw_offsets]

    offsets = []
    for raw_offset in raw_offsets:
        try:
            offset = int(raw_offset)
        except (TypeError, ValueError):
            return [], "reminder_offsets contém valores inválidos"
        if offset not in ALLOWED_REMINDER_OFFSETS:
            return [], "reminder_offsets contém valores inválidos"
        if offset not in offsets:
            offsets.append(offset)

    return offsets, None


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
        followup_at = request.POST.get("followup_at") or request.POST.get(
            "followup_date", ""
        )
        reminder_offsets = request.POST.getlist("reminder_offsets")
        if len(reminder_offsets) == 1 and reminder_offsets[0].strip().startswith("["):
            reminder_offsets = reminder_offsets[0]
        if not reminder_offsets:
            reminder_offsets = request.POST.get("reminder_offsets")
        uploaded_files = request.FILES.getlist("files")
    else:
        body = json.loads(request.body)
        description = (body.get("description") or "").strip()
        interaction_type = body.get("type", "note")
        followup_at = body.get("followup_at") or body.get("followup_date", "")
        reminder_offsets = body.get("reminder_offsets")
        uploaded_files = []

    if not description:
        return JsonResponse({"detail": "description is required"}, status=400)

    if interaction_type not in VALID_TYPES:
        interaction_type = "note"

    parsed_followup_at = _parse_followup_at(followup_at)
    if followup_at and parsed_followup_at is None:
        return JsonResponse({"detail": "followup_at inválido"}, status=400)

    parsed_offsets, offsets_error = _parse_reminder_offsets(reminder_offsets)
    if offsets_error:
        return JsonResponse({"detail": offsets_error}, status=400)

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
    if parsed_followup_at:
        activity_type = ACTIVITY_TYPE_MAP.get(interaction_type, "todo")
        act = Activity.objects.create(
            lead=lead,
            user_id=lead.user_id or user["user_id"],
            activity_type=activity_type,
            summary=f"Retorno: {label} - {lead.name}",
            note=f"<p>Agendar retorno com o cliente.</p><p>{description[:200]}</p>",
            date_deadline=timezone.localtime(parsed_followup_at).date(),
            due_at=parsed_followup_at,
        )
        ActivityReminder.objects.bulk_create(
            [
                ActivityReminder(
                    activity=act,
                    remind_at=parsed_followup_at - timedelta(minutes=offset),
                    offset_minutes=offset,
                )
                for offset in parsed_offsets
            ]
        )
        scheduled_activity = {
            "id": act.id,
            "summary": act.summary,
            "date_deadline": str(act.date_deadline),
            "due_at": act.due_at.isoformat() if act.due_at else None,
            "reminder_offsets": parsed_offsets,
        }

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
