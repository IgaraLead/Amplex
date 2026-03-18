"""Lead attachment routes (upload, download, manage files)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.database import get_db
from app.models import Lead, LeadAttachment
from app.storage import save_file, read_file as read_stored_file, delete_file as delete_stored_file

router = APIRouter(prefix="/amplex/api/crm", tags=["attachments"])


@router.get("/leads/{lead_id}/attachments")
def list_attachments(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Not found")

    attachments = db.query(LeadAttachment).filter(LeadAttachment.lead_id == lead.id).all()
    return {
        "items": [
            {
                "id": a.id,
                "attachment_id": a.id,
                "name": a.filename,
                "description": a.description or "",
                "size": a.file_size,
                "mimetype": a.mimetype or "",
                "create_date": a.created_at,
            }
            for a in attachments
        ]
    }


@router.post("/leads/{lead_id}/attachments")
async def upload_attachment(
    lead_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Not found")

    form = await request.form()
    files = form.getlist("files")
    if not files:
        raise HTTPException(400, "No files provided")

    description = (form.get("description") or "").strip() or None

    created = []
    for f in files:
        if not hasattr(f, "read"):
            continue
        file_data = await f.read()
        filename = getattr(f, "filename", "file")
        mimetype = getattr(f, "content_type", "application/octet-stream")
        storage_path, file_size = save_file(file_data, filename)

        att = LeadAttachment(
            lead_id=lead.id,
            filename=filename,
            storage_path=storage_path,
            file_size=file_size,
            mimetype=mimetype,
            description=description,
        )
        db.add(att)
        db.flush()
        created.append({
            "id": att.id,
            "attachment_id": att.id,
            "name": att.filename,
            "description": att.description or "",
            "size": att.file_size,
            "mimetype": att.mimetype or "",
        })

    db.commit()
    return {"items": created}


@router.put("/leads/{lead_id}/attachments/{att_id}")
def update_attachment(
    lead_id: int,
    att_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    att = db.query(LeadAttachment).filter(
        LeadAttachment.id == att_id,
        LeadAttachment.lead_id == lead_id,
    ).first()
    if not att:
        raise HTTPException(404, "Not found")

    if "description" in body:
        att.description = body["description"] or None
    db.commit()
    return {"id": att.id, "description": att.description or ""}


@router.delete("/leads/{lead_id}/attachments/{att_id}")
def delete_attachment(
    lead_id: int,
    att_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    att = db.query(LeadAttachment).filter(
        LeadAttachment.id == att_id,
        LeadAttachment.lead_id == lead_id,
    ).first()
    if not att:
        raise HTTPException(404, "Not found")

    delete_stored_file(att.storage_path)
    db.delete(att)
    db.commit()
    return {"deleted": True}


@router.get("/leads/{lead_id}/attachments/{att_id}/download")
def download_attachment(
    lead_id: int,
    att_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    att = db.query(LeadAttachment).filter(
        LeadAttachment.id == att_id,
        LeadAttachment.lead_id == lead_id,
    ).first()
    if not att:
        raise HTTPException(404, "Not found")

    file_data = read_stored_file(att.storage_path)
    return Response(
        content=file_data,
        media_type=att.mimetype or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{att.filename}"'},
    )
