"""Timeline / Interaction routes."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional

from app.auth import CurrentUser, get_current_user
from app.database import get_db
from app.models import Lead, Interaction, InteractionFile, Activity
from app.storage import save_file

router = APIRouter(prefix="/amplex/api/crm", tags=["interactions"])

VALID_TYPES = ("phone", "email", "whatsapp", "meeting", "visit", "note")
TYPE_LABELS = {
    "phone": "📞 Ligação",
    "email": "📧 E-mail",
    "whatsapp": "💬 WhatsApp",
    "meeting": "🤝 Reunião",
    "visit": "🏢 Visita",
    "note": "📝 Nota",
}
ACTIVITY_TYPE_MAP = {"phone": "phone", "email": "email", "meeting": "meeting"}


@router.get("/leads/{lead_id}/interactions")
def list_interactions(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Not found")

    interactions = (
        db.query(Interaction)
        .filter(Interaction.lead_id == lead_id)
        .order_by(Interaction.created_at.desc())
        .limit(100)
        .all()
    )

    items = []
    for inter in interactions:
        items.append({
            "id": inter.id,
            "type": inter.interaction_type,
            "body": inter.body or "",
            "preview": inter.preview or "",
            "date": inter.created_at,
            "author_name": inter.author.name if inter.author else "",
            "author_id": inter.author_id,
            "attachments": [
                {"id": f.id, "name": f.filename, "size": f.file_size}
                for f in inter.files
            ],
        })

    return {"items": items, "total": len(items)}


@router.post("/leads/{lead_id}/interactions", status_code=201)
async def create_interaction(
    lead_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Not found")

    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        description = (form.get("description") or "").strip()
        interaction_type = form.get("type", "note")
        followup_date = form.get("followup_date", "")
        uploaded_files = form.getlist("files")
    else:
        body = await request.json()
        description = (body.get("description") or "").strip()
        interaction_type = body.get("type", "note")
        followup_date = body.get("followup_date", "")
        uploaded_files = []

    if not description:
        raise HTTPException(400, "description is required")

    if interaction_type not in VALID_TYPES:
        interaction_type = "note"

    label = TYPE_LABELS.get(interaction_type, "📝 Nota")
    html_body = f"<p><strong>{label}</strong></p><p>{description}</p>"

    interaction = Interaction(
        lead_id=lead.id,
        interaction_type=interaction_type,
        body=html_body,
        preview=description[:500],
        author_id=current_user.user_id,
    )
    db.add(interaction)
    db.flush()

    # Handle file attachments
    saved_files = []
    for f in uploaded_files:
        if hasattr(f, "read"):
            file_data = await f.read()
            filename = getattr(f, "filename", "file")
            mimetype = getattr(f, "content_type", "application/octet-stream")
            storage_path, file_size = save_file(file_data, filename)
            ifile = InteractionFile(
                interaction_id=interaction.id,
                filename=filename,
                storage_path=storage_path,
                file_size=file_size,
                mimetype=mimetype,
            )
            db.add(ifile)
            saved_files.append({"id": None, "name": filename, "size": file_size})

    # Schedule follow-up activity
    scheduled_activity = None
    if followup_date:
        try:
            parsed_date = datetime.strptime(followup_date, "%Y-%m-%d").date()
            activity_type = ACTIVITY_TYPE_MAP.get(interaction_type, "todo")
            act = Activity(
                lead_id=lead.id,
                user_id=lead.user_id or current_user.user_id,
                activity_type=activity_type,
                summary=f"Retorno: {label} - {lead.name}",
                note=f"<p>Agendar retorno com o cliente.</p><p>{description[:200]}</p>",
                date_deadline=parsed_date,
            )
            db.add(act)
            db.flush()
            scheduled_activity = {
                "id": act.id,
                "summary": act.summary,
                "date_deadline": str(act.date_deadline),
            }
        except (ValueError, TypeError):
            pass

    db.commit()
    db.refresh(interaction)

    result = {
        "id": interaction.id,
        "type": interaction.interaction_type,
        "body": interaction.body,
        "date": interaction.created_at,
        "author_name": interaction.author.name if interaction.author else "",
        "attachments": [
            {"id": f.id, "name": f.filename, "size": f.file_size}
            for f in interaction.files
        ],
    }
    if scheduled_activity:
        result["scheduled_activity"] = scheduled_activity

    return result
