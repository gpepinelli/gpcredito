const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');

function nomeSeguro(valor = 'cliente') {
  const texto = String(valor || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return texto || 'cliente';
}

function semExtensao(nomeArquivo) {
  return nomeArquivo.replace(/\.pdf$/i, '');
}

class StorageService {
  constructor() {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  pastaCliente(cliente) {
    return nomeSeguro(cliente?.nome || cliente || 'cliente');
  }

  relativo(...partes) {
    return path.join('storage', ...partes).replace(/\\/g, '/');
  }

  absoluto(caminhoRelativo) {
    return path.isAbsolute(caminhoRelativo)
      ? caminhoRelativo
      : path.join(ROOT_DIR, caminhoRelativo);
  }

  caminhoUnico(caminhoRelativo) {
    const absolutoOriginal = this.absoluto(caminhoRelativo);
    fs.mkdirSync(path.dirname(absolutoOriginal), { recursive: true });
    if (!fs.existsSync(absolutoOriginal)) return caminhoRelativo;

    const dir = path.dirname(caminhoRelativo);
    const base = semExtensao(path.basename(caminhoRelativo));
    let contador = 2;
    let candidato;
    do {
      candidato = path.join(dir, `${base}-${contador}.pdf`).replace(/\\/g, '/');
      contador += 1;
    } while (fs.existsSync(this.absoluto(candidato)));
    return candidato;
  }

  caminhoContrato(cliente, numeroOperacao) {
    return this.caminhoUnico(this.relativo('contratos', this.pastaCliente(cliente), 'emprestimos', numeroOperacao, 'contrato.pdf'));
  }

  caminhoOrcamento(cliente, id) {
    return this.caminhoUnico(this.relativo('orcamentos', this.pastaCliente(cliente), `orcamento-${id}.pdf`));
  }

  caminhoCobranca(cliente, data = new Date()) {
    const dataArquivo = new Date(data).toISOString().slice(0, 10);
    return this.caminhoUnico(this.relativo('cobranças', this.pastaCliente(cliente), `cobranca-${dataArquivo}.pdf`));
  }

  caminhoRecibo(cliente, parcelaId) {
    return this.caminhoUnico(this.relativo('recibos', this.pastaCliente(cliente), `recibo-${parcelaId}.pdf`));
  }

  async registrarPdf({ tipo, caminhoPdf, clienteId = null, origemTipo = null, origemId = null }) {
    const registro = await prisma.arquivoPdf.create({
      data: { tipo, caminhoPdf, clienteId, origemTipo, origemId },
    });
    logger.info('PDF registrado no storage', { tipo, caminhoPdf, clienteId, origemTipo, origemId });
    return registro;
  }

  async salvarBuffer({ buffer, caminhoPdf, tipo, clienteId = null, origemTipo = null, origemId = null }) {
    const relativo = this.caminhoUnico(caminhoPdf);
    const absoluto = this.absoluto(relativo);
    fs.mkdirSync(path.dirname(absoluto), { recursive: true });
    fs.writeFileSync(absoluto, buffer);
    await this.registrarPdf({ tipo, caminhoPdf: relativo, clienteId, origemTipo, origemId });
    return { caminhoPdf: relativo, caminhoAbsoluto: absoluto };
  }

  removerArquivo(caminhoPdf) {
    if (!caminhoPdf) return false;
    const destino = path.resolve(this.absoluto(caminhoPdf));
    const raiz = path.resolve(STORAGE_DIR);
    if (!destino.startsWith(raiz + path.sep)) {
      logger.warn('Remocao ignorada fora do storage', { caminhoPdf });
      return false;
    }
    if (!fs.existsSync(destino)) return false;
    fs.unlinkSync(destino);

    let dir = path.dirname(destino);
    while (dir.startsWith(raiz + path.sep) && dir !== raiz) {
      if (!fs.existsSync(dir) || fs.readdirSync(dir).length > 0) break;
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    }
    return true;
  }
}

module.exports = new StorageService();
