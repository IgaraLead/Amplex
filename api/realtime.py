"""Org-scoped realtime fan-out (Channels + Redis)."""

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def org_realtime_group_name(org_slug: str) -> str:
    return f"amplex_org_{org_slug}"


def broadcast_leads_updated(org_slug: str, *, lead_id: int | None = None) -> None:
    """Notify all connected clients in the org that CRM data changed."""
    layer = get_channel_layer()
    if layer is None:
        return
    payload: dict = {"domain": "amplex", "type": "leads_updated"}
    if lead_id is not None:
        payload["lead_id"] = lead_id
    async_to_sync(layer.group_send)(
        org_realtime_group_name(org_slug),
        {"type": "crm_push", "payload": payload},
    )
