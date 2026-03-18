"""Auth routes — login proxy and user info."""
import logging

import httpx
from fastapi import APIRouter, Depends, Request

from app.auth import CurrentUser, get_current_user
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/amplex/api/auth", tags=["auth"])


@router.post("/login")
async def login(request: Request):
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
        data = resp.json() if "application/json" in resp.headers.get("content-type", "") else {}
        return {"error": data.get("detail", "Credenciais inválidas")}, resp.status_code

    data = resp.json()
    return {
        "access_token": data.get("access_token", ""),
        "token_type": data.get("token_type", "bearer"),
    }


@router.get("/me")
async def me(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "user_id": current_user.user_id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "hub_id": current_user.hub_id,
    }
