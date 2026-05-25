"""Notification views — activity-based follow-up reminders."""

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import Activity, ActivityReminder, Interaction


def _parse_notification_id(notification_id):
    raw_id = str(notification_id)
    if raw_id.startswith("reminder-"):
        raw_id = raw_id.removeprefix("reminder-")
        notification_type = "reminder"
    elif raw_id.startswith("activity-"):
        raw_id = raw_id.removeprefix("activity-")
        notification_type = "activity"
    else:
        notification_type = "legacy"

    try:
        return notification_type, int(raw_id)
    except ValueError:
        return notification_type, None


def _notification_state(*, due_at, date_deadline):
    today = timezone.localdate()
    due_date = timezone.localtime(due_at).date() if due_at else date_deadline

    if due_date and due_date < today:
        return "overdue"
    if due_date and due_date == today:
        return "today"
    return "planned"


def _serialize_activity(activity, user):
    due = activity.date_deadline
    return {
        "id": f"activity-{activity.id}",
        "lead_id": activity.lead_id,
        "lead_name": activity.lead.name if activity.lead else "",
        "summary": activity.summary or "",
        "note": activity.note or "",
        "date_deadline": due.isoformat() if due else None,
        "due_at": None,
        "remind_at": None,
        "offset_minutes": None,
        "state": _notification_state(due_at=None, date_deadline=due),
        "activity_type": activity.activity_type or "",
        "user_name": user.get("name", ""),
    }


def _serialize_reminder(reminder, user):
    activity = reminder.activity
    due = activity.date_deadline
    return {
        "id": f"reminder-{reminder.id}",
        "lead_id": activity.lead_id,
        "lead_name": activity.lead.name if activity.lead else "",
        "summary": activity.summary or "",
        "note": activity.note or "",
        "date_deadline": due.isoformat() if due else None,
        "due_at": activity.due_at.isoformat() if activity.due_at else None,
        "remind_at": reminder.remind_at.isoformat(),
        "offset_minutes": reminder.offset_minutes,
        "state": _notification_state(
            due_at=activity.due_at,
            date_deadline=due,
        ),
        "activity_type": activity.activity_type or "",
        "user_name": user.get("name", ""),
    }


@require_http_methods(["GET"])
@org_required
def list_notifications(request, slug):
    org = request.amplex_org
    user = request.amplex_user

    now = timezone.now()
    reminders = (
        ActivityReminder.objects.filter(
            activity__lead__org=org,
            activity__user_id=user["user_id"],
            dismissed_at__isnull=True,
            remind_at__lte=now,
        )
        .select_related("activity", "activity__lead")
        .order_by("remind_at", "id")
    )
    legacy_activities = (
        Activity.objects.filter(
            lead__org=org,
            user_id=user["user_id"],
            due_at__isnull=True,
        )
        .select_related("lead")
        .order_by("date_deadline", "id")
    )

    items = [_serialize_reminder(reminder, user) for reminder in reminders]
    items.extend(_serialize_activity(activity, user) for activity in legacy_activities)

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
def complete_notification(request, slug, notification_id):
    org = request.amplex_org
    user = request.amplex_user
    notification_type, object_id = _parse_notification_id(notification_id)

    reminder = None
    if notification_type in ("reminder", "legacy"):
        reminder = (
            ActivityReminder.objects.filter(
                id=object_id,
                activity__lead__org=org,
                activity__user_id=user["user_id"],
                dismissed_at__isnull=True,
            )
            .select_related("activity", "activity__lead")
            .first()
        )
    activity = reminder.activity if reminder else None
    if activity is None and notification_type in ("activity", "legacy"):
        activity = Activity.objects.filter(
            id=object_id,
            lead__org=org,
            user_id=user["user_id"],
            due_at__isnull=True,
        ).first()
    if activity is None:
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
def dismiss_notification(request, slug, notification_id):
    org = request.amplex_org
    user = request.amplex_user
    notification_type, object_id = _parse_notification_id(notification_id)

    reminder = None
    if notification_type in ("reminder", "legacy"):
        reminder = ActivityReminder.objects.filter(
            id=object_id,
            activity__lead__org=org,
            activity__user_id=user["user_id"],
            dismissed_at__isnull=True,
        ).first()
    if reminder:
        reminder.dismissed_at = timezone.now()
        reminder.save(update_fields=["dismissed_at"])
        return JsonResponse({"dismissed": True})

    if notification_type == "reminder":
        return JsonResponse({"detail": "Not found"}, status=404)

    activity = Activity.objects.filter(
        id=object_id,
        lead__org=org,
        user_id=user["user_id"],
        due_at__isnull=True,
    ).first()
    if not activity:
        return JsonResponse({"detail": "Not found"}, status=404)
    activity.delete()
    return JsonResponse({"dismissed": True})
