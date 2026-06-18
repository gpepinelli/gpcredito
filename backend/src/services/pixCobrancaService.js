const prisma = require('../lib/prisma');
const mercadopago = require('../integrations/mercadopago');
const whatsapp = require('../integrations/whatsapp');
const logger = require('../utils/logger');

function proximaParcela(emprestimo) {
  return (emprestimo.parcelas || [])
    .slice()
    .sort((a, b) => a.numero - b.numero)
    .find(parcela => parcela.status === 'pendente' || parcela.status === 'atrasado') || null;
}

class PixCobrancaService {
  async gerarParaEmprestimo(emprestimo) {
    const parcela = proximaParcela(emprestimo);
    const valor = Number(parcela?.valor || emprestimo.valorTotal || 0);
    if (valor <= 0) throw new Error('Valor invalido para gerar Pix');

    const existente = await prisma.pixCobranca.findFirst({
      where: {
        emprestimoId: emprestimo.id,
        parcelaId: parcela?.id || null,
        status: 'PENDENTE',
      },
      orderBy: { criadoEm: 'desc' },
    });
    if (existente) return existente;

    const idempotencyKey = `pix-${emprestimo.id}-${parcela?.id || 'total'}-${new Date().toISOString().slice(0, 10)}`;
    const pix = await mercadopago.gerarPix(emprestimo, emprestimo.cliente, {
      valor,
      idempotencyKey,
      externalReference: emprestimo.id,
      descricao: parcela
        ? `Parcela ${parcela.numero} - ${emprestimo.numeroOperacao}`
        : `Pagamento - ${emprestimo.numeroOperacao}`,
    });

    const cobranca = await prisma.pixCobranca.create({
      data: {
        emprestimoId: emprestimo.id,
        parcelaId: parcela?.id || null,
        paymentId: pix.paymentId,
        valor,
        copiaCola: pix.copiaCola,
        qrCode: pix.qrCode,
      },
    });

    await prisma.emprestimo.update({
      where: { id: emprestimo.id },
      data: { pixQrCode: pix.qrCode, pixCopiaCola: pix.copiaCola, pixPaymentId: pix.paymentId },
    });

    logger.info('Cobranca Pix registrada', { emprestimoId: emprestimo.id, parcelaId: parcela?.id, valor, paymentId: pix.paymentId });
    return cobranca;
  }

  async gerarEEnviar(emprestimo) {
    const cobranca = await this.gerarParaEmprestimo(emprestimo);
    const enviado = await whatsapp.enviarPixMercadoPago(emprestimo.cliente, emprestimo, cobranca);
    return { cobranca, enviado };
  }

  async marcarPago(paymentId, dataPagamento = new Date()) {
    return prisma.pixCobranca.updateMany({
      where: { paymentId: String(paymentId), status: 'PENDENTE' },
      data: { status: 'PAGO', pagoEm: new Date(dataPagamento || Date.now()) },
    });
  }
}

module.exports = new PixCobrancaService();
