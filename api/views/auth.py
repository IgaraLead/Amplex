"""Auth routes — login, refresh, user info, and logout."""

import json

from django.contrib.auth.hashers import check_password
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import clear_auth_cookies, login_required, set_auth_cookies
from api.models import AmplexOrgMember, AmplexUser
from api.tokens import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
)


@require_http_methods(["POST"])
def login(request):
    body = json.loads(request.body)
    email = body.get("email", "").lower().strip()
    password = body.get("password", "")
    if not email or not password:
        return JsonResponse({"error": "E-mail e senha são obrigatórios"}, status=400)

    user = AmplexUser.objects.filter(email=email).first()
    if not user or not user.active:
        return JsonResponse({"error": "Credenciais inválidas"}, status=401)

    if not user.password_hash or not check_password(password, user.password_hash):
        return JsonResponse({"error": "Credenciais inválidas"}, status=401)

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(user)
    response = JsonResponse({"access_token": access_token, "token_type": "bearer"})
    set_auth_cookies(response, access_token, refresh_token)
    return response


@require_http_methods(["POST"])
def refresh(request):
    token = request.COOKIES.get("amplex_refresh")
    if not token:
        return JsonResponse({"error": "Refresh token ausente"}, status=401)

    try:
        claims = decode_refresh_token(token)
    except ValueError:
        return JsonResponse({"error": "Refresh token inválido"}, status=401)

    raw_sub = claims.get("sub")
    try:
        refresh_uid = int(raw_sub)
    except (TypeError, ValueError):
        return JsonResponse({"error": "Refresh token inválido"}, status=401)

    user = AmplexUser.objects.filter(id=refresh_uid).first()
    if not user or not user.active:
        return JsonResponse({"error": "Usuário não encontrado"}, status=401)

    access_token = create_access_token(str(user.id))
    new_refresh = create_refresh_token(user)
    response = JsonResponse({"access_token": access_token, "token_type": "bearer"})
    set_auth_cookies(response, access_token, new_refresh)
    return response


@require_http_methods(["GET"])
@login_required
def me(request):
    user = request.amplex_user
    memberships = AmplexOrgMember.objects.filter(
        user_id=user["user_id"], active=True
    ).select_related("org")

    orgs = []
    for m in memberships:
        if m.org.active:
            orgs.append(
                {
                    "id": m.org.id,
                    "slug": m.org.slug,
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
            "organizations": orgs,
        }
    )


@require_http_methods(["POST"])
def logout(request):
    response = JsonResponse({"message": "Logout realizado"})
    clear_auth_cookies(response)
    return response
