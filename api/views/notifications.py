"""Notification views — activity-based follow-up reminders."""

from datetime import date

from django.http import JsonResponse
from django.utils import timezone
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
            assigned_to_id=user["user_id"],
            completed=False,
            dismissed=False,
        )
        .select_related("lead")
        .order_by("due_date")
    )

    today = date.today()
    items = []
    for a in activities:
        due = a.due_date
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
                "type": a.type,
                "description": a.description or "",
                "due_date": due.isoformat() if due else None,
                "state": state,
            }
        )

    return JsonResponse({"items": items})


@require_http_methods(["POST"])
@org_required
def complete_notification(request, slug, activity_id):
    org = request.amplex_org
    user = request.amplex_user

    activity = Activity.objects.filter(
        id=activity_id,
        lead__org=org,
        assigned_to_id=user["user_id"],
    ).first()
    if not activity:
        return JsonResponse({"detail": "Not found"}, status=404)

    activity.completed = True
    activity.completed_at = timezone.now()
    activity.save(update_fields=["completed", "completed_at"])

    Interaction.objects.create(
        lead=activity.lead,
        type="activity_completed",
        notes=f"Completed: {activity.type} — {activity.description or ''}",
        author_id=user["user_id"],
    )

    return JsonResponse({"completed": True})


@require_http_methods(["DELETE"])
@org_required
def dismiss_notification(request, slug, activity_id):
    org = request.amplex_org
    user = request.amplex_user

    activity = Activity.objects.filter(
        id=activity_id,
        lead__org=org,
        assigned_to_id=user["user_id"],
    ).first()
    if not activity:
        return JsonResponse({"detail": "Not found"}, status=404)

    activity.dismissed = True
    activity.save(update_fields=["dismissed"])
    return JsonResponse({"dismissed": True})
