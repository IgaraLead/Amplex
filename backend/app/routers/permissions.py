"""Permission management routes for organization managers."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context, require_org_admin
from app.database import get_db
from app.models import OrgMember, User

router = APIRouter(
    prefix="/amplex/api/o/{org_id}/crm/permissions", tags=["permissions"]
)

# All available permissions and their defaults
PERMISSION_DEFAULTS = {
    "view_all_leads": False,
    "view_all_contacts": True,
    "edit_contacts": True,
    "delete_leads": False,
    "export_data": True,
    "manage_pipeline": False,
}


def get_user_permission(user_model: User, perm: str) -> bool:
    """Check a specific permission for a user. Falls back to default."""
    perms = user_model.permissions or {}
    return perms.get(perm, PERMISSION_DEFAULTS.get(perm, False))


class PermissionUpdate(BaseModel):
    permissions: dict[str, bool]


@router.get("/defaults")
def get_permission_defaults(
    current_user: CurrentUser = Depends(get_org_context),
):
    """Return the list of available permissions with defaults."""
    return {"permissions": PERMISSION_DEFAULTS}


@router.get("/users")
def list_user_permissions(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    """List all active users with their effective permissions."""
    users = (
        db.query(User)
        .join(OrgMember, OrgMember.user_id == User.id)
        .filter(
            OrgMember.org_id == current_user.org_id,
            User.active.is_(True),
            User.is_internal.is_(True),
        )
        .all()
    )
    result = []
    for u in users:
        effective = {k: get_user_permission(u, k) for k in PERMISSION_DEFAULTS}
        result.append(
            {
                "id": u.id,
                "name": u.name,
                "email": u.email or "",
                "permissions": effective,
                "custom": u.permissions or {},
            }
        )
    return {"users": result}


@router.put("/users/{user_id}")
def update_user_permissions(
    user_id: int,
    data: PermissionUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    """Update permissions for a specific user. Only admins/managers can do this."""
    user = (
        db.query(User)
        .join(OrgMember, OrgMember.user_id == User.id)
        .filter(
            User.id == user_id,
            User.active.is_(True),
            OrgMember.org_id == current_user.org_id,
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    # Validate only known permission keys
    invalid = set(data.permissions.keys()) - set(PERMISSION_DEFAULTS.keys())
    if invalid:
        raise HTTPException(
            status_code=422, detail=f"Permissões desconhecidas: {', '.join(invalid)}"
        )

    # Merge: only store non-default values
    current = user.permissions or {}
    for key, value in data.permissions.items():
        if value == PERMISSION_DEFAULTS[key]:
            current.pop(key, None)
        else:
            current[key] = value

    user.permissions = current if current else None
    db.commit()
    db.refresh(user)

    effective = {k: get_user_permission(user, k) for k in PERMISSION_DEFAULTS}
    return {"id": user.id, "name": user.name, "permissions": effective}


@router.post("/users/bulk")
def bulk_update_permissions(
    data: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    """Bulk update a single permission for all users.
    Body: { "permission": "view_all_leads", "value": true }
    """
    perm = data.get("permission", "")
    value = data.get("value")
    if perm not in PERMISSION_DEFAULTS:
        raise HTTPException(status_code=422, detail=f"Permissão desconhecida: {perm}")
    if not isinstance(value, bool):
        raise HTTPException(status_code=422, detail="value deve ser true ou false")

    users = (
        db.query(User)
        .join(OrgMember, OrgMember.user_id == User.id)
        .filter(
            OrgMember.org_id == current_user.org_id,
            User.active.is_(True),
            User.is_internal.is_(True),
        )
        .all()
    )
    for u in users:
        current = u.permissions or {}
        if value == PERMISSION_DEFAULTS[perm]:
            current.pop(perm, None)
        else:
            current[perm] = value
        u.permissions = current if current else None

    db.commit()
    return {"updated": len(users), "permission": perm, "value": value}
