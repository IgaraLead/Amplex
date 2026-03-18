"""Hub user management routes (proxied to Hub API, admin only)."""
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import CurrentUser, require_admin
from app.config import settings
from app.database import get_db
from app.models import User
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/amplex/api/crm/hub", tags=["hub-users"])


def _hub_headers() -> dict:
    return {"X-API-Key": settings.hub_api_key}


@router.get("/users")
async def hub_list_users(current_user: CurrentUser = Depends(require_admin)):
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{settings.hub_api_url}/api/v1/users", headers=_hub_headers())
            if not resp.is_success:
                raise HTTPException(resp.status_code, "Erro ao listar usuários do Hub")
            return resp.json()
        except httpx.RequestError:
            raise HTTPException(502, "Não foi possível conectar ao Hub")


@router.post("/users", status_code=201)
async def hub_create_user(
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(
                f"{settings.hub_api_url}/api/v1/users",
                json=body,
                headers=_hub_headers(),
            )
            if not resp.is_success:
                data = resp.json() if "application/json" in resp.headers.get("content-type", "") else {}
                raise HTTPException(resp.status_code, data.get("detail", "Erro ao criar usuário"))

            hub_user = resp.json()

            # Sync: create local user
            email = hub_user.get("email", "")
            if email and not db.query(User).filter(User.email == email).first():
                new_user = User(
                    name=hub_user.get("name", ""),
                    email=email,
                    login=email,
                    hub_id=str(hub_user.get("id", "")),
                )
                db.add(new_user)
                db.commit()
                logger.info("Created local user %s for Hub user %s", email, hub_user.get("id"))

            return hub_user
        except httpx.RequestError:
            raise HTTPException(502, "Não foi possível conectar ao Hub")


@router.put("/users/{hub_uid}")
async def hub_update_user(
    hub_uid: int,
    body: dict,
    current_user: CurrentUser = Depends(require_admin),
):
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.put(
                f"{settings.hub_api_url}/api/v1/users/{hub_uid}",
                json=body,
                headers=_hub_headers(),
            )
            if not resp.is_success:
                data = resp.json() if "application/json" in resp.headers.get("content-type", "") else {}
                raise HTTPException(resp.status_code, data.get("detail", "Erro ao atualizar usuário"))
            return resp.json()
        except httpx.RequestError:
            raise HTTPException(502, "Não foi possível conectar ao Hub")


@router.delete("/users/{hub_uid}")
async def hub_deactivate_user(
    hub_uid: int,
    current_user: CurrentUser = Depends(require_admin),
):
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.delete(
                f"{settings.hub_api_url}/api/v1/users/{hub_uid}",
                headers=_hub_headers(),
            )
            if not resp.is_success:
                data = resp.json() if "application/json" in resp.headers.get("content-type", "") else {}
                raise HTTPException(resp.status_code, data.get("detail", "Erro ao desativar usuário"))
            return {"deactivated": True}
        except httpx.RequestError:
            raise HTTPException(502, "Não foi possível conectar ao Hub")
