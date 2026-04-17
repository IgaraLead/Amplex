"""Dashboard views."""

from datetime import datetime, timedelta

from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required, org_required
from api.models import AmplexUser, Contact, Interaction, Lead, Source, Stage


@require_http_methods(["GET"])
@org_required
def dashboard(request, slug):
    user = request.amplex_user
    org = request.amplex_org
    is_manager = user["role"] == "admin"

    def base_qs():
        qs = Lead.objects.filter(active=True, org=org)
        if not is_manager:
            qs = qs.filter(user_id=user["user_id"])
        return qs

    today = datetime.now().date()
    month_start = today.replace(day=1)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)

    total_leads = base_qs().filter(type="lead").count()
    total_opps = base_qs().filter(type="opportunity").count()

    won_stage_ids = list(
        Stage.objects.filter(is_won=True, org=org).values_list("id", flat=True)
    )
    won = base_qs().filter(stage_id__in=won_stage_ids).count() if won_stage_ids else 0

    lost_qs = Lead.objects.filter(active=False, probability=0, org=org)
    if not is_manager:
        lost_qs = lost_qs.filter(user_id=user["user_id"])
    lost = lost_qs.count()

    total_revenue = (
        float(
            base_qs()
            .filter(stage_id__in=won_stage_ids)
            .aggregate(s=Coalesce(Sum("expected_revenue"), 0.0))["s"]
        )
        if won_stage_ids
        else 0
    )

    new_this_month = base_qs().filter(created_at__gte=month_start).count()
    new_last_month = (
        base_qs()
        .filter(created_at__gte=last_month_start, created_at__lt=month_start)
        .count()
    )

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

    total_contacts = Contact.objects.filter(active=True, org=org).count()

    return JsonResponse(
        {
            "pipeline": {
                "total_leads": total_leads,
                "total_opportunities": total_opps,
                "won": won,
                "lost": lost,
                "total_revenue": round(total_revenue, 2),
                "new_this_month": new_this_month,
                "new_last_month": new_last_month,
            },
            "stages": stages,
            "total_contacts": total_contacts,
        }
    )


@require_http_methods(["GET"])
@org_admin_required
def dashboard_advanced(request, slug):
    org = request.amplex_org
    today = datetime.now().date()

    crm_users = AmplexUser.objects.filter(
        memberships__org=org, is_internal=True, active=True
    )
    won_stage_ids = list(
        Stage.objects.filter(is_won=True, org=org).values_list("id", flat=True)
    )

    vendor_performance = []
    for u in crm_users:
        total = Lead.objects.filter(active=True, user=u, org=org).count()
        w = (
            Lead.objects.filter(
                active=True, user=u, org=org, stage_id__in=won_stage_ids
            ).count()
            if won_stage_ids
            else 0
        )
        lost = Lead.objects.filter(active=False, probability=0, user=u, org=org).count()
        rev = (
            float(
                Lead.objects.filter(
                    active=True, user=u, org=org, stage_id__in=won_stage_ids
                ).aggregate(s=Coalesce(Sum("expected_revenue"), 0.0))["s"]
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
        count = Lead.objects.filter(active=True, source=src, org=org).count()
        if count > 0:
            origin_breakdown.append(
                {"source_id": src.id, "name": src.name, "count": count}
            )
    no_source = Lead.objects.filter(active=True, source__isnull=True, org=org).count()
    if no_source > 0:
        origin_breakdown.append(
            {"source_id": None, "name": "Sem origem", "count": no_source}
        )

    leads_over_time = []
    for i in range(5, -1, -1):
        m_start = (today.replace(day=1) - timedelta(days=30 * i)).replace(day=1)
        m_end = (
            (m_start.replace(day=28) + timedelta(days=4)).replace(day=1)
            if i > 0
            else today + timedelta(days=1)
        )
        count = Lead.objects.filter(
            org=org, created_at__gte=m_start, created_at__lt=m_end
        ).count()
        leads_over_time.append(
            {
                "month": m_start.strftime("%Y-%m"),
                "label": m_start.strftime("%b/%Y"),
                "count": count,
            }
        )

    return JsonResponse(
        {
            "vendor_performance": vendor_performance,
            "origin_breakdown": origin_breakdown,
            "leads_over_time": leads_over_time,
        }
    )


@require_http_methods(["GET"])
@org_required
def next_contacts(request, slug):
    user = request.amplex_user
    org = request.amplex_org
    limit = min(int(request.GET.get("limit", 10)), 50)

    qs = Lead.objects.filter(active=True, org=org).select_related("stage", "contact")
    if user["role"] != "admin":
        qs = qs.filter(user_id=user["user_id"])

    leads = list(qs.order_by("updated_at")[:limit])
    now = datetime.now()
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
