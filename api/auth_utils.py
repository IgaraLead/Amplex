"""
Authentication utilities for Amplex (standalone MVP).

Cookie-based JWT sessions and decorators for protecting views.
"""

import functools
import secrets

from django.http import JsonResponse


def set_auth_cookies(response, access_token, refresh_token=""):
    """Set amplex_access, amplex_refresh, and amplex_csrf cookies."""
    from django.conf import settings

    response.set_cookie(
        key="amplex_access",
        value=access_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="Lax",
        domain=settings.COOKIE_DOMAIN,
        max_age=settings.SESSION_EXPIRE_HOURS * 3600,
        path="/",
    )
    if refresh_token:
        response.set_cookie(
            key="amplex_refresh",
            value=refresh_token,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite="Lax",
            domain=settings.COOKIE_DOMAIN,
            max_age=settings.REFRESH_EXPIRE_DAYS * 86400,
            path="/amplex/api/auth/refresh",
        )
    response.set_cookie(
        key="amplex_csrf",
        value=secrets.token_urlsafe(32),
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite="Lax",
        domain=settings.COOKIE_DOMAIN,
        max_age=settings.SESSION_EXPIRE_HOURS * 3600,
        path="/",
    )


def clear_auth_cookies(response):
    """Clear all auth cookies."""
    from django.conf import settings

    response.delete_cookie("amplex_access", path="/", domain=settings.COOKIE_DOMAIN)
    response.delete_cookie(
        "amplex_refresh",
        path="/amplex/api/auth/refresh",
        domain=settings.COOKIE_DOMAIN,
    )
    response.delete_cookie("amplex_csrf", path="/", domain=settings.COOKIE_DOMAIN)


def _effective_global_role(user):
    from .models import AmplexOrgMember

    if user.is_super_admin:
        return "super_admin"
    if AmplexOrgMember.objects.filter(user=user, active=True, role="admin").exists():
        return "admin"
    return "user"


def get_current_user(request):
    """Extract and validate user from JWT cookie or Bearer header.

    Returns (user_dict, None) on success or (None, JsonResponse) on error.
    """
    from .models import AmplexUser
    from .tokens import decode_access_token

    token = None

    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]

    if not token:
        token = request.COOKIES.get("amplex_access")

    if not token:
        return None, JsonResponse({"detail": "Autenticação necessária"}, status=401)

    try:
        claims = decode_access_token(token)
    except (ValueError, KeyError):
        return None, JsonResponse({"detail": "Token inválido"}, status=401)

    user_id_str = claims.get("sub")
    if not user_id_str:
        return None, JsonResponse({"detail": "Token inválido"}, status=401)

    try:
        uid = int(user_id_str)
    except (TypeError, ValueError):
        return None, JsonResponse({"detail": "Token inválido"}, status=401)

    user = AmplexUser.objects.filter(id=uid).first()
    if not user or not user.active:
        return None, JsonResponse({"detail": "Usuário não encontrado"}, status=401)

    role = _effective_global_role(user)
    return {
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "role": role,
        "is_super_admin": user.is_super_admin,
        "memberships": [],
    }, None


def get_org_context(request, slug):
    """Resolve organization and verify membership."""
    from .models import AmplexOrganization, AmplexOrgMember

    current_user, error = get_current_user(request)
    if error:
        return None, None, error

    org = AmplexOrganization.objects.filter(slug=slug, active=True).first()
    if not org:
        return (
            None,
            None,
            JsonResponse({"detail": "Organização não encontrada"}, status=404),
        )

    if current_user.get("is_super_admin"):
        current_user["role"] = "super_admin"
    else:
        membership = AmplexOrgMember.objects.filter(
            org=org, user_id=current_user["user_id"], active=True
        ).first()
        if not membership:
            return (
                None,
                None,
                JsonResponse({"detail": "Sem acesso a esta organização"}, status=403),
            )

        if membership.role == "admin":
            current_user["role"] = "admin"
        else:
            current_user["role"] = "user"

    current_user["org_id"] = org.id
    current_user["org_slug"] = org.slug
    return current_user, org, None


def login_required(view_func):
    """Decorator that injects request.amplex_user or returns 401."""

    @functools.wraps(view_func)
    def wrapper(request, *args, **kwargs):
        user, error = get_current_user(request)
        if error:
            return error
        request.amplex_user = user
        return view_func(request, *args, **kwargs)

    return wrapper


def org_required(view_func):
    """Org-scoped views: inject request.amplex_user and request.amplex_org."""

    @functools.wraps(view_func)
    def wrapper(request, slug, *args, **kwargs):
        user, org, error = get_org_context(request, slug)
        if error:
            return error
        request.amplex_user = user
        request.amplex_org = org
        return view_func(request, slug, *args, **kwargs)

    return wrapper


def org_admin_required(view_func):
    """org_required + admin role on the resolved org."""

    @functools.wraps(view_func)
    def wrapper(request, slug, *args, **kwargs):
        user, org, error = get_org_context(request, slug)
        if error:
            return error
        if user["role"] not in ("admin", "super_admin"):
            return JsonResponse({"detail": "Permissão negada"}, status=403)
        request.amplex_user = user
        request.amplex_org = org
        return view_func(request, slug, *args, **kwargs)

    return wrapper


def super_admin_required(view_func):
    """Global admin endpoints protected by super-admin role."""

    @functools.wraps(view_func)
    def wrapper(request, *args, **kwargs):
        user, error = get_current_user(request)
        if error:
            return error
        if not user.get("is_super_admin"):
            return JsonResponse({"detail": "Permissão negada"}, status=403)
        request.amplex_user = user
        return view_func(request, *args, **kwargs)

    return wrapper
