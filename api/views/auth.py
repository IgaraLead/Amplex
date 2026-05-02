"""Auth routes — login, refresh, user info, and logout."""

import json
import logging

from django.contrib.auth.hashers import check_password
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.access_tokens import (
    AUTH_KIND_AMPLEX_LOCAL,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
)
from api.auth_utils import clear_auth_cookies, login_required, set_auth_cookies
from api.models import AmplexOrgMember, AmplexUser

logger = logging.getLogger(__name__)


@require_http_methods(["POST"])
def login(request):
    body = json.loads(request.body)
    email = body.get("email", "").lower().strip()
    password = body.get("password", "")
    if not email or not password:
        return JsonResponse({"error": "E-mail e senha são obrigatórios"}, status=400)

    au = AmplexUser.objects.filter(email=email, active=True).first()
    if (
        au
        and au.password_hash
        and au.password_hash not in ("!",)
        and check_password(password, au.password_hash)
    ):
        if (
            not au.is_platform_super_admin
            and not AmplexOrgMember.objects.filter(user=au, active=True).exists()
        ):
            return JsonResponse(
                {"error": "Sua organização não possui acesso ao Amplex"},
                status=403,
            )
        access_token = create_access_token(str(au.id), auth_kind=AUTH_KIND_AMPLEX_LOCAL)
        refresh_token = create_refresh_token(au, AUTH_KIND_AMPLEX_LOCAL)
        response = JsonResponse({"access_token": access_token, "token_type": "bearer"})
        set_auth_cookies(response, access_token, refresh_token)
        return response

    return JsonResponse({"error": "Credenciais inválidas"}, status=401)


@require_http_methods(["POST"])
def refresh(request):
    token = request.COOKIES.get("amplex_refresh")
    if not token:
        return JsonResponse({"error": "Refresh token ausente"}, status=401)

    try:
        claims = decode_refresh_token(token)
    except ValueError:
        return JsonResponse({"error": "Refresh token inválido"}, status=401)

    auth_kind = claims.get("auth_kind", AUTH_KIND_AMPLEX_LOCAL)
    sub = claims.get("sub")

    if auth_kind != AUTH_KIND_AMPLEX_LOCAL:
        return JsonResponse({"error": "Refresh token inválido"}, status=401)

    try:
        aid = int(sub)
    except (TypeError, ValueError):
        return JsonResponse({"error": "Refresh token inválido"}, status=401)

    au = AmplexUser.objects.filter(id=aid, active=True).first()
    if not au:
        return JsonResponse({"error": "Usuário não encontrado"}, status=401)

    access_token = create_access_token(str(au.id), auth_kind=AUTH_KIND_AMPLEX_LOCAL)
    new_refresh = create_refresh_token(au, AUTH_KIND_AMPLEX_LOCAL)
    response = JsonResponse({"access_token": access_token, "token_type": "bearer"})
    set_auth_cookies(response, access_token, new_refresh)
    return response


@require_http_methods(["GET"])
@login_required
def me(request):
    user = request.amplex_user
    memberships = AmplexOrgMember.objects.filter(
        user_id=user["user_id"]
    ).select_related("org")

    orgs = []
    for m in memberships:
        if m.org.active:
            orgs.append(
                {
                    "id": m.org.id,
                    "slug": m.org.slug,
                    "hub_org_id": m.org.hub_org_id,
                    "name": m.org.name,
                    "role": m.role,
                }
            )

    return JsonResponse(
        {
            "user_id": user["user_id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "is_super_admin": user["is_super_admin"],
            "hub_id": user["hub_id"],
            "organizations": orgs,
        }
    )


@require_http_methods(["POST"])
def logout(request):
    response = JsonResponse({"message": "Logout realizado"})
    clear_auth_cookies(response)
    return response
