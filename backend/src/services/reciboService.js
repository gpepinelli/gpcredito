const { execFile } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const prisma = require('../lib/prisma');
const config = require('./configuracaoService');
const storageService = require('./storageService');
const logger = require('../utils/logger');

const execFileAsync = promisify(execFile);
const ROOT_DIR = path.join(__dirname, '..', '..', '..');

async function executarPython(scriptPath, dados) {
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

class ReciboService {
  async gerar({ emprestimo, pagamento, parcela = null }) {
    if (!emprestimo?.cliente) throw new Error('Cliente nao carregado para gerar recibo');
    if (!pagamento?.id) throw new Error('Pagamento invalido para gerar recibo');

    const caminhoPdf = storageService.caminhoRecibo(
      emprestimo.cliente,
      pagamento.parcelaId || pagamento.id
    );
    const caminhoSaida = storageService.absoluto(caminhoPdf);
    const empresa = await config.getConfig('NOME_EMPRESA');
    const dadosPdf = JSON.stringify({
      empresa,
      cliente: {
        nome: emprestimo.cliente.nome,
        telefone: emprestimo.cliente.telefone,
        cpf: emprestimo.cliente.cpf,
      },
      numeroOperacao: emprestimo.numeroOperacao,
      numeroParcela: parcela?.numero || null,
      valorPago: Number(pagamento.valorPago || 0),
      dataPagamento: new Date(pagamento.dataPagamento || Date.now()).toISOString(),
      formaPagamento: 'Pix/Manual',
      pagamentoId: pagamento.id,
      caminhoSaida,
    });

    await executarPython(path.join(ROOT_DIR, 'backend', 'scripts', 'gerar_recibo.py'), dadosPdf);

    await prisma.$transaction([
      prisma.arquivoPdf.create({
        data: {
          tipo: 'RECIBO',
          caminhoPdf,
          clienteId: emprestimo.clienteId,
          origemTipo: 'Pagamento',
          origemId: pagamento.id,
        },
      }),
      prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { caminhoPdf },
      }),
    ]);

    logger.info('Recibo de pagamento gerado', { pagamentoId: pagamento.id, emprestimoId: emprestimo.id, caminhoPdf });
    return { caminhoPdf, caminhoAbsoluto: caminhoSaida };
  }
}

module.exports = new ReciboService();
