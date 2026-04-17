"""Stage management views."""

import json

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required, org_required
from api.models import Lead, Stage


@require_http_methods(["GET"])
@org_required
def list_stages(request, slug):
    org = request.amplex_org
    stages = Stage.objects.filter(org=org).order_by("sequence")
    return JsonResponse(
        {
            "stages": [
                {"id": s.id, "name": s.name, "sequence": s.sequence, "is_won": s.is_won}
                for s in stages
            ]
        }
    )


@require_http_methods(["POST"])
@org_admin_required
def create_stage(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)

    name = (body.get("name") or "").strip()
    if not name:
        return JsonResponse({"detail": "name is required"}, status=400)

    last = Stage.objects.filter(org=org).order_by("-sequence").first()
    seq = (last.sequence + 1) if last else 1

    stage = Stage.objects.create(
        name=name,
        org=org,
        sequence=body.get("sequence", seq),
        is_won=body.get("is_won", False),
    )
    return JsonResponse(
        {"id": stage.id, "name": stage.name, "sequence": stage.sequence}, status=201
    )


@require_http_methods(["PUT"])
@org_admin_required
def update_stage(request, slug, stage_id):
    org = request.amplex_org
    body = json.loads(request.body)

    stage = Stage.objects.filter(id=stage_id, org=org).first()
    if not stage:
        return JsonResponse({"detail": "Not found"}, status=404)

    if "name" in body:
        stage.name = body["name"]
    if "sequence" in body:
        stage.sequence = int(body["sequence"])
    if "is_won" in body:
        stage.is_won = bool(body["is_won"])

    stage.save()
    return JsonResponse(
        {
            "id": stage.id,
            "name": stage.name,
            "sequence": stage.sequence,
            "is_won": stage.is_won,
        }
    )


@require_http_methods(["DELETE"])
@org_admin_required
def delete_stage(request, slug, stage_id):
    org = request.amplex_org
    stage = Stage.objects.filter(id=stage_id, org=org).first()
    if not stage:
        return JsonResponse({"detail": "Not found"}, status=404)

    count = Lead.objects.filter(stage=stage, org=org).count()
    if count > 0:
        return JsonResponse(
            {
                "detail": f"Estágio possui {count} oportunidades. Mova-as antes de excluir."
            },
            status=400,
        )

    stage.delete()
    return JsonResponse({"deleted": True})
