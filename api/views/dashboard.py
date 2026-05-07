"""Dashboard views."""

from datetime import date, datetime, time, timedelta

from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required, org_required
from api.models import AmplexUser, Contact, Interaction, Lead, Source, Stage


def _parse_iso_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _resolve_period(request):
    """Resolve preset/custom period and its equivalent previous window."""
    period = request.GET.get("period", "month")
    today = datetime.now().date()

    if period == "day":
        start_date = today - timedelta(days=1)
        end_date = today
    elif period == "week":
        start_date = today - timedelta(days=7)
        end_date = today
    elif period == "month":
        start_date = today - timedelta(days=30)
        end_date = today
    else:
        period = "custom"
        start_date = _parse_iso_date(request.GET.get("start_date"))
        end_date = _parse_iso_date(request.GET.get("end_date"))

    if start_date and end_date and start_date > end_date:
        start_date, end_date = end_date, start_date

    def aware(dt):
        if dt is None:
            return None
        return timezone.make_aware(dt) if timezone.is_naive(dt) else dt

    start_dt = aware(datetime.combine(start_date, time.min)) if start_date else None
    end_dt = (
        aware(datetime.combine(end_date + timedelta(days=1), time.min))
        if end_date
        else None
    )

    prev_start_dt = None
    prev_end_dt = None
    if start_dt and end_dt:
        window = end_dt - start_dt
        prev_end_dt = start_dt
        prev_start_dt = start_dt - window
    elif start_dt and not end_dt:
        prev_end_dt = start_dt
        prev_start_dt = start_dt - timedelta(days=30)
    elif end_dt and not start_dt:
        prev_end_dt = end_dt
        prev_start_dt = end_dt - timedelta(days=30)

    return {
        "period": period,
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "start_dt": start_dt,
        "end_dt": end_dt,
        "prev_start_dt": prev_start_dt,
        "prev_end_dt": prev_end_dt,
    }


def _apply_dt_range(qs, field_name, start_dt, end_dt):
    if start_dt:
        qs = qs.filter(**{f"{field_name}__gte": start_dt})
    if end_dt:
        qs = qs.filter(**{f"{field_name}__lt": end_dt})
    return qs


@require_http_methods(["GET"])
@org_required
def dashboard(request, slug):
    user = request.amplex_user
    org = request.amplex_org
    is_manager = user["role"] == "admin"

    period = _resolve_period(request)

    def base_qs():
        qs = Lead.objects.filter(active=True, org=org)
        if not is_manager:
            qs = qs.filter(user_id=user["user_id"])
        return _apply_dt_range(qs, "created_at", period["start_dt"], period["end_dt"])

    total_leads = base_qs().filter(type="lead").count()
    total_opps = base_qs().filter(type="opportunity").count()

    won_stage_ids = list(
        Stage.objects.filter(is_won=True, org=org).values_list("id", flat=True)
    )
    won = (
        base_qs().filter(type="opportunity", stage_id__in=won_stage_ids).count()
        if won_stage_ids
        else 0
    )

    lost_qs = Lead.objects.filter(active=False, probability=0, org=org)
    if not is_manager:
        lost_qs = lost_qs.filter(user_id=user["user_id"])
    lost_qs = _apply_dt_range(
        lost_qs, "created_at", period["start_dt"], period["end_dt"]
    )
    lost = lost_qs.count()

    total_revenue = (
        float(
            base_qs()
            .filter(type="opportunity", stage_id__in=won_stage_ids)
            .aggregate(s=Coalesce(Sum("expected_revenue"), 0.0))["s"]
        )
        if won_stage_ids
        else 0
    )

    current_period_count = base_qs().count()
    previous_period_count = 0
    if period["prev_start_dt"] or period["prev_end_dt"]:
        previous_qs = Lead.objects.filter(active=True, org=org)
        if not is_manager:
            previous_qs = previous_qs.filter(user_id=user["user_id"])
        previous_qs = _apply_dt_range(
            previous_qs,
            "created_at",
            period["prev_start_dt"],
            period["prev_end_dt"],
        )
        previous_period_count = previous_qs.count()

    stages = []
    for stage in Stage.objects.filter(org=org).order_by("sequence"):
        stage_qs = base_qs().filter(stage=stage)
        count = stage_qs.count()
        revenue = float(
            stage_qs.aggregate(s=Coalesce(Sum("expected_revenue"), 0.0))["s"]
        )
        stages.append(
            {
                "id": stage.id,
                "name": stage.name,
                "count": count,
                "revenue": round(revenue, 2),
                "is_won": stage.is_won,
                "sequence": stage.sequence,
            }
        )

    contacts_qs = Contact.objects.filter(active=True, org=org)
    total_contacts = _apply_dt_range(
        contacts_qs, "created_at", period["start_dt"], period["end_dt"]
    ).count()

    return JsonResponse(
        {
            "pipeline": {
                "total_leads": total_leads,
                "total_opportunities": total_opps,
                "won": won,
                "lost": lost,
                "total_revenue": round(total_revenue, 2),
                # Backward compatibility fields
                "new_this_month": current_period_count,
                "new_last_month": previous_period_count,
                # Explicit period-aware fields
                "current_period_count": current_period_count,
                "previous_period_count": previous_period_count,
            },
            "stages": stages,
            "total_contacts": total_contacts,
            "period": {
                "key": period["period"],
                "start_date": period["start_date"],
                "end_date": period["end_date"],
            },
        }
    )


