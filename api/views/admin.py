"""Global super-admin endpoints."""

import json
import re

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import super_admin_required
from api.models import AmplexOrganization, AmplexOrgMember, AmplexUser
from api.seat_limits import active_members_count, validate_seat_available


@require_http_methods(["GET"])
@super_admin_required
def overview(request):
    total_orgs = AmplexOrganization.objects.count()
    active_orgs = AmplexOrganization.objects.filter(active=True).count()
    total_users = AmplexUser.objects.count()
    active_users = AmplexUser.objects.filter(active=True).count()
    total_memberships = AmplexOrgMember.objects.filter(active=True).count()
    return JsonResponse(
        {
            "organizations": {"total": total_orgs, "active": active_orgs},
            "users": {"total": total_users, "active": active_users},
            "memberships": {"active": total_memberships},
        }
    )


@require_http_methods(["GET"])
@super_admin_required
def list_orgs(request):
    items = []
    for org in AmplexOrganization.objects.order_by("name"):
        active_members = active_members_count(org)
        items.append(
            {
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "active": org.active,
                "seat_limit": org.seat_limit,
                "active_members": active_members,
                "available_seats": max(org.seat_limit - active_members, 0),
            }
        )
    return JsonResponse({"items": items})


@require_http_methods(["PUT"])
@super_admin_required
def update_org(request, org_id):
    org = AmplexOrganization.objects.filter(id=org_id).first()
    if not org:
        return JsonResponse({"detail": "Organização não encontrada"}, status=404)
    body = json.loads(request.body)

    if "name" in body:
        name = (body.get("name") or "").strip()
        if not name:
            return JsonResponse({"detail": "name is required"}, status=400)
        org.name = name
    if "slug" in body:
        slug = (body.get("slug") or "").strip().lower()
        if not slug or not re.match(r"^[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]$", slug):
            return JsonResponse(
                {"detail": "Slug inválido (3-50 chars, alfanumérico, - ou _)"},
                status=400,
            )
        if AmplexOrganization.objects.filter(slug=slug).exclude(id=org.id).exists():
            return JsonResponse({"detail": "Slug já em uso"}, status=409)
        org.slug = slug
    if "active" in body:
        org.active = bool(body.get("active"))
    if "seat_limit" in body:
        try:
            seat_limit = int(body.get("seat_limit"))
        except (TypeError, ValueError):
            return JsonResponse({"detail": "seat_limit inválido"}, status=400)
        if seat_limit < 1:
            return JsonResponse({"detail": "seat_limit deve ser >= 1"}, status=400)
        org.seat_limit = seat_limit

    org.save()
    return JsonResponse(
        {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "active": org.active,
            "seat_limit": org.seat_limit,
        }
    )


@require_http_methods(["GET"])
@super_admin_required
def list_users(request):
    items = []
    users = AmplexUser.objects.order_by("name")
    for user in users:
        memberships = []
        rows = AmplexOrgMember.objects.filter(user=user).select_related("org")
        for m in rows:
            memberships.append(
                {
                    "org_id": m.org.id,
                    "org_name": m.org.name,
                    "org_slug": m.org.slug,
                    "role": m.role,
                    "active": m.active,
                }
            )
        items.append(
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "active": user.active,
                "is_super_admin": user.is_super_admin,
                "memberships": memberships,
            }
        )
    return JsonResponse({"items": items})


@require_http_methods(["PUT"])
@super_admin_required
def update_user(request, user_id):
    user = AmplexUser.objects.filter(id=user_id).first()
    if not user:
        return JsonResponse({"detail": "Usuário não encontrado"}, status=404)
    body = json.loads(request.body)
    if "name" in body:
        name = (body.get("name") or "").strip()
        if not name:
            return JsonResponse({"detail": "name is required"}, status=400)
        user.name = name
    if "active" in body:
        user.active = bool(body.get("active"))
    if "is_super_admin" in body:
        user.is_super_admin = bool(body.get("is_super_admin"))
    user.save()
    return JsonResponse(
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "active": user.active,
            "is_super_admin": user.is_super_admin,
        }
    )


@require_http_methods(["POST"])
@super_admin_required
def add_org_member(request, org_id):
    org = AmplexOrganization.objects.filter(id=org_id, active=True).first()
    if not org:
        return JsonResponse({"detail": "Organização não encontrada"}, status=404)
    body = json.loads(request.body)
    user_id = body.get("user_id")
    role = body.get("role", "member")
    if role not in ("member", "admin"):
        role = "member"
    if not user_id:
        return JsonResponse({"detail": "user_id is required"}, status=400)

    user = AmplexUser.objects.filter(id=user_id, active=True).first()
    if not user:
        return JsonResponse({"detail": "Usuário não encontrado"}, status=404)

    member = AmplexOrgMember.objects.filter(org=org, user=user).first()
    if not member:
        has_seat, message = validate_seat_available(org)
        if not has_seat:
            return JsonResponse({"detail": message}, status=409)
        member = AmplexOrgMember.objects.create(
            org=org, user=user, role=role, active=True
        )
    elif not member.active:
        has_seat, message = validate_seat_available(org)
        if not has_seat:
            return JsonResponse({"detail": message}, status=409)
        member.active = True
        member.role = role
        member.save(update_fields=["active", "role"])
    elif member.role != role:
        member.role = role
        member.save(update_fields=["role"])

    return JsonResponse(
        {
            "org_id": org.id,
            "org_name": org.name,
            "user_id": user.id,
            "user_name": user.name,
            "role": member.role,
            "active": member.active,
        }
    )
