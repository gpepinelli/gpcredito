import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader


NAVY = colors.HexColor("#071A2B")
GOLD = colors.HexColor("#C9A24A")
SLATE = colors.HexColor("#64748B")
LIGHT_BORDER = colors.HexColor("#E2E8F0")
PAGE_W, PAGE_H = A4

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BRAND_DIR = os.path.join(ROOT_DIR, "frontend", "public", "brand")
LOGO_PATH = os.path.join(BRAND_DIR, "logo-horizontal.png")
WATERMARK_PATH = os.path.join(BRAND_DIR, "watermark.png")


def _image(path):
    if not os.path.exists(path):
        return None
    try:
        return ImageReader(path)
    except Exception:
        return None


def draw_branding(canvas, doc, document_label="Documento"):
    """Draws the GPCredito letterhead, watermark and footer on every PDF page."""
    canvas.saveState()

    logo = _image(LOGO_PATH)
    watermark = _image(WATERMARK_PATH)

    if watermark:
        try:
            canvas.setFillAlpha(0.045)
            canvas.drawImage(
                watermark,
                (PAGE_W - 8.8 * cm) / 2,
                (PAGE_H - 8.8 * cm) / 2,
                width=8.8 * cm,
                height=8.8 * cm,
                preserveAspectRatio=True,
                mask="auto",
            )
            canvas.setFillAlpha(1)
        except Exception:
            canvas.setFillAlpha(1)

    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 2.05 * cm, PAGE_W, 2.05 * cm, stroke=0, fill=1)
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(1.2)
    canvas.line(0, PAGE_H - 2.05 * cm, PAGE_W, PAGE_H - 2.05 * cm)

    if logo:
        canvas.drawImage(
            logo,
            doc.leftMargin,
            PAGE_H - 1.68 * cm,
            width=4.9 * cm,
            height=1.18 * cm,
            preserveAspectRatio=True,
            mask="auto",
        )
    else:
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 13)
        canvas.drawString(doc.leftMargin, PAGE_H - 1.22 * cm, "GPCredito")

    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawRightString(PAGE_W - doc.rightMargin, PAGE_H - 0.98 * cm, document_label.upper())
    canvas.setFillColor(colors.Color(1, 1, 1, alpha=0.72))
    canvas.setFont("Helvetica", 7.5)
    canvas.drawRightString(PAGE_W - doc.rightMargin, PAGE_H - 1.32 * cm, "Gestao privada de credito")

    canvas.setStrokeColor(LIGHT_BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, 1.22 * cm, PAGE_W - doc.rightMargin, 1.22 * cm)
    canvas.setFillColor(SLATE)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawCentredString(PAGE_W / 2, 0.82 * cm, f"GPCredito | {document_label} | Pagina {doc.page}")

    canvas.restoreState()
