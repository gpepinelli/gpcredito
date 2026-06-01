// src/services/contratoService.js
// Gera contratos de empréstimo em PDF usando Python + ReportLab

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { promisify } = require('util');
const logger = require('../utils/logger');
const storageService = require('./storageService');

const execFileAsync = promisify(execFile);
const ROOT_DIR = path.join(__dirname, '..', '..', '..');

const LEGACY_PDF_DIR = path.join(ROOT_DIR, 'contratos');
const STORAGE_CONTRATOS_DIR = path.join(ROOT_DIR, 'storage', 'contratos');

function montarParcelasContrato(emprestimo) {
  if (Array.isArray(emprestimo.parcelas) && emprestimo.parcelas.length > 0) {
    return emprestimo.parcelas.map(parcela => ({
      numero: parcela.numero,
      dataVencimento: parcela.dataVencimento,
      valor: parcela.valor,
      status: parcela.status,
    }));
  }

  return [{
    numero: 1,
    dataVencimento: emprestimo.dataVencimento,
    valor: emprestimo.valorTotal,
    status: 'pendente',
  }];
}

async function executarGeradorContrato(scriptPath, dados) {
  const tentativas = process.env.PYTHON_BIN
    ? [{ comando: process.env.PYTHON_BIN, args: [scriptPath, dados] }]
    : [
        { comando: 'python', args: [scriptPath, dados] },
        { comando: 'py', args: ['-3', scriptPath, dados] },
        { comando: 'python3', args: [scriptPath, dados] },
      ];

  let ultimoErro = null;
  for (const tentativa of tentativas) {
    try {
      return await execFileAsync(tentativa.comando, tentativa.args);
    } catch (error) {
      ultimoErro = error;
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw ultimoErro;
}

class ContratoService {
  constructor() {
    fs.mkdirSync(STORAGE_CONTRATOS_DIR, { recursive: true });
  }

  pastaCliente(cliente) {
    const nome = String(cliente?.nome || 'cliente')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');

    return nome || 'cliente';
  }

  caminhoRelativoContrato(cliente, numeroOperacao) {
    return storageService.caminhoContrato(cliente, numeroOperacao);
  }

  /**
   * Gera o PDF do contrato de empréstimo
   * @param {Object} emprestimo - Dados do empréstimo
   * @param {Object} cliente    - Dados do cliente
   * @returns {string} Caminho do arquivo PDF gerado
   */
  async gerarContrato(emprestimo, cliente) {
    const numeroOperacao = emprestimo.numeroOperacao || `OP-${new Date().getFullYear()}-${emprestimo.id.slice(0, 6)}`;
    const numeroContrato = emprestimo.numeroContrato || `CT-${new Date().getFullYear()}-${emprestimo.id.slice(0, 6)}`;
    const caminhoRelativoContrato = this.caminhoRelativoContrato(cliente, numeroOperacao);
    const caminhoSaida = path.join(ROOT_DIR, caminhoRelativoContrato);
    fs.mkdirSync(path.dirname(caminhoSaida), { recursive: true });

    // Monta os dados como JSON para passar ao script Python
    const dados = JSON.stringify({
      emprestimoId: emprestimo.id,
      numeroOperacao,
      numeroContrato,
      clienteNome: cliente.nome,
      clienteTelefone: cliente.telefone,
      clienteCpf: cliente.cpf || '',
      clienteEndereco: cliente.endereco || '',
      valor: emprestimo.valor,
      juros: emprestimo.juros,
      valorTotal: emprestimo.valorTotal,
      totalParcelas: emprestimo.totalParcelas || 1,
      formaPagamento: emprestimo.formaPagamento || 'Pix ou outra forma confirmada pelo credor',
      dataEmprestimo: emprestimo.dataEmprestimo || new Date().toISOString(),
      dataVencimento: emprestimo.dataVencimento,
      parcelas: montarParcelasContrato(emprestimo),
      pixCopiaCola: emprestimo.pixCopiaCola || '',
      caminhoSaida,
    });

    // Caminho do script Python
    const scriptPath = path.join(ROOT_DIR, 'backend', 'scripts', 'gerar_contrato.py');

    try {
      await executarGeradorContrato(scriptPath, dados);
      const hashSha256 = crypto.createHash('sha256').update(fs.readFileSync(caminhoSaida)).digest('hex');
      const caminhoRelativo = path.relative(ROOT_DIR, caminhoSaida).replace(/\\/g, '/');
      await storageService.registrarPdf({
        tipo: 'CONTRATO',
        caminhoPdf: caminhoRelativo,
        clienteId: cliente.id,
        origemTipo: 'Emprestimo',
        origemId: emprestimo.id,
      });
      await prisma.contratoOperacao.upsert({
        where: { numeroContrato },
        update: {
          caminhoArquivo: caminhoRelativo,
          hashSha256,
          statusContrato: 'GERADO',
        },
        create: {
          numeroContrato,
          numeroOperacao,
          clienteId: cliente.id,
          emprestimoId: emprestimo.id,
          caminhoArquivo: caminhoRelativo,
          hashSha256,
          statusContrato: 'GERADO',
        },
      });
      logger.info('📄 Contrato PDF gerado', { emprestimoId: emprestimo.id, numeroOperacao, numeroContrato, caminhoSaida, hashSha256 });
      return caminhoSaida;
    } catch (error) {
      logger.error('Erro ao gerar contrato PDF', { error: error.message, stderr: error.stderr });
      throw new Error('Falha ao gerar contrato em PDF: ' + error.message);
    }
  }

  /**
   * Remove o PDF e pastas vazias da operacao.
   */
  async removerContrato(caminhoPdf) {
    try {
      const caminhoAbsoluto = path.isAbsolute(caminhoPdf)
        ? caminhoPdf
        : path.join(ROOT_DIR, caminhoPdf);
      const pastaContratos = path.resolve(STORAGE_CONTRATOS_DIR);
      const pastaLegada = path.resolve(LEGACY_PDF_DIR);
      const destino = path.resolve(caminhoAbsoluto);

      const dentroStorage = destino.startsWith(pastaContratos + path.sep);
      const dentroLegado = destino.startsWith(pastaLegada + path.sep);
      if (!dentroStorage && !dentroLegado) {
        logger.warn('Remocao de contrato ignorada fora da pasta contratos', { caminhoPdf });
        return;
      }

      if (fs.existsSync(destino)) {
        fs.unlinkSync(destino);
        logger.info('Contrato PDF removido', { caminhoPdf: destino });
      }

      let dir = path.dirname(destino);
      const raiz = dentroStorage ? pastaContratos : pastaLegada;
      while (dir.startsWith(raiz + path.sep) && dir !== raiz) {
        if (!fs.existsSync(dir) || fs.readdirSync(dir).length > 0) break;
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      }
    } catch (error) {
      logger.warn('Nao foi possivel remover contrato PDF', { caminhoPdf, error: error.message });
    }
  }
}

module.exports = new ContratoService();
