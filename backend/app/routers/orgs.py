"""Organization management routes."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user, get_org_context, require_org_admin
from app.database import get_db
from app.models import Organization, OrgMember, Stage, User

router = APIRouter(prefix="/amplex/api", tags=["organizations"])


class OrgCreate(BaseModel):
    hub_org_id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=255)


class OrgUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class MemberAdd(BaseModel):
    user_id: int
    role: str = Field("member", pattern="^(admin|member)$")


# ── User-level routes (no org context needed) ──


@router.get("/orgs")
def list_my_orgs(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List organizations the current user belongs to."""
    memberships = (
        db.query(OrgMember, Organization)
        .join(Organization, Organization.id == OrgMember.org_id)
        .filter(
            OrgMember.user_id == current_user.user_id, Organization.active.is_(True)
        )
        .all()
    )
    return {
        "items": [
            {
                "id": org.id,
                "hub_org_id": org.hub_org_id,
                "name": org.name,
                "role": mem.role,
            }
            for mem, org in memberships
        ]
    }


@router.post("/orgs", status_code=201)
def create_org(
    body: OrgCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Create an organization and make the creator an admin."""
    existing = (
        db.query(Organization)
        .filter(Organization.hub_org_id == body.hub_org_id)
        .first()
    )
    if existing:
        raise HTTPException(409, "Organização com este hub_org_id já existe")

    org = Organization(hub_org_id=body.hub_org_id, name=body.name.strip())
    db.add(org)
    db.flush()

    # Creator becomes admin
    membership = OrgMember(org_id=org.id, user_id=current_user.user_id, role="admin")
    db.add(membership)

    # Seed default pipeline stages
    default_stages = [
        ("Novo", 1, False),
        ("Qualificação", 2, False),
        ("Proposta", 3, False),
        ("Negociação", 4, False),
        ("Ganho", 5, True),
    ]
    for name, seq, is_won in default_stages:
        db.add(Stage(name=name, org_id=org.id, sequence=seq, is_won=is_won))

    db.commit()
    db.refresh(org)

    return {"id": org.id, "hub_org_id": org.hub_org_id, "name": org.name}


# ── Org-scoped routes ──


@router.put("/o/{org_id}/org")
def update_org(
    body: OrgUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    org = db.query(Organization).filter(Organization.id == current_user.org_id).first()
    org.name = body.name.strip()
    db.commit()
    return {"id": org.id, "name": org.name}


@router.get("/o/{org_id}/org/members")
def list_members(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    members = (
        db.query(OrgMember, User)
        .join(User, User.id == OrgMember.user_id)
        .filter(OrgMember.org_id == current_user.org_id)
        .all()
    )
    return {
        "items": [
            {
                "id": mem.id,
                "user_id": user.id,
                "name": user.name,
                "email": user.email,
                "role": mem.role,
            }
            for mem, user in members
        ]
    }


@router.post("/o/{org_id}/org/members", status_code=201)
def add_member(
    body: MemberAdd,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    user = db.query(User).filter(User.id == body.user_id, User.active.is_(True)).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")

    existing = (
        db.query(OrgMember)
        .filter(
            OrgMember.org_id == current_user.org_id, OrgMember.user_id == body.user_id
        )
        .first()
    )
    if existing:
        raise HTTPException(409, "Usuário já é membro desta organização")

    member = OrgMember(org_id=current_user.org_id, user_id=body.user_id, role=body.role)
    db.add(member)
    db.commit()
    return {"id": member.id, "user_id": user.id, "name": user.name, "role": member.role}


@router.delete("/o/{org_id}/org/members/{member_id}")
def remove_member(
    member_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_org_admin),
):
    member = (
        db.query(OrgMember)
        .filter(OrgMember.id == member_id, OrgMember.org_id == current_user.org_id)
        .first()
    )
    if not member:
        raise HTTPException(404, "Membro não encontrado")
    if member.user_id == current_user.user_id:
        raise HTTPException(400, "Não é possível remover a si mesmo")

    db.delete(member)
    db.commit()
    return {"removed": True}
