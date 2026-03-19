"""Auth routes — login proxy, user info, and logout."""

import logging

import httpx
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.auth import CurrentUser, clear_auth_cookies, get_current_user, set_auth_cookies
from app.config import settings
from app.database import get_db
from app.models import Organization, OrgMember

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/amplex/api/auth", tags=["auth"])


@router.post("/login")
async def login(request: Request, response: Response):
    body = await request.json()
    email = body.get("email", "")
    password = body.get("password", "")
    if not email or not password:
        return {"error": "E-mail e senha são obrigatórios"}, 400

    if not settings.hub_api_url:
        return {"error": "Hub não configurado"}, 500

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(
                f"{settings.hub_api_url}/api/v1/auth/login",
                json={"email": email, "password": password},
            )
        except httpx.RequestError as exc:
            logger.error("Hub login proxy error: %s", exc)
            return {"error": "Não foi possível conectar ao Hub"}, 502

    if resp.status_code != 200:
        data = (
            resp.json()
            if "application/json" in resp.headers.get("content-type", "")
            else {}
        )
        return {"error": data.get("detail", "Credenciais inválidas")}, resp.status_code

    data = resp.json()
    access_token = data.get("access_token", "")
    refresh_token = data.get("refresh_token", "")
    set_auth_cookies(response, access_token, refresh_token)
    return {
        "access_token": access_token,
        "token_type": data.get("token_type", "bearer"),
    }


@router.get("/me")
async def me(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    memberships = (
        db.query(OrgMember, Organization)
        .join(Organization, Organization.id == OrgMember.org_id)
        .filter(
            OrgMember.user_id == current_user.user_id, Organization.active.is_(True)
        )
        .all()
    )
    return {
        "user_id": current_user.user_id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "hub_id": current_user.hub_id,
        "organizations": [
            {
                "id": org.id,
                "hub_org_id": org.hub_org_id,
                "name": org.name,
                "role": mem.role,
            }
            for mem, org in memberships
        ],
    }


@router.post("/logout")
def logout(response: Response):
    clear_auth_cookies(response)
    return {"message": "Logout realizado"}
