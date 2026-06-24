const path = require('path');
const prisma = require('../lib/prisma');
const config = require('./configuracaoService');
const storageService = require('./storageService');
const logger = require('../utils/logger');
const { executarPythonJson } = require('../utils/pythonRunner');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');

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

    await executarPythonJson(path.join(ROOT_DIR, 'backend', 'scripts', 'gerar_recibo.py'), dadosPdf);

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
