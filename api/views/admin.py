"""Global super-admin endpoints."""

import json
import os
import re
import secrets

from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import super_admin_required
from api.models import AmplexOrganization, AmplexOrgMember, AmplexUser
from api.seat_limits import active_members_count, validate_seat_available


def _default_org_slug() -> str:
    return (os.getenv("AMPLEX_DEFAULT_ORG_SLUG") or "").strip().lower()


def _bootstrap_admin_email() -> str:
    return (os.getenv("AMPLEX_ADMIN_EMAIL") or "").strip().lower()


def _is_default_org(org: AmplexOrganization) -> bool:
    slug = _default_org_slug()
    return bool(slug) and org.slug == slug


def _is_bootstrap_super_admin(user: AmplexUser) -> bool:
    email = _bootstrap_admin_email()
    return bool(email) and user.email.lower() == email


def _serialize_user(user: AmplexUser) -> dict:
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
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "active": user.active,
        "is_super_admin": user.is_super_admin,
        "is_default_super_admin": _is_bootstrap_super_admin(user),
        "force_password_change": user.force_password_change,
        "memberships": memberships,
    }


def _membership_payload_from_body(body: dict, role: str):
    raw_memberships = body.get("memberships")
    if raw_memberships is None and body.get("org_id"):
        raw_memberships = [
            {
                "org_id": body.get("org_id"),
                "role": "member" if role == "agente" else "admin",
            }
        ]
    if not isinstance(raw_memberships, list) or not raw_memberships:
        return None, JsonResponse({"detail": "Organização é obrigatória"}, status=400)

    memberships = []
    seen_org_ids = set()
    for raw in raw_memberships:
        if not isinstance(raw, dict):
            return None, JsonResponse({"detail": "Vínculo inválido"}, status=400)
        try:
            org_id = int(raw.get("org_id"))
        except (TypeError, ValueError):
            return None, JsonResponse({"detail": "Organização inválida"}, status=400)
        if org_id in seen_org_ids:
            continue
        member_role = (raw.get("role") or "member").strip().lower()
        if member_role not in ("member", "admin"):
            return None, JsonResponse(
                {"detail": "role de organização inválido"}, status=400
            )
        org = AmplexOrganization.objects.filter(id=org_id, active=True).first()
        if not org:
            return None, JsonResponse(
                {"detail": "Organização não encontrada"}, status=404
            )
        seen_org_ids.add(org_id)
        memberships.append({"org": org, "role": member_role})

    if not memberships:
        return None, JsonResponse({"detail": "Organização é obrigatória"}, status=400)
    return memberships, None


def _sync_user_memberships(user: AmplexUser, memberships: list[dict]):
    desired_org_ids = {item["org"].id for item in memberships}
    existing = {item.org_id: item for item in AmplexOrgMember.objects.filter(user=user)}

    for item in memberships:
        org = item["org"]
        role = item["role"]
        member = existing.get(org.id)
        if member and member.active:
            member.role = role
            member.save(update_fields=["role"])
            continue

        has_seat, message = validate_seat_available(org)
        if not has_seat:
            return JsonResponse({"detail": message}, status=409)
        if member:
            member.role = role
            member.active = True
            member.save(update_fields=["role", "active"])
            continue
        AmplexOrgMember.objects.create(org=org, user=user, role=role, active=True)

    for org_id, member in existing.items():
        if org_id not in desired_org_ids and member.active:
            member.delete()
    return None


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
                "is_default_org": _is_default_org(org),
            }
        )
    return JsonResponse({"items": items})


@require_http_methods(["POST"])
@super_admin_required
def create_org(request):
    body = json.loads(request.body)
    name = (body.get("name") or "").strip()
    slug = (body.get("slug") or "").strip().lower()
    seat_limit_raw = body.get("seat_limit", 1)
    if not name:
        return JsonResponse({"detail": "name is required"}, status=400)
    if not slug or not re.match(r"^[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]$", slug):
        return JsonResponse(
            {"detail": "Slug inválido (3-50 chars, alfanumérico, - ou _)"},
            status=400,
        )
    if AmplexOrganization.objects.filter(slug=slug).exists():
        return JsonResponse({"detail": "Slug já em uso"}, status=409)
    try:
        seat_limit = max(int(seat_limit_raw), 0)
    except (TypeError, ValueError):
        return JsonResponse({"detail": "seat_limit inválido"}, status=400)
    org = AmplexOrganization.objects.create(name=name, slug=slug, seat_limit=seat_limit)
    return JsonResponse(
        {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "active": org.active,
            "seat_limit": org.seat_limit,
            "is_default_org": _is_default_org(org),
        },
        status=201,
    )


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
        next_active = bool(body.get("active"))
        if not next_active and _is_default_org(org):
            return JsonResponse(
                {"detail": "A organização padrão não pode ser desativada."},
                status=409,
            )
        org.active = next_active
    if "seat_limit" in body:
        try:
            seat_limit = int(body.get("seat_limit"))
        except (TypeError, ValueError):
            return JsonResponse({"detail": "seat_limit inválido"}, status=400)
        if seat_limit < 0:
            return JsonResponse({"detail": "seat_limit deve ser >= 0"}, status=400)
        org.seat_limit = seat_limit

    org.save()
    return JsonResponse(
        {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "active": org.active,
            "seat_limit": org.seat_limit,
            "is_default_org": _is_default_org(org),
        }
    )


