#!/usr/bin/env python3
import datetime
import json
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def moeda(valor):
    return f"R$ {float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def data_br(valor):
    dt = datetime.datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    return dt.strftime("%d/%m/%Y %H:%M")


def main():
    dados = json.loads(sys.argv[1])
    caminho = dados["caminhoSaida"]
    styles = getSampleStyleSheet()
    titulo = ParagraphStyle("Titulo", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, textColor=colors.HexColor("#0f172a"))
    secao = ParagraphStyle("Secao", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11, textColor=colors.HexColor("#0f766e"))
    corpo = ParagraphStyle("Corpo", parent=styles["BodyText"], fontSize=10, leading=15)
    destaque = ParagraphStyle("Destaque", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=22, textColor=colors.HexColor("#047857"))
    hint = ParagraphStyle("Hint", parent=styles["BodyText"], fontSize=8.5, textColor=colors.HexColor("#64748b"))

    doc = SimpleDocTemplate(caminho, pagesize=A4, rightMargin=1.8 * cm, leftMargin=1.8 * cm, topMargin=1.8 * cm, bottomMargin=1.5 * cm)
    story = []
    story.append(Paragraph(str(dados.get("empresa") or "GPCredito"), titulo))
    story.append(Paragraph("Recibo de pagamento", secao))
    story.append(Paragraph(f"Emitido em: {data_br(dados['dataPagamento'])}", hint))
    story.append(Spacer(1, 0.45 * cm))

    story.append(Paragraph(moeda(dados["valorPago"]), destaque))
    story.append(Paragraph(f"Recebemos de {dados['cliente']['nome']} o valor acima referente a operacao {dados.get('numeroOperacao') or '-'}." , corpo))
    story.append(Spacer(1, 0.35 * cm))

    linhas = [
        ["Cliente", dados["cliente"]["nome"]],
        ["Telefone", dados["cliente"].get("telefone") or "-"],
        ["CPF", dados["cliente"].get("cpf") or "-"],
        ["Operacao", dados.get("numeroOperacao") or "-"],
        ["Parcela", dados.get("numeroParcela") or "Pagamento manual"],
        ["Forma de pagamento", dados.get("formaPagamento") or "Pix/Manual"],
        ["ID do pagamento", dados.get("pagamentoId") or "-"],
    ]
    tabela = Table(linhas, colWidths=[5 * cm, 10 * cm])
    tabela.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(tabela)
    story.append(Spacer(1, 0.55 * cm))
    story.append(Paragraph("Este recibo confirma apenas o pagamento registrado no sistema. Em caso de divergencia, prevalecem os registros financeiros internos.", hint))
    story.append(Paragraph("GPCredito V2", hint))
    doc.build(story)


if __name__ == "__main__":
    main()
