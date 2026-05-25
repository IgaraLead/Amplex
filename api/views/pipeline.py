"""Pipeline (Kanban) views."""

from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import Lead, Stage
from api.views.stages import ensure_fixed_stages


@require_http_methods(["GET"])
@org_required
def pipeline(request, slug):
    user = request.amplex_user
    org = request.amplex_org
    ensure_fixed_stages(org)
    lead_type = request.GET.get("type", "opportunity")
    search = request.GET.get("search")
    filter_user_id = request.GET.get("user_id")
    min_value = request.GET.get("min_value")
    max_value = request.GET.get("max_value")

    base_qs = Lead.objects.filter(active=True, org=org).select_related(
        "contact", "user"
    )

    if lead_type in ("lead", "opportunity"):
        base_qs = base_qs.filter(type=lead_type)

    is_admin = user["role"] == "admin"
    if not is_admin:
        base_qs = base_qs.filter(user_id=user["user_id"])
    elif filter_user_id:
        base_qs = base_qs.filter(user_id=int(filter_user_id))

    if search:
        base_qs = base_qs.filter(
            Q(name__icontains=search)
            | Q(contact_name__icontains=search)
            | Q(email_from__icontains=search)
        )
    if min_value is not None:
        base_qs = base_qs.filter(expected_revenue__gte=float(min_value))
    if max_value is not None:
        base_qs = base_qs.filter(expected_revenue__lte=float(max_value))

    columns = []
    for stage in Stage.objects.filter(org=org).order_by("sequence"):
        stage_qs = base_qs.filter(stage=stage)
        count = stage_qs.count()
        leads = list(
            stage_qs.prefetch_related("tags").order_by("-priority", "-id")[:50]
        )
        cards = []
        for lead in leads:
            cards.append(
                {
                    "id": lead.id,
                    "name": lead.name,
                    "contact_name": lead.contact_name or "",
                    "partner_name": lead.contact.name if lead.contact else "",
                    "email_from": lead.email_from or "",
                    "phone": lead.phone or "",
                    "expected_revenue": lead.expected_revenue or 0,
                    "probability": lead.probability or 0,
                    "priority": lead.priority or "0",
                    "create_date": lead.created_at,
                    "tag_ids": [
                        {"id": t.id, "name": t.name, "color": t.color}
                        for t in lead.tags.all()
                    ],
                    "user_id": lead.user_id,
                    "user_name": lead.user.name if lead.user else "",
                }
            )
        columns.append(
            {
                "id": stage.id,
                "name": stage.name,
                "sequence": stage.sequence,
                "is_won": stage.is_won,
                "is_lost": stage.is_lost,
                "count": count,
                "cards": cards,
            }
        )

    return JsonResponse({"columns": columns})
