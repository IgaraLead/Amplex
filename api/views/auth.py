"""Auth routes — login, refresh, user info, and logout."""

import json

from django.contrib.auth.hashers import check_password, make_password
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import clear_auth_cookies, login_required, set_auth_cookies
from api.models import AmplexOrgMember, AmplexUser
from api.tokens import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
)


def _create_access_for_user(user):
    return create_access_token(
        str(user.id),
        {"session_version": int(user.session_version or 0)},
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

    access_token = _create_access_for_user(user)
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
    try:
        session_version = int(claims.get("session_version") or 0)
    except (TypeError, ValueError):
        return JsonResponse({"error": "Refresh token inválido"}, status=401)
    if session_version != int(user.session_version or 0):
        return JsonResponse({"error": "Sessão expirada"}, status=401)

    access_token = _create_access_for_user(user)
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
            "is_super_admin": user.get("is_super_admin", False),
            "force_password_change": user.get("force_password_change", False),
            "organizations": orgs,
        }
    )


@require_http_methods(["POST"])
@login_required
def change_password(request):
    body = json.loads(request.body)
    current_password = body.get("senha_atual") or body.get("current_password") or ""
    new_password = body.get("nova_senha") or body.get("new_password") or ""
    if not current_password or len(new_password) < 8:
        return JsonResponse(
            {"detail": "Senha atual e nova senha (mín. 8 caracteres) são obrigatórias"},
            status=400,
        )

    user_id = request.amplex_user["user_id"]
    user = AmplexUser.objects.filter(id=user_id, active=True).first()
    if not user:
        return JsonResponse({"detail": "Usuário não encontrado"}, status=404)
    if not check_password(current_password, user.password_hash):
        return JsonResponse({"detail": "Senha atual incorreta"}, status=403)

    user.password_hash = make_password(new_password)
    user.force_password_change = False
    user.session_version = int(user.session_version or 0) + 1
    user.save(
        update_fields=[
            "password_hash",
            "force_password_change",
            "session_version",
            "updated_at",
        ]
    )

    access_token = _create_access_for_user(user)
    refresh_token = create_refresh_token(user)
    response = JsonResponse({"message": "Senha alterada"})
    set_auth_cookies(response, access_token, refresh_token)
    return response


@require_http_methods(["POST"])
def logout(request):
    response = JsonResponse({"message": "Logout realizado"})
    clear_auth_cookies(response)
    return response