@require_http_methods(["GET"])
@org_admin_required
def dashboard_advanced(request, slug):
    org = request.amplex_org
    today = datetime.now().date()
    period = _resolve_period(request)

    crm_users = AmplexUser.objects.filter(
        memberships__org=org, is_internal=True, active=True
    )
    won_stage_ids = list(
        Stage.objects.filter(is_won=True, org=org).values_list("id", flat=True)
    )

    vendor_performance = []
    for u in crm_users:
        user_active_qs = Lead.objects.filter(active=True, user=u, org=org)
        user_active_qs = _apply_dt_range(
            user_active_qs, "created_at", period["start_dt"], period["end_dt"]
        )
        total = user_active_qs.count()
        w = (
            user_active_qs.filter(stage_id__in=won_stage_ids).count()
            if won_stage_ids
            else 0
        )
        user_lost_qs = Lead.objects.filter(active=False, probability=0, user=u, org=org)
        user_lost_qs = _apply_dt_range(
            user_lost_qs, "created_at", period["start_dt"], period["end_dt"]
        )
        lost = user_lost_qs.count()
        rev = (
            float(
                user_active_qs.filter(stage_id__in=won_stage_ids).aggregate(
                    s=Coalesce(Sum("expected_revenue"), 0.0)
                )["s"]
            )
            if won_stage_ids
            else 0
        )
        vendor_performance.append(
            {
                "user_id": u.id,
                "name": u.name,
                "total": total,
                "won": w,
                "lost": lost,
                "revenue": round(rev, 2),
                "conversion": round(w / (w + lost) * 100, 1) if (w + lost) > 0 else 0,
            }
        )

    sources = Source.objects.filter(org=org)
    origin_breakdown = []
    for src in sources:
        src_qs = Lead.objects.filter(active=True, source=src, org=org)
        src_qs = _apply_dt_range(
            src_qs, "created_at", period["start_dt"], period["end_dt"]
        )
        count = src_qs.count()
        if count > 0:
            origin_breakdown.append(
                {"source_id": src.id, "name": src.name, "count": count}
            )
    no_source_qs = Lead.objects.filter(active=True, source__isnull=True, org=org)
    no_source_qs = _apply_dt_range(
        no_source_qs, "created_at", period["start_dt"], period["end_dt"]
    )
    no_source = no_source_qs.count()
    if no_source > 0:
        origin_breakdown.append(
            {"source_id": None, "name": "Sem origem", "count": no_source}
        )

    leads_over_time = []
    timeline_start = period["start_dt"] or timezone.make_aware(
        datetime.combine((today - timedelta(days=180)).replace(day=1), time.min)
    )
    timeline_end = period["end_dt"] or timezone.make_aware(
        datetime.combine(today + timedelta(days=1), time.min)
    )
    window_days = max((timeline_end - timeline_start).days, 1)

    if window_days <= 14:
        step_days = 1
        label_fmt = "%d/%m"
    elif window_days <= 90:
        step_days = 7
        label_fmt = "%d/%m"
    else:
        step_days = 30
        label_fmt = "%b/%Y"

    cursor = timeline_start
    while cursor < timeline_end:
        bucket_end = min(cursor + timedelta(days=step_days), timeline_end)
        count = Lead.objects.filter(
            org=org, created_at__gte=cursor, created_at__lt=bucket_end
        ).count()
        leads_over_time.append(
            {
                "month": cursor.strftime("%Y-%m-%d"),
                "label": cursor.strftime(label_fmt),
                "count": count,
            }
        )
        cursor = bucket_end

    return JsonResponse(
        {
            "vendor_performance": vendor_performance,
            "origin_breakdown": origin_breakdown,
            "leads_over_time": leads_over_time,
            "period": {
                "key": period["period"],
                "start_date": period["start_date"],
                "end_date": period["end_date"],
            },
        }
    )


@require_http_methods(["GET"])
@org_required
def next_contacts(request, slug):
    user = request.amplex_user
    org = request.amplex_org
    limit = min(int(request.GET.get("limit", 10)), 50)

    period = _resolve_period(request)
    qs = Lead.objects.filter(active=True, org=org).select_related("stage", "contact")
    qs = _apply_dt_range(qs, "created_at", period["start_dt"], period["end_dt"])
    if user["role"] != "admin":
        qs = qs.filter(user_id=user["user_id"])

    leads = list(qs.order_by("updated_at")[:limit])
    now = timezone.now()
    items = []
    for lead in leads:
        last_interaction = (
            Interaction.objects.filter(lead=lead).order_by("-created_at").first()
        )
        last_contact = (
            last_interaction.created_at if last_interaction else lead.created_at
        )
        days_since = (now - last_contact).days if last_contact else 999
        items.append(
            {
                "id": lead.id,
                "name": lead.name,
                "contact_name": lead.contact_name
                or (lead.contact.name if lead.contact else ""),
                "phone": lead.phone or "",
                "email_from": lead.email_from or "",
                "stage_name": lead.stage.name if lead.stage else "",
                "expected_revenue": lead.expected_revenue or 0,
                "last_contact": str(last_contact) if last_contact else None,
                "days_since_contact": days_since,
            }
        )

    items.sort(key=lambda x: x["days_since_contact"], reverse=True)
    return JsonResponse({"items": items})
