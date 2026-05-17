from pathlib import Path
from datetime import date, datetime, timedelta

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "contratos"
OUT_DIR.mkdir(exist_ok=True)
OUT_FILE = OUT_DIR / "contrato_exemplo_gpcredito.pdf"


def moeda(valor):
    return f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def data_br(valor):
    return valor.strftime("%d/%m/%Y")


def paragraph(text, style):
    return Paragraph(text.replace("\n", "<br/>"), style)


def tabela(rows, widths):
    table = Table(rows, colWidths=widths, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#155E75")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#0F172A")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#F5F7F8"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#DDE5E7")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def gerar():
    principal = 1000.00
    juros_mes = 20.0
    parcelas = 3
    total = round(principal * ((1 + juros_mes / 100) ** parcelas), 2)
    valor_parcela = round(total / parcelas, 2)
    ultima_parcela = round(total - valor_parcela * (parcelas - 1), 2)
    hoje = date(2026, 5, 17)
    vencimento_final = hoje + timedelta(days=30 * parcelas)

    doc = SimpleDocTemplate(
        str(OUT_FILE),
        pagesize=A4,
        rightMargin=2.0 * cm,
        leftMargin=2.0 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        title="Contrato de Exemplo - GPCredito",
    )

    title = ParagraphStyle(
        "Title",
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#0F172A"),
    )
    subtitle = ParagraphStyle(
        "Subtitle",
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#64748B"),
    )
    section = ParagraphStyle(
        "Section",
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#155E75"),
        spaceBefore=12,
        spaceAfter=6,
    )
    body = ParagraphStyle(
        "Body",
        fontName="Helvetica",
        fontSize=9.5,
        leading=15,
        alignment=TA_JUSTIFY,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=7,
    )
    small = ParagraphStyle(
        "Small",
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#64748B"),
    )

    usable = A4[0] - 4.0 * cm
    story = [
        Paragraph("CONTRATO DE EMPRÉSTIMO PESSOAL", title),
        Paragraph("GPCrédito | Contrato de exemplo | Nº GP-EXEMPLO-001", subtitle),
        Spacer(1, 8),
        HRFlowable(width="100%", thickness=2, color=colors.HexColor("#155E75")),
        Spacer(1, 8),
        Paragraph("1. PARTES CONTRATANTES", section),
        tabela([
            ["Campo", "Credor", "Campo", "Devedor"],
            ["Nome", "GPCrédito", "Nome", "João da Silva"],
            ["Documento", "00.000.000/0001-00", "Telefone", "(44) 99999-0000"],
        ], [usable * .15, usable * .35, usable * .15, usable * .35]),
        Paragraph("2. CONDIÇÕES FINANCEIRAS", section),
        tabela([
            ["Descrição", "Condição"],
            ["Valor principal liberado", moeda(principal)],
            ["Juros", f"{juros_mes:.2f}% ao mês, capitalizados mensalmente"],
            ["Quantidade de parcelas", f"{parcelas} parcelas mensais"],
            ["Valor total a pagar", moeda(total)],
            ["Data de contratação", data_br(hoje)],
            ["Vencimento final", data_br(vencimento_final)],
        ], [usable * .45, usable * .55]),
        Paragraph("3. CRONOGRAMA DE PARCELAS", section),
        tabela([
            ["Parcela", "Valor", "Vencimento"],
            ["1", moeda(valor_parcela), data_br(hoje + timedelta(days=30))],
            ["2", moeda(valor_parcela), data_br(hoje + timedelta(days=60))],
            ["3", moeda(ultima_parcela), data_br(vencimento_final)],
        ], [usable * .2, usable * .4, usable * .4]),
        Paragraph("4. CLÁUSULAS GERAIS", section),
        paragraph(
            f"O DEVEDOR declara ter recebido do CREDOR o valor principal de <b>{moeda(principal)}</b>, "
            f"comprometendo-se a pagar o valor total de <b>{moeda(total)}</b>, calculado com juros compostos "
            f"de <b>{juros_mes:.2f}% ao mês</b> pelo período de <b>{parcelas} meses</b>.",
            body,
        ),
        paragraph(
            "O atraso no pagamento poderá gerar registro de inadimplência no sistema interno, atualização de status "
            "do empréstimo e redução do score do cliente conforme as regras vigentes da plataforma.",
            body,
        ),
        paragraph(
            "Este documento é um modelo de visualização gerado para validação do layout e das informações exibidas. "
            "Os dados acima são fictícios e devem ser substituídos pelos dados reais do cliente e da operação.",
            body,
        ),
        Spacer(1, 18),
        Paragraph("Maringá/PR, 17 de maio de 2026.", body),
        Spacer(1, 26),
    ]

    sig = Table([
        ["", ""],
        ["GPCrédito", "João da Silva"],
    ], colWidths=[usable * .46, usable * .46])
    sig.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 1, colors.HexColor("#0F172A")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, 1), 8.5),
        ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#64748B")),
        ("TOPPADDING", (0, 0), (-1, 0), 22),
    ]))
    story.extend([
        sig,
        Spacer(1, 18),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#DDE5E7")),
        Spacer(1, 4),
        Paragraph("Documento gerado automaticamente pelo GPCrédito.", small),
    ])

    doc.build(story)
    print(OUT_FILE)


if __name__ == "__main__":
    gerar()
