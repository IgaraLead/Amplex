"""Stage management routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user, require_admin
from app.database import get_db
from app.models import Stage, Lead

router = APIRouter(prefix="/amplex/api/crm", tags=["stages"])


@router.get("/stages")
def list_stages(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    stages = db.query(Stage).order_by(Stage.sequence).all()
    return {
        "stages": [
            {"id": s.id, "name": s.name, "sequence": s.sequence, "is_won": s.is_won}
            for s in stages
        ]
    }


@router.post("/stages", status_code=201)
def create_stage(
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name is required")

    last = db.query(Stage).order_by(Stage.sequence.desc()).first()
    seq = (last.sequence + 1) if last else 1

    stage = Stage(
        name=name,
        sequence=body.get("sequence", seq),
        is_won=body.get("is_won", False),
    )
    db.add(stage)
    db.commit()
    db.refresh(stage)

    return {"id": stage.id, "name": stage.name, "sequence": stage.sequence}


@router.put("/stages/{stage_id}")
def update_stage(
    stage_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    stage = db.query(Stage).filter(Stage.id == stage_id).first()
    if not stage:
        raise HTTPException(404, "Not found")

    if "name" in body:
        stage.name = body["name"]
    if "sequence" in body:
        stage.sequence = int(body["sequence"])
    if "is_won" in body:
        stage.is_won = bool(body["is_won"])

    db.commit()
    db.refresh(stage)
    return {"id": stage.id, "name": stage.name, "sequence": stage.sequence, "is_won": stage.is_won}


@router.delete("/stages/{stage_id}")
def delete_stage(
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    stage = db.query(Stage).filter(Stage.id == stage_id).first()
    if not stage:
        raise HTTPException(404, "Not found")

    count = db.query(Lead).filter(Lead.stage_id == stage.id).count()
    if count > 0:
        raise HTTPException(400, f"Estágio possui {count} oportunidades. Mova-as antes de excluir.")

    db.delete(stage)
    db.commit()
    return {"deleted": True}
