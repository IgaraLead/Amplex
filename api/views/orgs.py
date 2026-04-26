"""Organization views."""

import json
import re

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import login_required, org_admin_required, org_required
from api.models import AmplexOrganization, AmplexOrgMember, AmplexUser, Stage

DEFAULT_STAGES = [
    ("Novo", 1, False),
    ("Qualificação", 2, False),
    ("Proposta", 3, False),
    ("Negociação", 4, False),
    ("Ganho", 5, True),
]


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
    if slug and not re.match(r"^[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]$", slug):
        return JsonResponse(
            {"detail": "Slug inválido (3-50 chars, alfanumérico, - ou _)"},
            status=400,
        )
    if slug and AmplexOrganization.objects.filter(slug=slug).exists():
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

    return JsonResponse(
        {
            "items": [
                {
                    "user_id": m.user.id,
                    "name": m.user.name,
                    "email": m.user.email,
                    "role": m.role,
                    "avatar_url": m.user.avatar_url or "",
                }
                for m in members
                if m.user.active
            ]
        }
    )


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

    member, created = AmplexOrgMember.objects.get_or_create(
        org=org, user=u, defaults={"role": role}
    )
    if not created and not member.active:
        member.active = True
        member.role = role
        member.save(update_fields=["active", "role"])

    return JsonResponse(
        {"user_id": u.id, "name": u.name, "role": member.role},
        status=201 if created else 200,
    )


@require_http_methods(["DELETE"])
@org_admin_required
def remove_member(request, slug, user_id):
    org = request.amplex_org
    member = AmplexOrgMember.objects.filter(org=org, user_id=user_id).first()
    if not member:
        return JsonResponse({"detail": "Not found"}, status=404)

    member.active = False
    member.save(update_fields=["active"])
    return JsonResponse({"removed": True})
