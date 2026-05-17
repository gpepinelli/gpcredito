#!/usr/bin/env python3
# scripts/gerar_contrato.py
# Gera o PDF do contrato de empréstimo
# Uso: python3 gerar_contrato.py '<json com os dados>'

import sys
import json
import datetime
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table,
    TableStyle, HRFlowable, KeepTogether
)

# ─── Helpers ────────────────────────────────────────────────────────────────

def fmt_moeda(valor):
    return f"R$ {float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def fmt_data(iso_str):
    dt = datetime.datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    return dt.strftime("%d/%m/%Y")

def fmt_numero(numero):
    n = "".join(c for c in str(numero) if c.isdigit())
    if len(n) == 11:
        return f"({n[:2]}) {n[2:7]}-{n[7:]}"
    return numero

# ─── Paleta ─────────────────────────────────────────────────────────────────

NAVY    = colors.HexColor("#0f172a")
TEAL    = colors.HexColor("#0d9488")
TEAL_LT = colors.HexColor("#ccfbf1")
GRAY    = colors.HexColor("#64748b")
GRAY_LT = colors.HexColor("#f8fafc")
WHITE   = colors.white

PAGE_W, PAGE_H = A4
MARGIN = 2.2 * cm

# ─── Estilos ────────────────────────────────────────────────────────────────

def estilos():
    base = getSampleStyleSheet()

    titulo = ParagraphStyle("Titulo",
        fontName="Helvetica-Bold", fontSize=17,
        textColor=NAVY, alignment=TA_CENTER, spaceAfter=2)

    subtitulo = ParagraphStyle("Subtitulo",
        fontName="Helvetica", fontSize=9,
        textColor=GRAY, alignment=TA_CENTER, spaceAfter=14)

    secao = ParagraphStyle("Secao",
        fontName="Helvetica-Bold", fontSize=10,
        textColor=TEAL, spaceBefore=14, spaceAfter=6)

    corpo = ParagraphStyle("Corpo",
        fontName="Helvetica", fontSize=9.5,
        textColor=NAVY, leading=15, alignment=TA_JUSTIFY, spaceAfter=6)

    rodape = ParagraphStyle("Rodape",
        fontName="Helvetica", fontSize=8,
        textColor=GRAY, alignment=TA_CENTER)

    return titulo, subtitulo, secao, corpo, rodape

# ─── Tabela de dados ─────────────────────────────────────────────────────────

def tabela_dados(linhas, col_widths):
    t = Table(linhas, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR",  (0, 0), (-1, 0), WHITE),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, 0), 8.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [GRAY_LT, WHITE]),
        ("FONTNAME",   (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",   (0, 1), (-1, -1), 9),
        ("TEXTCOLOR",  (0, 1), (-1, -1), NAVY),
        ("ALIGN",      (0, 0), (-1, -1), "LEFT"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return t

# ─── Assinatura ──────────────────────────────────────────────────────────────

def bloco_assinatura(largura, label):
    t = Table(
        [[""], [label]],
        colWidths=[largura],
        rowHeights=[28, 16],
    )
    t.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 1, NAVY),
        ("ALIGN",  (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, 1), 8),
        ("TEXTCOLOR", (0, 1), (-1, 1), GRAY),
    ]))
    return t

# ─── Geração principal ───────────────────────────────────────────────────────

