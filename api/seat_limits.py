"""Seat limit helpers for organization memberships."""

from api.models import AmplexOrgMember


def active_members_count(org) -> int:
    return AmplexOrgMember.objects.filter(org=org, active=True).count()


def seat_limit_reached(org) -> bool:
    if org.seat_limit <= 0:
        return False
    return active_members_count(org) >= org.seat_limit


def can_add_member(org) -> bool:
    if org.seat_limit <= 0:
        return True
    return active_members_count(org) < org.seat_limit


def validate_seat_available(org) -> tuple[bool, str]:
    if can_add_member(org):
        return True, ""
    return False, (
        f"Limite de assentos atingido ({org.seat_limit}). "
        "Aumente o limite da organização para adicionar mais membros."
    )
