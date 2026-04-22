"""Notification views — activity-based follow-up reminders."""

from datetime import date

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import Activity, Interaction


@require_http_methods(["GET"])
@org_required
def list_notifications(request, slug):
    org = request.amplex_org
    user = request.amplex_user

    activities = (
        Activity.objects.filter(
            lead__org=org,
            user_id=user["user_id"],
        )
        .select_related("lead")
        .order_by("date_deadline", "id")
    )

    today = date.today()
    items = []
    for a in activities:
        due = a.date_deadline
        state = "planned"
        if due and due < today:
            state = "overdue"
        elif due and due == today:
            state = "today"

        items.append(
            {
                "id": a.id,
                "lead_id": a.lead_id,
                "lead_name": a.lead.name if a.lead else "",
                "summary": a.summary or "",
                "note": a.note or "",
                "date_deadline": due.isoformat() if due else None,
                "state": state,
                "activity_type": a.activity_type or "",
                "user_name": user.get("name", ""),
            }
        )

    return JsonResponse(
        {
            "items": items,
            "badge_count": len(items),
            "overdue_count": sum(1 for i in items if i["state"] == "overdue"),
            "today_count": sum(1 for i in items if i["state"] == "today"),
        }
    )


@require_http_methods(["POST"])
@org_required
def complete_notification(request, slug, activity_id):
    org = request.amplex_org
    user = request.amplex_user

    activity = Activity.objects.filter(
        id=activity_id,
        lead__org=org,
        user_id=user["user_id"],
    ).first()
    if not activity:
        return JsonResponse({"detail": "Not found"}, status=404)

    Interaction.objects.create(
        lead=activity.lead,
        interaction_type="note",
        body=f"<p>Atividade concluída: {activity.summary or activity.activity_type}</p>",
        preview=f"Atividade concluída: {activity.summary or activity.activity_type}",
        author_id=user["user_id"],
    )
    activity.delete()

    return JsonResponse({"completed": True})


@require_http_methods(["DELETE"])
@org_required
def dismiss_notification(request, slug, activity_id):
    org = request.amplex_org
    user = request.amplex_user

    activity = Activity.objects.filter(
        id=activity_id,
        lead__org=org,
        user_id=user["user_id"],
    ).first()
    if not activity:
        return JsonResponse({"detail": "Not found"}, status=404)

    activity.delete()
    return JsonResponse({"dismissed": True})
