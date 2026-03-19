"""Config routes (product URLs for ProductSwitcher)."""

from fastapi import APIRouter, Depends

from app.auth import CurrentUser, get_org_context
from app.config import settings

router = APIRouter(prefix="/amplex/api/o/{org_id}/crm", tags=["config"])


@router.get("/config")
def get_config(current_user: CurrentUser = Depends(get_org_context)):
    return {
        "hub_url": settings.hub_url,
        "nexus_url": settings.nexus_url,
        "entity_url": settings.entity_url,
    }
