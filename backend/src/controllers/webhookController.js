// src/controllers/webhookController.js
// Recebe notificacoes automaticas do Mercado Pago.

const prisma = require('../lib/prisma');
const mercadopago = require('../integrations/mercadopago');
const emprestimoService = require('../services/emprestimoService');
const logger = require('../utils/logger');

class WebhookController {
  async mercadoPago(req, res) {
    res.status(200).json({ recebido: true });

    try {
      const { type, data } = req.body;
      logger.info('Webhook recebido do Mercado Pago', { type, data });

      if (type !== 'payment') return;

      const paymentId = data?.id;
      if (!paymentId) return;

      const dadosPagamento = await mercadopago.verificarPagamento(paymentId);

      if (dadosPagamento.status !== 'approved') {
        logger.info('Pagamento nao aprovado, ignorando', { paymentId, status: dadosPagamento.status });
        return;
      }

      const cobrancaPix = await prisma.pixCobranca.findUnique({
        where: { paymentId: String(paymentId) },
      });

      if (cobrancaPix && cobrancaPix.status === 'PAGO') {
        logger.warn('Webhook Pix duplicado ignorado', { paymentId, cobrancaId: cobrancaPix.id });
        return;
      }

      if (cobrancaPix) {
        if (cobrancaPix.parcelaId) {
          await emprestimoService.confirmarPagamentoParcela(cobrancaPix.emprestimoId, cobrancaPix.parcelaId, dadosPagamento.dataPagamento);
        } else {
          await emprestimoService.confirmarPagamento(
            cobrancaPix.emprestimoId,
            dadosPagamento.valorPago || cobrancaPix.valor,
            dadosPagamento.dataPagamento
          );
        }
        await prisma.pixCobranca.update({
          where: { id: cobrancaPix.id },
          data: { status: 'PAGO', pagoEm: new Date(dadosPagamento.dataPagamento || Date.now()) },
        });
        logger.info('Pagamento Pix processado via cobranca registrada', { paymentId, cobrancaId: cobrancaPix.id, emprestimoId: cobrancaPix.emprestimoId });
        return;
      }

      const emprestimo = await prisma.emprestimo.findFirst({
        where: {
          OR: [
            { pixPaymentId: String(paymentId) },
            { id: dadosPagamento.emprestimoId },
          ],
        },
      });

      if (!emprestimo) {
        logger.warn('Emprestimo nao encontrado para o pagamento', { paymentId });
        return;
      }

      if (emprestimo.status === 'pago') {
        logger.warn('Pagamento duplicado ignorado', { emprestimoId: emprestimo.id });
        return;
      }

      await emprestimoService.confirmarPagamento(
        emprestimo.id,
        dadosPagamento.valorPago || emprestimo.valorTotal,
        dadosPagamento.dataPagamento
      );

      logger.info('Pagamento processado via webhook', { emprestimoId: emprestimo.id });
    } catch (error) {
      logger.error('Erro ao processar webhook', { error: error.message, body: req.body });
    }
  }
}

module.exports = new WebhookController();
