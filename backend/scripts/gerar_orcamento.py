#!/usr/bin/env python3
import datetime
import json
import os
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
    return dt.strftime("%d/%m/%Y")


def carregar_dados(argumento):
    if os.path.exists(argumento):
        with open(argumento, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo)
    return json.loads(argumento)


def main():
    dados = carregar_dados(sys.argv[1])
    caminho = dados["caminhoSaida"]
    styles = getSampleStyleSheet()
    titulo = ParagraphStyle("Titulo", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=17, textColor=colors.HexColor("#0f172a"))
    secao = ParagraphStyle("Secao", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11, textColor=colors.HexColor("#0d9488"))
    corpo = ParagraphStyle("Corpo", parent=styles["BodyText"], fontSize=9.5, leading=14)
    hint = ParagraphStyle("Hint", parent=styles["BodyText"], fontSize=8.5, textColor=colors.HexColor("#64748b"))

    doc = SimpleDocTemplate(caminho, pagesize=A4, rightMargin=1.8 * cm, leftMargin=1.8 * cm, topMargin=1.6 * cm, bottomMargin=1.5 * cm)
    story = []
    story.append(Paragraph(str(dados.get("empresa") or "GPCredito"), titulo))
    story.append(Paragraph("Orcamento de credito", secao))
    story.append(Paragraph(f"Emissao: {data_br(dados['emitidoEm'])} | Validade: {data_br(dados['validoAte'])}", hint))
    story.append(Spacer(1, 0.25 * cm))

    cliente = dados.get("cliente") or {}
    if cliente.get("nome"):
        story.append(Paragraph("Cliente", secao))
        story.append(Paragraph(f"Nome: {cliente.get('nome', '-')}", corpo))
        story.append(Paragraph(f"Telefone: {cliente.get('telefone', '-')}", corpo))
        if cliente.get("cpf"):
            story.append(Paragraph(f"CPF: {cliente.get('cpf')}", corpo))
    else:
        story.append(Paragraph("Simulacao sem cliente vinculado", corpo))

    story.append(Paragraph("Resumo", secao))
    resumo = [
        ["Valor emprestado", moeda(dados["valor"])],
        ["Total de juros", moeda(dados["totalJuros"])],
        ["Total a pagar", moeda(dados["valorTotal"])],
        ["Parcelas", str(dados["parcelas"])],
    ]
    tabela_resumo = Table(resumo, colWidths=[7 * cm, 7 * cm])
    tabela_resumo.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(tabela_resumo)

    story.append(Paragraph("Parcelas simuladas", secao))
    linhas = [["#", "Vencimento", "Valor", "Juros", "Amortizacao", "Saldo"]]
    for p in dados["parcelasDetalhadas"]:
        linhas.append([
            str(p["numero"]),
            data_br(p["dataVencimento"]),
            moeda(p["valor"]),
            moeda(p["valorJuros"]),
            moeda(p["amortizacao"]),
            moeda(p["saldoDepois"]),
        ])
    tabela = Table(linhas, repeatRows=1, colWidths=[1.1 * cm, 2.8 * cm, 2.6 * cm, 2.5 * cm, 2.8 * cm, 2.8 * cm])
    tabela.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(tabela)
    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Este documento e apenas uma simulacao de credito. Nao substitui contrato, nao representa aceite e nao obriga liberacao de valor.", hint))
    story.append(Paragraph("GPCredito V2", hint))
    doc.build(story)


if __name__ == "__main__":
    main()