def gerar(dados: dict):
    saida = dados["caminhoSaida"]
    doc = SimpleDocTemplate(
        saida, pagesize=A4,
        rightMargin=MARGIN, leftMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
    )

    titulo_s, subtitulo_s, secao_s, corpo_s, rodape_s = estilos()
    story = []
    usable_w = PAGE_W - 2 * MARGIN

    # ── Cabeçalho ──────────────────────────────────────────────────────────
    story.append(Paragraph("CONTRATO DE EMPRÉSTIMO PESSOAL", titulo_s))
    story.append(Paragraph(
        f"Nº {dados['emprestimoId'][:8].upper()} &nbsp;|&nbsp; "
        f"Emitido em {fmt_data(dados['dataEmprestimo'])}",
        subtitulo_s
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=TEAL, spaceAfter=12))

    # ── Partes ─────────────────────────────────────────────────────────────
    story.append(Paragraph("1. PARTES CONTRATANTES", secao_s))

    partes_linhas = [
        ["Campo", "Credor (Prestamista)", "Campo", "Devedor (Contratante)"],
        ["Nome",     "Minha Fintech Ltda.",     "Nome",      dados["clienteNome"]],
        ["CNPJ",     "00.000.000/0001-00",       "Telefone",  fmt_numero(dados["clienteTelefone"])],
    ]
    col = usable_w / 4
    story.append(tabela_dados(partes_linhas, [col * 0.6, col * 1.4, col * 0.6, col * 1.4]))
    story.append(Spacer(1, 4))

    # ── Condições financeiras ───────────────────────────────────────────────
    story.append(Paragraph("2. CONDIÇÕES FINANCEIRAS", secao_s))

    fin_linhas = [
        ["Descrição", "Valor"],
        ["Valor Principal Emprestado",  fmt_moeda(dados["valor"])],
        ["Taxa de Juros (simples)",     f"{float(dados['juros']):.2f}%"],
        ["Valor Total a Pagar",         fmt_moeda(dados["valorTotal"])],
        ["Data de Concessão",           fmt_data(dados["dataEmprestimo"])],
        ["Data de Vencimento",          fmt_data(dados["dataVencimento"])],
    ]
    story.append(tabela_dados(fin_linhas, [usable_w * 0.6, usable_w * 0.4]))
    story.append(Spacer(1, 4))

    # ── Pix ────────────────────────────────────────────────────────────────
    if dados.get("pixCopiaCola"):
        story.append(Paragraph("3. FORMA DE PAGAMENTO — PIX", secao_s))
        story.append(Paragraph(
            "O pagamento deverá ser realizado via <b>Pix</b>, utilizando o código "
            "abaixo (copia e cola) até a data de vencimento indicada acima:",
            corpo_s
        ))
        pix_style = ParagraphStyle("Pix",
            fontName="Courier", fontSize=7.5, textColor=NAVY,
            backColor=TEAL_LT, borderPad=8, leading=12,
            leftIndent=8, rightIndent=8, spaceAfter=8)
        story.append(Paragraph(dados["pixCopiaCola"], pix_style))
        story.append(Spacer(1, 4))

    # ── Cláusulas ──────────────────────────────────────────────────────────
    num_clausulas = 3 if dados.get("pixCopiaCola") else 3
    proximo = num_clausulas + 1

    story.append(Paragraph(f"{proximo}. OBRIGAÇÕES E PENALIDADES", secao_s))
    clausulas = [
        f"<b>{proximo}.1</b> O CONTRATANTE se obriga a efetuar o pagamento do valor total de "
        f"<b>{fmt_moeda(dados['valorTotal'])}</b> até o dia <b>{fmt_data(dados['dataVencimento'])}</b>.",
        f"<b>{proximo}.2</b> O não pagamento na data pactuada implicará em redução do score de crédito "
        "do CONTRATANTE conforme tabela de penalidades vigente.",
        f"<b>{proximo}.3</b> Pagamentos realizados com antecedência serão recompensados com bônus de "
        "score conforme política de crédito da plataforma.",
        f"<b>{proximo}.4</b> Fica eleito o foro da comarca de <b>Maringá/PR</b> para dirimir eventuais "
        "litígios oriundos deste instrumento.",
    ]
    for c in clausulas:
        story.append(Paragraph(c, corpo_s))

    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1"), spaceAfter=16))

    # ── Local e data ────────────────────────────────────────────────────────
    hoje = datetime.date.today().strftime("%d de %B de %Y")
    story.append(Paragraph(f"Maringá/PR, {hoje}.", corpo_s))
    story.append(Spacer(1, 24))

    # ── Assinaturas ─────────────────────────────────────────────────────────
    metade = (usable_w - 1.5 * cm) / 2
    assinaturas = Table(
        [[bloco_assinatura(metade, "Credor — Minha Fintech Ltda."),
          bloco_assinatura(metade, f"Devedor — {dados['clienteNome']}")]],
        colWidths=[metade + 0.75 * cm, metade + 0.75 * cm],
    )
    story.append(assinaturas)

    # ── Rodapé ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"Documento gerado automaticamente pelo Sistema de Gestão de Empréstimos &nbsp;|&nbsp; "
        f"ID: {dados['emprestimoId']}",
        rodape_s
    ))

    doc.build(story)
    print(f"PDF gerado: {saida}")


# ─── Entry point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python3 gerar_contrato.py '<json>'", file=sys.stderr)
        sys.exit(1)
    dados = json.loads(sys.argv[1])
    gerar(dados)
