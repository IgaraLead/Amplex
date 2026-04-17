"""
Authentication utilities for Amplex.

Local HS256 token validation, user provisioning, cookie management,
and decorators for protecting views.
"""

import functools
import logging
import secrets

from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone

logger = logging.getLogger(__name__)


def set_auth_cookies(response, access_token, refresh_token=""):
    """Set amplex_access, amplex_refresh, and amplex_csrf cookies."""
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
    response.delete_cookie("amplex_access", path="/", domain=settings.COOKIE_DOMAIN)
    response.delete_cookie(
        "amplex_refresh",
        path="/amplex/api/auth/refresh",
        domain=settings.COOKIE_DOMAIN,
    )
    response.delete_cookie("amplex_csrf", path="/", domain=settings.COOKIE_DOMAIN)


def get_current_user(request):
    """Extract and validate user from request.

    Returns (user_dict, None) on success or (None, JsonResponse) on error.
    user_dict has: user_id, name, email, role, hub_id, is_super_admin, memberships.
    """
    from .hub_auth import decode_access_token
    from .models import AmplexUser, SharedUser

    token = None

    # 1. Authorization header
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]

    # 2. Amplex-specific cookie
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

    # Look up shared user for roles and membership info
    shared_user = SharedUser.objects.filter(id=user_id_str).first()
    if not shared_user or not shared_user.active:
        return None, JsonResponse({"detail": "Usuário não encontrado"}, status=401)

    roles = shared_user.roles if isinstance(shared_user.roles, list) else []
    is_super_admin = "super_admin" in roles

    # Platform access check
    if not is_super_admin:
        from .models import SharedMembership, SharedOrganization

        has_amplex = False
        for m in SharedMembership.objects.filter(user_id=shared_user.id):
            org = SharedOrganization.objects.filter(id=m.organization_id).first()
            if org and (org.active_products or {}).get("amplex"):
                has_amplex = True
                break
        if not has_amplex:
            return None, JsonResponse(
                {"detail": "Sua organização não possui acesso ao Amplex"},
                status=403,
            )

    # Resolve local user
    user = AmplexUser.objects.filter(hub_id=str(shared_user.id)).first()
    if not user and shared_user.email:
        user = AmplexUser.objects.filter(email=shared_user.email).first()

    if not user:
        display_name = shared_user.name or shared_user.email.split("@")[0]
        user, created = AmplexUser.objects.get_or_create(
            email=shared_user.email,
            defaults={
                "name": display_name,
                "login": shared_user.email,
                "hub_id": str(shared_user.id),
            },
        )
        if created:
            logger.info("Auto-provisioned user %s", shared_user.email)
    elif not user.hub_id:
        user.hub_id = str(shared_user.id)
        user.hub_synced_at = timezone.now()
        user.save(update_fields=["hub_id", "hub_synced_at"])

    # Sync memberships from shared DB
    _sync_memberships_from_db(user, shared_user)

    role = "admin" if any(r in ("admin", "super_admin") for r in roles) else "user"
    return {
        "user_id": user.id,
        "name": shared_user.name or user.name,
        "email": shared_user.email or user.email,
        "role": role,
        "hub_id": str(shared_user.id),
        "is_super_admin": is_super_admin,
        "memberships": [],
    }, None


def _sync_memberships_from_db(user, shared_user):
    """Sync local Organization + OrgMember from shared DB."""
    from .models import (
        AmplexOrganization,
        AmplexOrgMember,
        SharedMembership,
        SharedOrganization,
    )

    for m in SharedMembership.objects.filter(user_id=shared_user.id):
        shared_org = SharedOrganization.objects.filter(id=m.organization_id).first()
        if not shared_org:
            continue
        if not (shared_org.active_products or {}).get("amplex"):
            continue

        org = AmplexOrganization.objects.filter(hub_org_id=str(shared_org.id)).first()
        if not org:
            org = AmplexOrganization.objects.create(
                name=shared_org.name or shared_org.slug,
                hub_org_id=str(shared_org.id),
                slug=shared_org.slug,
            )
        elif not org.slug:
            org.slug = shared_org.slug
            org.save(update_fields=["slug"])

        if not AmplexOrgMember.objects.filter(org=org, user=user).exists():
            AmplexOrgMember.objects.create(org=org, user=user)


def get_org_context(request, slug):
    """Resolve organization and verify membership.

    Returns (current_user_dict, org, None) or (None, None, JsonResponse).
    """
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

    if not current_user["is_super_admin"]:
        membership = AmplexOrgMember.objects.filter(
            org=org, user_id=current_user["user_id"]
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
        current_user["role"] = "admin"

    current_user["org_id"] = org.id
    current_user["org_slug"] = org.slug
    return current_user, org, None


# ── Decorators ───────────────────────────────────────────


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
    """Decorator for views that need slug as first URL param.

    Injects request.amplex_user and request.amplex_org.
    """

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
    """Decorator: org_required + admin role check."""

    @functools.wraps(view_func)
    def wrapper(request, slug, *args, **kwargs):
        user, org, error = get_org_context(request, slug)
        if error:
            return error
        if user["role"] != "admin":
            return JsonResponse({"detail": "Permissão negada"}, status=403)
        request.amplex_user = user
        request.amplex_org = org
        return view_func(request, slug, *args, **kwargs)

    return wrapper


def require_api_key(view_func):
    """Decorator for S2S endpoints protected by X-Api-Key."""

    @functools.wraps(view_func)
    def wrapper(request, *args, **kwargs):
        import hmac as _hmac

        api_key = request.headers.get("X-Api-Key", "")
        expected = settings.HUB_API_KEY
        if not expected or not _hmac.compare_digest(api_key, expected):
            return JsonResponse({"detail": "API key inválida"}, status=401)
        return view_func(request, *args, **kwargs)

    return wrapper
