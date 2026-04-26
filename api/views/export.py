"""Export views — leads/contacts as CSV, XLSX, or PDF."""

import csv
import io

from django.http import HttpResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import Contact, Lead


def _sanitize_csv_cell(value):
    """Prevent CSV injection by escaping leading formula characters."""
    if (
        isinstance(value, str)
        and value
        and value[0] in ("=", "+", "-", "@", "\t", "\r")
    ):
        return "'" + value
    return value


def _export_response(content, filename, content_type):
    resp = HttpResponse(content, content_type=content_type)
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


@require_http_methods(["GET"])
@org_required
def export_leads(request, slug):
    org = request.amplex_org
    fmt = request.GET.get("format", "csv").lower()
    limit = min(int(request.GET.get("limit", 10000)), 50000)

    leads = (
        Lead.objects.filter(org=org, active=True)
        .select_related("contact", "stage", "user", "source")
        .order_by("-created_at")[:limit]
    )

    headers = [
        "ID",
        "Name",
        "Type",
        "Value",
        "Stage",
        "Contact",
        "Responsible",
        "Source",
        "Status",
        "Created",
    ]

    rows = []
    for lead in leads:
        rows.append(
            [
                lead.id,
                lead.name,
                lead.type,
                float(lead.expected_revenue) if lead.expected_revenue else 0,
                lead.stage.name if lead.stage else "",
                lead.contact.name if lead.contact else "",
                lead.user.name if lead.user else "",
                lead.source.name if lead.source else "",
                "won" if (lead.stage and lead.stage.is_won) else "open",
                lead.created_at.strftime("%Y-%m-%d %H:%M") if lead.created_at else "",
            ]
        )

    if fmt == "xlsx":
        return _export_xlsx(headers, rows, f"leads_{org.id}.xlsx")
    if fmt == "pdf":
        return _export_pdf(headers, rows, f"leads_{org.id}.pdf", "Leads Export")
    return _export_csv(headers, rows, f"leads_{org.id}.csv")


@require_http_methods(["GET"])
@org_required
def export_contacts(request, slug):
    org = request.amplex_org
    fmt = request.GET.get("format", "csv").lower()
    limit = min(int(request.GET.get("limit", 10000)), 50000)

    contacts = Contact.objects.filter(org=org).order_by("-created_at")[:limit]

    headers = [
        "ID",
        "Name",
        "Email",
        "Phone",
        "VAT",
        "City",
        "State",
        "Created",
    ]
    rows = []
    for c in contacts:
        rows.append(
            [
                c.id,
                c.name,
                c.email or "",
                c.phone or "",
                c.vat or "",
                c.city or "",
                c.state_name or "",
                c.created_at.strftime("%Y-%m-%d %H:%M") if c.created_at else "",
            ]
        )

    if fmt == "xlsx":
        return _export_xlsx(headers, rows, f"contacts_{org.id}.xlsx")
    if fmt == "pdf":
        return _export_pdf(headers, rows, f"contacts_{org.id}.pdf", "Contacts Export")
    return _export_csv(headers, rows, f"contacts_{org.id}.csv")


def _export_csv(headers, rows, filename):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for row in rows:
        writer.writerow([_sanitize_csv_cell(str(v)) for v in row])
    return _export_response(buf.getvalue(), filename, "text/csv; charset=utf-8")


def _export_xlsx(headers, rows, filename):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return _export_response(
        buf.getvalue(),
        filename,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _export_pdf(headers, rows, filename, title):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4))
    data = [headers] + [[str(v) for v in row] for row in rows]

    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0070FF")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [colors.white, colors.HexColor("#f6f6f6")],
                ),
            ]
        )
    )

    doc.build([table])
    buf.seek(0)
    return _export_response(buf.getvalue(), filename, "application/pdf")
