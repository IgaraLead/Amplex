"""Export routes (CSV, XLSX, PDF)."""
import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.database import get_db
from app.models import Lead, Contact

router = APIRouter(prefix="/amplex/api/crm/export", tags=["export"])


def _export_response(headers: list, rows: list, fmt: str, filename: str):
    """Generate export in CSV, XLSX, or PDF format."""
    if fmt == "xlsx":
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(headers)
        for row in rows:
            ws.append(row)
        for cell in ws[1]:
            cell.font = openpyxl.styles.Font(bold=True)
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}.xlsx"'},
        )

    if fmt == "pdf":
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle

        output = io.BytesIO()
        doc = SimpleDocTemplate(output, pagesize=landscape(A4))
        pdf_data = [headers] + [[str(v)[:30] for v in row] for row in rows]
        table = Table(pdf_data)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0070FF")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ]))
        doc.build([table])
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
        )

    # Default: CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    csv_bytes = output.getvalue().encode("utf-8")
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
    )


@router.get("/leads")
def export_leads(
    format: str = Query("csv"),
    type: str = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    filters = [Lead.active.is_(True)]
    if type in ("lead", "opportunity"):
        filters.append(Lead.type == type)
    if current_user.role != "admin":
        filters.append(Lead.user_id == current_user.user_id)

    leads = db.query(Lead).filter(*filters).order_by(Lead.created_at.desc()).all()

    headers = [
        "Nome", "Tipo", "Estágio", "Contato", "Email", "Telefone",
        "Receita Esperada", "Probabilidade", "Responsável", "Origem",
        "Cargo", "Data Criação",
    ]
    rows = []
    for lead in leads:
        rows.append([
            lead.name,
            "Oportunidade" if lead.type == "opportunity" else "Lead",
            lead.stage.name if lead.stage else "",
            lead.contact_name or (lead.contact.name if lead.contact else ""),
            lead.email_from or "",
            lead.phone or "",
            lead.expected_revenue or 0,
            lead.probability or 0,
            lead.user.name if lead.user else "",
            lead.source.name if lead.source else "",
            lead.function or "",
            lead.created_at.strftime("%d/%m/%Y") if lead.created_at else "",
        ])

    return _export_response(headers, rows, format, "leads_amplex")


@router.get("/contacts")
def export_contacts(
    format: str = Query("csv"),
    type: str = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    filters = [Contact.active.is_(True)]
    if type == "company":
        filters.append(Contact.is_company.is_(True))
    elif type == "person":
        filters.append(Contact.is_company.is_(False))

    contacts = db.query(Contact).filter(*filters).order_by(Contact.name).all()

    headers = ["Nome", "Email", "Telefone", "Celular", "Empresa", "Cidade", "Estado", "CNPJ"]
    rows = []
    for c in contacts:
        rows.append([
            c.name,
            c.email or "",
            c.phone or "",
            c.mobile or "",
            "Sim" if c.is_company else "Não",
            c.city or "",
            c.state_name or "",
            c.vat or "",
        ])

    return _export_response(headers, rows, format, "contatos_amplex")
