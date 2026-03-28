"""Lead attachment routes (upload, download, manage files)."""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context
from app.database import get_db
from app.models import Lead, LeadAttachment
from app.storage import delete_file as delete_stored_file
from app.storage import read_file as read_stored_file
from app.storage import save_file

router = APIRouter(prefix="/amplex/api/o/{org_id}/crm", tags=["attachments"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB per file
ALLOWED_MIMETYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/plain",
    "text/csv",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
}


@router.get("/leads/{lead_id}/attachments")
def list_attachments(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    lead = (
        db.query(Lead)
        .filter(Lead.id == lead_id, Lead.org_id == current_user.org_id)
        .first()
    )
    if not lead:
        raise HTTPException(404, "Not found")

    attachments = (
        db.query(LeadAttachment).filter(LeadAttachment.lead_id == lead.id).all()
    )
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
    current_user: CurrentUser = Depends(get_org_context),
):
    lead = (
        db.query(Lead)
        .filter(Lead.id == lead_id, Lead.org_id == current_user.org_id)
        .first()
    )
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

        # Validate file size
        if len(file_data) > MAX_FILE_SIZE:
            raise HTTPException(413, f"Arquivo '{filename}' excede o limite de 10MB")
        # Validate MIME type
        if mimetype not in ALLOWED_MIMETYPES:
            raise HTTPException(415, f"Tipo de arquivo não permitido: {mimetype}")

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
        created.append(
            {
                "id": att.id,
                "attachment_id": att.id,
                "name": att.filename,
                "description": att.description or "",
                "size": att.file_size,
                "mimetype": att.mimetype or "",
            }
        )

    db.commit()
    return {"items": created}


@router.put("/leads/{lead_id}/attachments/{att_id}")
def update_attachment(
    lead_id: int,
    att_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    att = (
        db.query(LeadAttachment)
        .join(Lead)
        .filter(
            LeadAttachment.id == att_id,
            LeadAttachment.lead_id == lead_id,
            Lead.org_id == current_user.org_id,
        )
        .first()
    )
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
    current_user: CurrentUser = Depends(get_org_context),
):
    att = (
        db.query(LeadAttachment)
        .join(Lead)
        .filter(
            LeadAttachment.id == att_id,
            LeadAttachment.lead_id == lead_id,
            Lead.org_id == current_user.org_id,
        )
        .first()
    )
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
    current_user: CurrentUser = Depends(get_org_context),
):
    att = (
        db.query(LeadAttachment)
        .join(Lead)
        .filter(
            LeadAttachment.id == att_id,
            LeadAttachment.lead_id == lead_id,
            Lead.org_id == current_user.org_id,
        )
        .first()
    )
    if not att:
        raise HTTPException(404, "Not found")

    file_data = read_stored_file(att.storage_path)
    from urllib.parse import quote
    safe_name = quote(att.filename, safe="-_.~ ")
    return Response(
        content=file_data,
        media_type=att.mimetype or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}"},
    )
