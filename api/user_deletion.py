"""Helpers for deleting organization users and handling their CRM data."""

from django.db import transaction

from api.models import Activity, AmplexOrgMember, AmplexUser, Interaction, Lead

VALID_DATA_ACTIONS = {"none", "migrate", "delete"}


def get_org_user_data_counts(org, user: AmplexUser) -> dict:
    lead_count = Lead.objects.filter(org=org, user=user).count()
    interaction_count = Interaction.objects.filter(lead__org=org, author=user).count()
    activity_count = Activity.objects.filter(lead__org=org, user=user).count()
    return {
        "leads": lead_count,
        "interactions": interaction_count,
        "activities": activity_count,
        "total": lead_count + interaction_count + activity_count,
    }


def _active_admin_count(org, user_id: int | None = None) -> int:
    qs = AmplexOrgMember.objects.filter(org=org, active=True, role="admin")
    if user_id is not None:
        qs = qs.exclude(user_id=user_id)
    return qs.count()


def _validate_target_user(org, user: AmplexUser, target_user_id):
    if not target_user_id:
        return None, "Selecione um usuário para receber os dados."
    try:
        parsed_target_id = int(target_user_id)
    except (TypeError, ValueError):
        return None, "Usuário de destino inválido."
    if parsed_target_id == user.id:
        return None, "O usuário de destino deve ser diferente do usuário excluído."
    target_member = (
        AmplexOrgMember.objects.select_related("user")
        .filter(org=org, user_id=parsed_target_id, active=True, user__active=True)
        .first()
    )
    if not target_member:
        return None, "Usuário de destino não encontrado nesta organização."
    return target_member.user, ""


def _migrate_org_user_data(org, user: AmplexUser, target_user: AmplexUser) -> dict:
    lead_count = Lead.objects.filter(org=org, user=user).update(user=target_user)
    interaction_count = Interaction.objects.filter(lead__org=org, author=user).update(
        author=target_user
    )
    activity_count = Activity.objects.filter(lead__org=org, user=user).update(
        user=target_user
    )
    return {
        "leads": lead_count,
        "interactions": interaction_count,
        "activities": activity_count,
    }


def _delete_org_user_data(org, user: AmplexUser) -> dict:
    lead_qs = Lead.objects.filter(org=org, user=user)
    interaction_qs = Interaction.objects.filter(lead__org=org, author=user)
    activity_qs = Activity.objects.filter(lead__org=org, user=user)
    lead_count = lead_qs.count()
    interaction_count = interaction_qs.count()
    activity_count = activity_qs.count()
    lead_qs.delete()
    interaction_qs.delete()
    activity_qs.delete()
    return {
        "leads": lead_count,
        "interactions": interaction_count,
        "activities": activity_count,
    }


def delete_org_member_user(
    *, org, user_id: int, actor_user_id: int, payload: dict
) -> tuple[dict, int]:
    member = (
        AmplexOrgMember.objects.select_related("user")
        .filter(org=org, user_id=user_id, active=True)
        .first()
    )
    if not member:
        return {"detail": "Usuário não encontrado nesta organização."}, 404
    if member.user_id == actor_user_id:
        return {"detail": "Você não pode excluir o próprio acesso."}, 409
    if member.role == "admin" and _active_admin_count(org, member.user_id) == 0:
        return {
            "detail": "A organização precisa manter pelo menos um gestor ativo."
        }, 409

    data_action = (payload.get("data_action") or "none").strip().lower()
    if data_action not in VALID_DATA_ACTIONS:
        return {"detail": "Ação de dados inválida."}, 400

    counts = get_org_user_data_counts(org, member.user)
    if counts["total"] > 0 and data_action == "none":
        return {
            "detail": "Escolha se os dados serão migrados ou apagados.",
            "data_counts": counts,
            "requires_data_action": True,
        }, 409

    target_user = None
    if data_action == "migrate":
        target_user, message = _validate_target_user(
            org, member.user, payload.get("target_user_id")
        )
        if message:
            return {"detail": message}, 400

    with transaction.atomic():
        locked_member = (
            AmplexOrgMember.objects.select_for_update()
            .select_related("user")
            .filter(id=member.id, active=True)
            .first()
        )
        if not locked_member:
            return {"detail": "Usuário não encontrado nesta organização."}, 404

        handled_counts = {"leads": 0, "interactions": 0, "activities": 0}
        if data_action == "migrate":
            handled_counts = _migrate_org_user_data(
                org, locked_member.user, target_user
            )
        elif data_action == "delete":
            handled_counts = _delete_org_user_data(org, locked_member.user)

        deleted_user = locked_member.user
        locked_member.delete()
        user_deleted = False
        if (
            not deleted_user.is_super_admin
            and not AmplexOrgMember.objects.filter(
                user=deleted_user, active=True
            ).exists()
        ):
            deleted_user.delete()
            user_deleted = True

    return {
        "removed": True,
        "user_deleted": user_deleted,
        "data_action": data_action,
        "data_counts": counts,
        "handled_counts": handled_counts,
    }, 200
