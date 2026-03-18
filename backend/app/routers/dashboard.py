"""Dashboard routes."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user, require_admin
from app.database import get_db
from app.models import Lead, Stage, Contact, User, Source, Interaction

router = APIRouter(prefix="/amplex/api/crm", tags=["dashboard"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    is_manager = current_user.role == "admin"

    def base_filter():
        q = [Lead.active.is_(True)]
        if not is_manager:
            q.append(Lead.user_id == current_user.user_id)
        return q

    today = datetime.now().date()
    month_start = today.replace(day=1)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)

    total_leads = db.query(func.count(Lead.id)).filter(*base_filter(), Lead.type == "lead").scalar() or 0
    total_opps = db.query(func.count(Lead.id)).filter(*base_filter(), Lead.type == "opportunity").scalar() or 0

    won_stages = db.query(Stage.id).filter(Stage.is_won.is_(True)).subquery()
    won = db.query(func.count(Lead.id)).filter(*base_filter(), Lead.stage_id.in_(won_stages.select())).scalar() or 0

    lost_filters = [Lead.active.is_(False), Lead.probability == 0]
    if not is_manager:
        lost_filters.append(Lead.user_id == current_user.user_id)
    lost = db.query(func.count(Lead.id)).filter(*lost_filters).scalar() or 0

    total_revenue = (
        db.query(func.coalesce(func.sum(Lead.expected_revenue), 0))
        .filter(*base_filter(), Lead.stage_id.in_(won_stages.select()))
        .scalar()
    )

    new_this_month = db.query(func.count(Lead.id)).filter(
        *base_filter(), Lead.created_at >= month_start.isoformat()
    ).scalar() or 0
    new_last_month = db.query(func.count(Lead.id)).filter(
        *base_filter(),
        Lead.created_at >= last_month_start.isoformat(),
        Lead.created_at < month_start.isoformat(),
    ).scalar() or 0

    stages = []
    for stage in db.query(Stage).order_by(Stage.sequence).all():
        filters = base_filter() + [Lead.stage_id == stage.id]
        count = db.query(func.count(Lead.id)).filter(*filters).scalar() or 0
        revenue = db.query(func.coalesce(func.sum(Lead.expected_revenue), 0)).filter(*filters).scalar()
        stages.append({
            "id": stage.id,
            "name": stage.name,
            "count": count,
            "revenue": round(float(revenue), 2),
            "is_won": stage.is_won,
            "sequence": stage.sequence,
        })

    total_contacts = db.query(func.count(Contact.id)).filter(Contact.active.is_(True)).scalar() or 0

    return {
        "pipeline": {
            "total_leads": total_leads,
            "total_opportunities": total_opps,
            "won": won,
            "lost": lost,
            "total_revenue": round(float(total_revenue), 2),
            "new_this_month": new_this_month,
            "new_last_month": new_last_month,
        },
        "stages": stages,
        "total_contacts": total_contacts,
    }


@router.get("/dashboard/advanced")
def dashboard_advanced(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin)):
    today = datetime.now().date()

    # Vendor performance
    crm_users = db.query(User).filter(User.is_internal.is_(True), User.active.is_(True)).all()
    won_stage_ids = [s.id for s in db.query(Stage).filter(Stage.is_won.is_(True)).all()]
    vendor_performance = []
    for u in crm_users:
        total = db.query(func.count(Lead.id)).filter(Lead.active.is_(True), Lead.user_id == u.id).scalar() or 0
        w = db.query(func.count(Lead.id)).filter(
            Lead.active.is_(True), Lead.user_id == u.id, Lead.stage_id.in_(won_stage_ids)
        ).scalar() or 0
        l = db.query(func.count(Lead.id)).filter(
            Lead.active.is_(False), Lead.probability == 0, Lead.user_id == u.id
        ).scalar() or 0
        rev = db.query(func.coalesce(func.sum(Lead.expected_revenue), 0)).filter(
            Lead.active.is_(True), Lead.user_id == u.id, Lead.stage_id.in_(won_stage_ids)
        ).scalar()
        vendor_performance.append({
            "user_id": u.id,
            "name": u.name,
            "total": total,
            "won": w,
            "lost": l,
            "revenue": round(float(rev), 2),
            "conversion": round(w / (w + l) * 100, 1) if (w + l) > 0 else 0,
        })

    # Origin breakdown
    sources = db.query(Source).all()
    origin_breakdown = []
    for src in sources:
        count = db.query(func.count(Lead.id)).filter(Lead.active.is_(True), Lead.source_id == src.id).scalar() or 0
        if count > 0:
            origin_breakdown.append({"source_id": src.id, "name": src.name, "count": count})
    no_source = db.query(func.count(Lead.id)).filter(Lead.active.is_(True), Lead.source_id.is_(None)).scalar() or 0
    if no_source > 0:
        origin_breakdown.append({"source_id": None, "name": "Sem origem", "count": no_source})

    # Leads over time (6 months)
    leads_over_time = []
    for i in range(5, -1, -1):
        m_start = (today.replace(day=1) - timedelta(days=30 * i)).replace(day=1)
        m_end = (m_start.replace(day=28) + timedelta(days=4)).replace(day=1) if i > 0 else today + timedelta(days=1)
        count = db.query(func.count(Lead.id)).filter(
            Lead.created_at >= m_start.isoformat(),
            Lead.created_at < m_end.isoformat(),
        ).scalar() or 0
        leads_over_time.append({
            "month": m_start.strftime("%Y-%m"),
            "label": m_start.strftime("%b/%Y"),
            "count": count,
        })

    # Revenue forecast
    revenue_forecast = []
    for i in range(6):
        m_start = (today.replace(day=1) + timedelta(days=30 * i)).replace(day=1)
        m_end = (m_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        result = db.query(
            func.coalesce(func.sum(Lead.expected_revenue), 0),
            func.count(Lead.id),
        ).filter(
            Lead.active.is_(True),
            Lead.date_deadline >= m_start,
            Lead.date_deadline < m_end,
            Lead.stage_id.notin_([s.id for s in db.query(Stage).filter(Stage.is_won.is_(True)).all()]) if db.query(Stage).filter(Stage.is_won.is_(True)).all() else True,
        ).first()
        total_rev, cnt = float(result[0]), result[1]
        if total_rev > 0:
            revenue_forecast.append({
                "month": m_start.strftime("%Y-%m"),
                "label": m_start.strftime("%b/%Y"),
                "revenue": round(total_rev, 2),
                "count": cnt,
            })

    return {
        "vendor_performance": vendor_performance,
        "origin_breakdown": origin_breakdown,
        "leads_over_time": leads_over_time,
        "revenue_forecast": revenue_forecast,
    }


@router.get("/leads/next-contacts")
def next_contacts(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    limit = min(limit, 50)
    filters = [Lead.active.is_(True)]
    if current_user.role != "admin":
        filters.append(Lead.user_id == current_user.user_id)

    leads = db.query(Lead).filter(*filters).order_by(Lead.updated_at.asc()).limit(limit).all()

    items = []
    now = datetime.now()
    for lead in leads:
        last_interaction = (
            db.query(Interaction)
            .filter(Interaction.lead_id == lead.id)
            .order_by(Interaction.created_at.desc())
            .first()
        )
        last_contact = last_interaction.created_at if last_interaction else lead.created_at
        days_since = (now - last_contact).days if last_contact else 999
        items.append({
            "id": lead.id,
            "name": lead.name,
            "contact_name": lead.contact_name or (lead.contact.name if lead.contact else ""),
            "phone": lead.phone or "",
            "email_from": lead.email_from or "",
            "stage_name": lead.stage.name if lead.stage else "",
            "expected_revenue": lead.expected_revenue or 0,
            "last_contact": str(last_contact) if last_contact else None,
            "days_since_contact": days_since,
        })

    items.sort(key=lambda x: x["days_since_contact"], reverse=True)
    return {"items": items}
