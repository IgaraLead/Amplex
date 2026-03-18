"""Config routes (product URLs for ProductSwitcher)."""
from fastapi import APIRouter, Depends

from app.auth import CurrentUser, get_current_user
from app.config import settings

router = APIRouter(prefix="/amplex/api/crm", tags=["config"])


@router.get("/config")
def get_config(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "hub_url": settings.hub_url,
        "nexus_url": settings.nexus_url,
        "entity_url": settings.entity_url,
    }
