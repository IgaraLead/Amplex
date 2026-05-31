"""Stage management views."""

import json

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required, org_required
from api.models import Lead, Stage


def _ensure_fixed_stage(org, name, sequence, is_won, is_lost):
    query = Stage.objects.filter(org=org)
    if is_won:
        candidates = query.filter(is_won=True) | query.filter(name__iexact=name)
    elif is_lost:
        candidates = query.filter(is_lost=True) | query.filter(name__iexact=name)
    else:
        candidates = query.filter(name__iexact=name)

    stages = list(candidates.distinct().order_by("-is_fixed", "id"))
    canonical = stages[0] if stages else Stage(org=org, name=name)
    canonical.name = name
    canonical.sequence = sequence
    canonical.is_won = is_won
    canonical.is_lost = is_lost
    canonical.is_fixed = True
    canonical.save()

    for duplicate in stages[1:]:
        Lead.objects.filter(stage=duplicate, org=org).update(stage=canonical)
        duplicate.delete()

    return canonical


def ensure_fixed_stages(org):
    _ensure_fixed_stage(org, "Ganho", 900, True, False)
    _ensure_fixed_stage(org, "Perdido", 1000, False, True)


def normalize_stage_sequences(org):
    regular_stages = Stage.objects.filter(org=org, is_fixed=False).order_by(
        "sequence", "id"
    )
    for index, stage in enumerate(regular_stages, start=1):
        next_sequence = index * 10
        if stage.sequence != next_sequence:
            stage.sequence = next_sequence
            stage.save(update_fields=["sequence"])
    ensure_fixed_stages(org)


def serialize_stage(stage):
    return {
        "id": stage.id,
        "name": stage.name,
        "sequence": stage.sequence,
        "is_won": stage.is_won,
        "is_lost": stage.is_lost,
        "is_fixed": stage.is_fixed,
    }


@require_http_methods(["GET"])
@org_required
def list_stages(request, slug):
    org = request.amplex_org
    normalize_stage_sequences(org)
    stages = Stage.objects.filter(org=org).order_by("sequence")
    return JsonResponse(
        {
            "items": [serialize_stage(s) for s in stages],
            "stages": [serialize_stage(s) for s in stages],
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

    last = Stage.objects.filter(org=org, is_fixed=False).order_by("-sequence").first()
    seq = (last.sequence + 10) if last else 10

    stage = Stage.objects.create(
        name=name,
        org=org,
        sequence=seq,
        is_won=False,
        is_lost=False,
        is_fixed=False,
    )
    return JsonResponse(serialize_stage(stage), status=201)


@require_http_methods(["PUT"])
@org_admin_required
def update_stage(request, slug, stage_id):
    org = request.amplex_org
    body = json.loads(request.body)

    stage = Stage.objects.filter(id=stage_id, org=org).first()
    if not stage:
        return JsonResponse({"detail": "Not found"}, status=404)
    if stage.is_fixed:
        return JsonResponse(
            {"detail": "Estágio fixo não pode ser editado."}, status=409
        )

    if "name" in body:
        name = (body["name"] or "").strip()
        if not name:
            return JsonResponse({"detail": "name is required"}, status=400)
        stage.name = name

    stage.save()
    return JsonResponse(serialize_stage(stage))


@require_http_methods(["PUT"])
@org_admin_required
def reorder_stages(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)
    stage_ids = body.get("stage_ids") or []
    if not isinstance(stage_ids, list):
        return JsonResponse({"detail": "stage_ids must be a list"}, status=400)

    regular_stages = {
        stage.id: stage for stage in Stage.objects.filter(org=org, is_fixed=False)
    }
    seen = []
    for raw_id in stage_ids:
        stage_id = int(raw_id)
        if stage_id in regular_stages and stage_id not in seen:
            seen.append(stage_id)

    for stage_id in regular_stages:
        if stage_id not in seen:
            seen.append(stage_id)

    for index, stage_id in enumerate(seen, start=1):
        stage = regular_stages[stage_id]
        stage.sequence = index * 10
        stage.save(update_fields=["sequence"])

    ensure_fixed_stages(org)
    stages = Stage.objects.filter(org=org).order_by("sequence")
    return JsonResponse(
        {
            "items": [serialize_stage(stage) for stage in stages],
            "stages": [serialize_stage(stage) for stage in stages],
        }
    )


@require_http_methods(["DELETE"])
@org_admin_required
def delete_stage(request, slug, stage_id):
    org = request.amplex_org
    stage = Stage.objects.filter(id=stage_id, org=org).first()
    if not stage:
        return JsonResponse({"detail": "Not found"}, status=404)
    if stage.is_fixed:
        return JsonResponse(
            {"detail": "Estágio fixo não pode ser excluído."}, status=409
        )

    active_opportunities = Lead.objects.filter(
        stage=stage, org=org, active=True, type="opportunity"
    )
    count = active_opportunities.count()
    destination = (
        Stage.objects.filter(org=org, is_fixed=False)
        .exclude(id=stage.id)
        .order_by("sequence", "id")
        .first()
    )
    if count > 0 and not destination:
        return JsonResponse(
            {
                "detail": (
                    f"Estágio possui {count} oportunidades. Crie ou mantenha outro estágio "
                    "operacional antes de excluir."
                )
            },
            status=400,
        )

    if destination:
        active_opportunities.update(stage=destination)

    stage.delete()
    normalize_stage_sequences(org)
    return JsonResponse(
        {
            "deleted": True,
            "moved_leads": count,
            "destination_stage_id": destination.id if destination else None,
            "destination_stage_name": destination.name if destination else "",
        }
    )
