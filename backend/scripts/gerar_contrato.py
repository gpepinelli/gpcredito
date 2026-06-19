#!/usr/bin/env python3
# scripts/gerar_contrato.py
# Gera o PDF do contrato de empréstimo
# Uso: python3 gerar_contrato.py '<json com os dados>'

import sys
import json
import datetime
import os
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
from pdf_branding import draw_branding

# ─── Helpers ────────────────────────────────────────────────────────────────

def fmt_moeda(valor):
    return f"R$ {float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def carregar_dados(argumento):
    if os.path.exists(argumento):
        with open(argumento, "r", encoding="utf-8-sig") as arquivo:
            return json.load(arquivo)
    return json.loads(argumento)

def fmt_data(iso_str):
    dt = datetime.datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    return dt.strftime("%d/%m/%Y")

def fmt_numero(numero):
    n = "".join(c for c in str(numero) if c.isdigit())
    if len(n) == 11:
        return f"({n[:2]}) {n[2:7]}-{n[7:]}"
    return numero

def valor_ou_traco(valor):
    return valor if valor else "-"

def status_parcela(status):
    mapa = {
        "pendente": "Em aberto",
        "atrasado": "Em atraso",
        "pago": "Pago",
    }
    return mapa.get(str(status), str(status))

# ─── Paleta ─────────────────────────────────────────────────────────────────

