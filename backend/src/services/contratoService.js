// src/services/contratoService.js
// Gera contratos de empréstimo em PDF usando Python + ReportLab

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const logger = require('../utils/logger');

const execFileAsync = promisify(execFile);
const ROOT_DIR = path.join(__dirname, '..', '..', '..');

// Pasta onde os PDFs serão salvos temporariamente
const PDF_DIR = path.join(ROOT_DIR, 'contratos');

class ContratoService {
  constructor() {
    if (!fs.existsSync(PDF_DIR)) {
      fs.mkdirSync(PDF_DIR, { recursive: true });
    }
  }

  /**
   * Gera o PDF do contrato de empréstimo
   * @param {Object} emprestimo - Dados do empréstimo
   * @param {Object} cliente    - Dados do cliente
   * @returns {string} Caminho do arquivo PDF gerado
   */
  async gerarContrato(emprestimo, cliente) {
    const nomeArquivo = `contrato_${emprestimo.id}.pdf`;
    const caminhoSaida = path.join(PDF_DIR, nomeArquivo);

    // Monta os dados como JSON para passar ao script Python
    const dados = JSON.stringify({
      emprestimoId: emprestimo.id,
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
      await execFileAsync('python3', [scriptPath, dados]);
      logger.info('📄 Contrato PDF gerado', { emprestimoId: emprestimo.id, caminhoSaida });
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
