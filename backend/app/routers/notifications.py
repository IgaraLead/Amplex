"""Notification / scheduled activity routes."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_org_context
from app.database import get_db
from app.models import Activity, Interaction, Lead

router = APIRouter(prefix="/amplex/api/o/{org_id}/crm", tags=["notifications"])


@router.get("/notifications")
def list_notifications(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    filters = [Lead.org_id == current_user.org_id]
    if current_user.role != "admin":
        filters.append(Activity.user_id == current_user.user_id)

    activities = (
        db.query(Activity)
        .join(Lead, Activity.lead_id == Lead.id)
        .filter(*filters)
        .order_by(Activity.date_deadline.asc())
        .limit(50)
        .all()
    )

    today = datetime.now().date()
    items = []
    for act in activities:
        deadline = act.date_deadline
        is_overdue = bool(deadline and deadline < today)
        is_today = bool(deadline and deadline == today)

        lead = db.query(Lead).filter(Lead.id == act.lead_id).first()
        items.append(
            {
                "id": act.id,
                "summary": act.summary or "",
                "note": act.note or "",
                "date_deadline": str(act.date_deadline) if act.date_deadline else None,
                "state": "overdue"
                if is_overdue
                else ("today" if is_today else "planned"),
                "activity_type": act.activity_type or "",
                "user_name": act.user.name if act.user else "",
                "lead_id": act.lead_id,
                "lead_name": lead.name if lead else "",
                "create_date": act.created_at,
            }
        )

    overdue_count = sum(1 for i in items if i["state"] == "overdue")
    today_count = sum(1 for i in items if i["state"] == "today")

    return {
        "items": items,
        "total": len(items),
        "overdue_count": overdue_count,
        "today_count": today_count,
        "badge_count": overdue_count + today_count,
    }


@router.post("/notifications/{activity_id}/done")
def complete_notification(
    activity_id: int,
    body: dict = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    activity = (
        db.query(Activity)
        .join(Lead, Activity.lead_id == Lead.id)
        .filter(Activity.id == activity_id, Lead.org_id == current_user.org_id)
        .first()
    )
    if not activity:
        raise HTTPException(404, "Not found")

    body = body or {}
    feedback = body.get("feedback", "")

    # Log completion in the lead timeline
    if activity.lead_id:
        lead = db.query(Lead).filter(Lead.id == activity.lead_id).first()
        if lead:
            feedback_html = f"<p>{feedback}</p>" if feedback else ""
            interaction = Interaction(
                lead_id=lead.id,
                interaction_type="note",
                body=(
                    f"<p>✅ <strong>Atividade concluída</strong>: "
                    f"{activity.summary or 'Retorno'}</p>{feedback_html}"
                ),
                preview=f"Atividade concluída: {activity.summary or 'Retorno'}",
                author_id=current_user.user_id,
            )
            db.add(interaction)

    db.delete(activity)
    db.commit()
    return {"status": "done"}


@router.delete("/notifications/{activity_id}")
def dismiss_notification(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_org_context),
):
    activity = (
        db.query(Activity)
        .join(Lead, Activity.lead_id == Lead.id)
        .filter(Activity.id == activity_id, Lead.org_id == current_user.org_id)
        .first()
    )
    if not activity:
        raise HTTPException(404, "Not found")

    db.delete(activity)
    db.commit()
    return {"status": "dismissed"}
