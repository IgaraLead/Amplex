"""Organization views."""

import json
import re
import uuid

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import login_required, org_admin_required, org_required
from api.models import AmplexOrganization, AmplexOrgMember, AmplexUser, Stage
from api.seat_limits import validate_seat_available
from api.user_deletion import delete_org_member_user, get_org_user_data_counts

DEFAULT_STAGES = [
    ("Novo", 1, False),
    ("Qualificação", 2, False),
    ("Proposta", 3, False),
    ("Negociação", 4, False),
    ("Ganho", 5, True),
]


def _active_admin_count(org, excluded_user_id=None):
    qs = AmplexOrgMember.objects.filter(org=org, active=True, role="admin")
    if excluded_user_id:
        qs = qs.exclude(user_id=excluded_user_id)
    return qs.count()


def _serialize_member(org, member):
    return {
        "id": member.user.id,
        "user_id": member.user.id,
        "name": member.user.name,
        "email": member.user.email,
        "role": member.role,
        "avatar_url": "",
        "data_counts": get_org_user_data_counts(org, member.user),
    }


@require_http_methods(["GET"])
@login_required
def list_my_orgs(request):
    user = request.amplex_user
    memberships = AmplexOrgMember.objects.filter(
        user_id=user["user_id"], active=True
    ).select_related("org")

    return JsonResponse(
        {
            "items": [
                {
                    "id": m.org.id,
                    "name": m.org.name,
                    "slug": m.org.slug or "",
                    "role": m.role,
                }
                for m in memberships
            ]
        }
    )


@require_http_methods(["POST"])
@login_required
def create_org(request):
    user = request.amplex_user
    body = json.loads(request.body)

    name = (body.get("name") or "").strip()
    if not name:
        return JsonResponse({"detail": "name is required"}, status=400)

    slug = (body.get("slug") or "").strip().lower()
    if not slug:
        slug = f"org-{uuid.uuid4().hex[:12]}"
    if not re.match(r"^[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]$", slug):
        return JsonResponse(
            {"detail": "Slug inválido (3-50 chars, alfanumérico, - ou _)"},
            status=400,
        )
    if AmplexOrganization.objects.filter(slug=slug).exists():
        return JsonResponse({"detail": "Slug já em uso"}, status=409)

    org = AmplexOrganization.objects.create(name=name, slug=slug)

    u = AmplexUser.objects.filter(id=user["user_id"]).first()
    if u:
        AmplexOrgMember.objects.create(org=org, user=u, role="admin")

    for stage_name, seq, is_won in DEFAULT_STAGES:
        Stage.objects.create(org=org, name=stage_name, sequence=seq, is_won=is_won)

    return JsonResponse(
        {"id": org.id, "name": org.name, "slug": org.slug or ""},
        status=201,
    )


@require_http_methods(["PUT"])
@org_admin_required
def update_org(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)

    if "name" in body:
        org.name = body["name"]
    if "slug" in body:
        new_slug = (body["slug"] or "").strip().lower()
        if new_slug and not re.match(r"^[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]$", new_slug):
            return JsonResponse(
                {"detail": "Slug inválido (3-50 chars, alfanumérico, - ou _)"},
                status=400,
            )
        if (
            new_slug
            and AmplexOrganization.objects.filter(slug=new_slug)
            .exclude(id=org.id)
            .exists()
        ):
            return JsonResponse({"detail": "Slug já em uso"}, status=409)
        org.slug = new_slug
    org.save()

    return JsonResponse({"id": org.id, "name": org.name, "slug": org.slug or ""})


@require_http_methods(["GET"])
@org_required
def list_members(request, slug):
    org = request.amplex_org
    members = AmplexOrgMember.objects.filter(org=org, active=True).select_related(
        "user"
    )
    items = [_serialize_member(org, member) for member in members if member.user.active]

    return JsonResponse({"items": items})


@require_http_methods(["POST"])
@org_admin_required
def add_member(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)

    user_id = body.get("user_id")
    role = body.get("role", "member")
    if not user_id:
        return JsonResponse({"detail": "user_id is required"}, status=400)

    u = AmplexUser.objects.filter(id=user_id).first()
    if not u:
        return JsonResponse({"detail": "User not found"}, status=404)

    member = AmplexOrgMember.objects.filter(org=org, user=u).first()
    if not member:
        has_seat, message = validate_seat_available(org)
        if not has_seat:
            return JsonResponse({"detail": message}, status=409)
        member = AmplexOrgMember.objects.create(org=org, user=u, role=role)
        created = True
    elif not member.active:
        has_seat, message = validate_seat_available(org)
        if not has_seat:
            return JsonResponse({"detail": message}, status=409)
        member.active = True
        member.role = role
        member.save(update_fields=["active", "role"])
        created = False
    elif member.role != role:
        member.role = role
        member.save(update_fields=["role"])
        created = False
    else:
        created = False

    return JsonResponse(
        {"user_id": u.id, "name": u.name, "role": member.role},
        status=201 if created else 200,
    )


@require_http_methods(["PUT"])
@org_admin_required
def update_member(request, slug, user_id):
    org = request.amplex_org
    member = (
        AmplexOrgMember.objects.select_related("user")
        .filter(org=org, user_id=user_id, active=True)
        .first()
    )
    if not member or not member.user.active:
        return JsonResponse(
            {"detail": "Usuário não encontrado nesta organização."}, status=404
        )

    body = json.loads(request.body)
    user = member.user
    update_user_fields = []

    if "name" in body:
        name = (body.get("name") or "").strip()
        if not name:
            return JsonResponse({"detail": "name is required"}, status=400)
        user.name = name
        update_user_fields.append("name")

    if "email" in body:
        email = (body.get("email") or "").strip().lower()
        if not email:
            return JsonResponse({"detail": "email is required"}, status=400)
        if AmplexUser.objects.filter(email=email).exclude(id=user.id).exists():
            return JsonResponse({"detail": "E-mail já cadastrado"}, status=409)
        user.email = email
        user.login = email
        update_user_fields.extend(["email", "login"])

    if "role" in body:
        role = (body.get("role") or "").strip().lower()
        if role not in ("admin", "member"):
            return JsonResponse({"detail": "role inválido"}, status=400)
        if (
            member.role == "admin"
            and role != "admin"
            and _active_admin_count(org, user.id) == 0
        ):
            return JsonResponse(
                {"detail": "A organização precisa manter pelo menos um gestor ativo."},
                status=409,
            )
        member.role = role
        member.save(update_fields=["role"])

    if update_user_fields:
        update_user_fields.append("updated_at")
        user.save(update_fields=update_user_fields)

    return JsonResponse(_serialize_member(org, member))


@require_http_methods(["DELETE"])
@org_admin_required
def remove_member(request, slug, user_id):
    org = request.amplex_org
    body = json.loads(request.body or "{}")
    payload, status = delete_org_member_user(
        org=org,
        user_id=user_id,
        actor_user_id=request.amplex_user["user_id"],
        payload=body,
    )
    return JsonResponse(payload, status=status)
