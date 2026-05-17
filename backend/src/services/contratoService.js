// src/services/contratoService.js
// Gera contratos de empréstimo em PDF usando Python + ReportLab

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { promisify } = require('util');
const logger = require('../utils/logger');

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();
const ROOT_DIR = path.join(__dirname, '..', '..', '..');

// Pasta onde os PDFs serão salvos temporariamente
const PDF_DIR = path.join(ROOT_DIR, 'contratos');
const PASTA_EMPRESTIMOS = '01 - Emprestimos';

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
    if (!fs.existsSync(PDF_DIR)) {
      fs.mkdirSync(PDF_DIR, { recursive: true });
    }
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
    return path.join('contratos', this.pastaCliente(cliente), PASTA_EMPRESTIMOS, numeroOperacao, 'contrato.pdf').replace(/\\/g, '/');
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
      valor: emprestimo.valor,
      juros: emprestimo.juros,
      valorTotal: emprestimo.valorTotal,
      dataEmprestimo: emprestimo.dataEmprestimo || new Date().toISOString(),
      dataVencimento: emprestimo.dataVencimento,
      pixCopiaCola: emprestimo.pixCopiaCola || '',
      caminhoSaida,
    });

    // Caminho do script Python
    const scriptPath = path.join(ROOT_DIR, 'backend', 'scripts', 'gerar_contrato.py');

    try {
      await executarGeradorContrato(scriptPath, dados);
      const hashSha256 = crypto.createHash('sha256').update(fs.readFileSync(caminhoSaida)).digest('hex');
      const caminhoRelativo = path.relative(ROOT_DIR, caminhoSaida).replace(/\\/g, '/');
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
   * Remove o PDF após o envio (limpeza)
   */
  async removerContrato(caminhoPdf) {
    try {
      if (fs.existsSync(caminhoPdf)) {
        fs.unlinkSync(caminhoPdf);
      }
    } catch (error) {
      logger.warn('Não foi possível remover PDF temporário', { caminhoPdf });
    }
  }
}

module.exports = new ContratoService();