NAVY    = colors.HexColor("#071A2B")
TEAL    = colors.HexColor("#C9A24A")
TEAL_LT = colors.HexColor("#F6ECD1")
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
        topMargin=2.7 * cm, bottomMargin=MARGIN,
    )

    titulo_s, subtitulo_s, secao_s, corpo_s, rodape_s = estilos()
    story = []
    usable_w = PAGE_W - 2 * MARGIN

    # ── Cabeçalho ──────────────────────────────────────────────────────────
    story.append(Paragraph("CONTRATO DE EMPRÉSTIMO PESSOAL", titulo_s))
    story.append(Paragraph(
        f"Operação: {dados.get('numeroOperacao', dados['emprestimoId'][:8].upper())} &nbsp;|&nbsp; "
        f"Contrato {dados.get('numeroContrato', dados['emprestimoId'][:8].upper())} &nbsp;|&nbsp; "
        f"Emitido em {fmt_data(dados['dataEmprestimo'])}",
        subtitulo_s
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=TEAL, spaceAfter=12))

    # ── Partes ─────────────────────────────────────────────────────────────
    story.append(Paragraph("1. IDENTIFICAÇÃO DAS PARTES", secao_s))

    partes_linhas = [
        ["Parte", "Dados"],
        ["CREDOR", "Guilherme dos Santos Pepinelli"],
        ["CONTRATANTE", dados["clienteNome"]],
        ["Telefone", fmt_numero(dados["clienteTelefone"])],
        ["CPF", valor_ou_traco(dados.get("clienteCpf"))],
        ["Endereço", valor_ou_traco(dados.get("clienteEndereco"))],
    ]
    story.append(tabela_dados(partes_linhas, [usable_w * 0.3, usable_w * 0.7]))
    story.append(Spacer(1, 4))

    # ── Condições financeiras ───────────────────────────────────────────────
    story.append(Paragraph("2. CONDIÇÕES FINANCEIRAS", secao_s))

    parcelas = dados.get("parcelas") or []
    if len(parcelas) == 1:
        valor_parcelas = fmt_moeda(parcelas[0]["valor"])
    else:
        valor_parcelas = "Conforme tabela de parcelamento"
    fin_linhas = [
        ["Descrição", "Valor"],
        ["Valor Principal Emprestado",  fmt_moeda(dados["valor"])],
        ["Taxa de Juros",               f"{float(dados['juros']):.2f}% ao mês"],
        ["Quantidade de Parcelas",      str(dados.get("totalParcelas", len(parcelas) or 1))],
        ["Valor Total do Contrato",     fmt_moeda(dados["valorTotal"])],
        ["Valor das Parcelas",          valor_parcelas],
        ["Data da Concessão",           fmt_data(dados["dataEmprestimo"])],
        ["Forma de Pagamento",          dados.get("formaPagamento", "Pix")],
    ]
    story.append(tabela_dados(fin_linhas, [usable_w * 0.6, usable_w * 0.4]))
    story.append(Spacer(1, 4))

    story.append(Paragraph("3. PARCELAMENTO", secao_s))
    parcelas_linhas = [["Parcela", "Vencimento", "Valor", "Status"]]
    for parcela in parcelas:
        parcelas_linhas.append([
            str(parcela.get("numero", "")),
            fmt_data(parcela["dataVencimento"]),
            fmt_moeda(parcela["valor"]),
            status_parcela(parcela.get("status", "pendente")),
        ])
    story.append(tabela_dados(parcelas_linhas, [usable_w * 0.18, usable_w * 0.28, usable_w * 0.27, usable_w * 0.27]))
    story.append(Spacer(1, 4))

    # ── Pix ────────────────────────────────────────────────────────────────
    if dados.get("pixCopiaCola"):
        story.append(Paragraph("4. FORMA DE PAGAMENTO — PIX", secao_s))
        story.append(Paragraph(
            "O pagamento deverá ser realizado via <b>Pix</b>, utilizando o código "
            "abaixo (copia e cola) até a data de vencimento da parcela correspondente:",
            corpo_s
        ))
        pix_style = ParagraphStyle("Pix",
            fontName="Courier", fontSize=7.5, textColor=NAVY,
            backColor=TEAL_LT, borderPad=8, leading=12,
            leftIndent=8, rightIndent=8, spaceAfter=8)
        story.append(Paragraph(dados["pixCopiaCola"], pix_style))
        story.append(Spacer(1, 4))

    # ── Cláusulas ──────────────────────────────────────────────────────────
    proximo = 5 if dados.get("pixCopiaCola") else 4

    story.append(Paragraph(f"{proximo}. CLÁUSULAS CONTRATUAIS", secao_s))
    clausulas = [
        f"<b>{proximo}.1 Ciência.</b> O CONTRATANTE declara ter lido, compreendido e aceitado integralmente as condições deste contrato, incluindo valores, juros, vencimentos, quantidade de parcelas e penalidades aplicáveis.",
        f"<b>{proximo}.2 Pagamento.</b> O CONTRATANTE reconhece a dívida descrita neste instrumento e compromete-se a efetuar os pagamentos nas datas acordadas.",
        f"<b>{proximo}.3 Atraso.</b> O atraso no pagamento poderá implicar aplicação de multa, juros de mora, atualização do débito, bloqueio de novas operações e registro interno de inadimplência.",
        f"<b>{proximo}.4 Confirmação.</b> O pagamento somente será considerado válido após confirmação pelo credor.",
        f"<b>{proximo}.5 Aceite digital.</b> O presente contrato poderá ser aceito digitalmente mediante confirmação enviada pelo CONTRATANTE através do WhatsApp cadastrado, utilizando a expressão 'DE ACORDO', produzindo os mesmos efeitos de aceite formal.",
        f"<b>{proximo}.6 Veracidade.</b> O CONTRATANTE declara que todas as informações e documentos fornecidos são verdadeiros, responsabilizando-se civil e criminalmente por informações falsas.",
        f"<b>{proximo}.7 Operacional.</b> O CREDOR poderá cancelar ou suspender a operação antes da liberação financeira caso sejam identificadas inconsistências cadastrais, documentais ou operacionais.",
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
        [[bloco_assinatura(metade, "Credor — Guilherme dos Santos Pepinelli"),
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
        f"Operação: {dados.get('numeroOperacao', dados['emprestimoId'])} &nbsp;|&nbsp; Contrato: {dados.get('numeroContrato', '')}",
        rodape_s
    ))

    doc.build(
        story,
        onFirstPage=lambda canvas, doc_obj: draw_branding(canvas, doc_obj, "Contrato"),
        onLaterPages=lambda canvas, doc_obj: draw_branding(canvas, doc_obj, "Contrato"),
    )
    print(f"PDF gerado: {saida}")


# ─── Entry point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python3 gerar_contrato.py '<json>'", file=sys.stderr)
        sys.exit(1)
    dados = carregar_dados(sys.argv[1])
    gerar(dados)