@require_http_methods(["GET"])
@super_admin_required
def list_users(request):
    items = []
    users = AmplexUser.objects.order_by("name")
    for user in users:
        items.append(_serialize_user(user))
    return JsonResponse({"items": items})


@require_http_methods(["POST"])
@super_admin_required
def create_user(request):
    body = json.loads(request.body)
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    name = (body.get("name") or "").strip()
    role = (body.get("role") or "").strip().lower()
    if role not in ("superadmin", "admin", "agente"):
        return JsonResponse({"detail": "role inválido"}, status=400)
    if not email or len(password) < 6:
        return JsonResponse(
            {"detail": "E-mail e senha (mín. 6 caracteres) obrigatórios"},
            status=400,
        )
    memberships, error = _membership_payload_from_body(body, role)
    if error:
        return error
    if AmplexUser.objects.filter(email=email).exists():
        return JsonResponse({"detail": "E-mail já cadastrado"}, status=409)

    if not name:
        name = email.split("@")[0]

    with transaction.atomic():
        user = AmplexUser.objects.create(
            email=email,
            login=email,
            name=name,
            password_hash=make_password(password),
            is_super_admin=(role == "superadmin"),
        )
        error = _sync_user_memberships(user, memberships)
        if error:
            transaction.set_rollback(True)
            return error

    return JsonResponse(_serialize_user(user), status=201)


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
    if "email" in body:
        email = (body.get("email") or "").strip().lower()
        if not email:
            return JsonResponse({"detail": "email is required"}, status=400)
        if _is_bootstrap_super_admin(user) and email != user.email.lower():
            return JsonResponse(
                {"detail": "O e-mail do superadmin padrão não pode ser alterado."},
                status=409,
            )
        if AmplexUser.objects.filter(email=email).exclude(id=user.id).exists():
            return JsonResponse({"detail": "E-mail já cadastrado"}, status=409)
        user.email = email
        user.login = email
    if "active" in body:
        next_active = bool(body.get("active"))
        if not next_active and _is_bootstrap_super_admin(user):
            return JsonResponse(
                {"detail": "O superadmin padrão não pode ser desativado."},
                status=409,
            )
        user.active = next_active
    if "is_super_admin" in body:
        next_super = bool(body.get("is_super_admin"))
        if not next_super and _is_bootstrap_super_admin(user):
            return JsonResponse(
                {"detail": "O superadmin padrão não pode perder o cargo."},
                status=409,
            )
        user.is_super_admin = next_super
    if "memberships" in body:
        memberships, error = _membership_payload_from_body(
            body, "superadmin" if user.is_super_admin else "agente"
        )
        if error:
            return error
        with transaction.atomic():
            user.save()
            error = _sync_user_memberships(user, memberships)
            if error:
                transaction.set_rollback(True)
                return error
        return JsonResponse(_serialize_user(user))

    user.save()
    return JsonResponse(_serialize_user(user))


@require_http_methods(["POST"])
@super_admin_required
def reset_user_password(request, user_id):
    user = AmplexUser.objects.filter(id=user_id).first()
    if not user:
        return JsonResponse({"detail": "Usuário não encontrado"}, status=404)
    if _is_bootstrap_super_admin(user):
        return JsonResponse(
            {"detail": "O superadmin padrão não pode ter a senha redefinida."},
            status=409,
        )

    temporary_password = secrets.token_urlsafe(12)
    user.password_hash = make_password(temporary_password)
    user.force_password_change = True
    user.session_version = int(user.session_version or 0) + 1
    user.save(
        update_fields=[
            "password_hash",
            "force_password_change",
            "session_version",
            "updated_at",
        ]
    )

    return JsonResponse(
        {
            "id": user.id,
            "temporary_password": temporary_password,
            "force_password_change": user.force_password_change,
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
