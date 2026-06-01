"""User views — org membership listing and admin-created accounts."""

import json

from django.contrib.auth.hashers import make_password
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required, org_required
from api.models import AmplexOrgMember, AmplexUser
from api.seat_limits import validate_seat_available
from api.user_deletion import get_org_user_data_counts


@require_http_methods(["GET"])
@org_required
def list_users(request, slug):
    org = request.amplex_org
    members = AmplexOrgMember.objects.filter(org=org, active=True).select_related(
        "user"
    )
    items = [
        {
            "id": m.user.id,
            "name": m.user.name,
            "email": m.user.email,
            "role": m.role,
            "avatar_url": "",
            "data_counts": get_org_user_data_counts(org, m.user),
        }
        for m in members
        if m.user.active
    ]

    return JsonResponse({"items": items, "users": items})


@require_http_methods(["POST"])
@org_admin_required
def create_user(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    name = (body.get("name") or "").strip()
    role = body.get("role", "member")
    if role not in ("admin", "member"):
        role = "member"

    if not email or not password or len(password) < 6:
        return JsonResponse(
            {"detail": "E-mail e senha (mín. 6 caracteres) obrigatórios"},
            status=400,
        )

    if not name:
        name = email.split("@")[0]

    if AmplexUser.objects.filter(email=email).exists():
        return JsonResponse({"detail": "E-mail já cadastrado"}, status=409)

    has_seat, message = validate_seat_available(org)
    if not has_seat:
        return JsonResponse({"detail": message}, status=409)

    user = AmplexUser.objects.create(
        email=email,
        login=email,
        name=name,
        password_hash=make_password(password),
    )
    member_role = "admin" if role == "admin" else "member"
    AmplexOrgMember.objects.create(org=org, user=user, role=member_role)

    return JsonResponse(
        {"id": user.id, "name": user.name, "email": user.email, "role": member_role},
        status=201,
    )
