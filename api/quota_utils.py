"""Per-organization platform quotas (MVP local; no Hub)."""

from __future__ import annotations

from django.http import JsonResponse

from .models import AmplexOrganization, AmplexOrgMember


def max_amplex_users_for_org(org: AmplexOrganization) -> int | None:
    pq = org.platform_quotas or {}
    a = pq.get("amplex")
    if not isinstance(a, dict):
        return None
    v = a.get("max_users")
    if v is None:
        v = a.get("user_limit")
    if v is None:
        return None
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def check_amplex_member_limit_or_403(
    org: AmplexOrganization, user
) -> JsonResponse | None:
    cap = max_amplex_users_for_org(org)
    if cap is None:
        return None

    m = AmplexOrgMember.objects.filter(org=org, user=user).first()
    if m and m.active:
        return None

    current = AmplexOrgMember.objects.filter(org=org, active=True).count()
    if current >= cap:
        return JsonResponse(
            {
                "detail": (
                    f"Limite de utilizadores Amplex para esta organização atingido ({cap}). "
                    "Contacte o super-admin."
                )
            },
            status=403,
        )
    return None
