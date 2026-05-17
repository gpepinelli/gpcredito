// src/controllers/webhookController.js
// Recebe notificações automáticas do Mercado Pago quando alguém paga

const { PrismaClient } = require('@prisma/client');
const mercadopago = require('../integrations/mercadopago');
const emprestimoService = require('../services/emprestimoService');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

class WebhookController {
  async mercadoPago(req, res) {
    // Responde 200 imediatamente para o MP não reenviar
    res.status(200).json({ recebido: true });

    try {
      const { type, data } = req.body;

      logger.info('📨 Webhook recebido do Mercado Pago', { type, data });

      // Só processa notificações de pagamento
      if (type !== 'payment') return;

      const paymentId = data?.id;
      if (!paymentId) return;

      // Busca detalhes do pagamento na API do MP
      const dadosPagamento = await mercadopago.verificarPagamento(paymentId);

      if (dadosPagamento.status !== 'approved') {
        logger.info('Pagamento não aprovado, ignorando', { paymentId, status: dadosPagamento.status });
        return;
      }

      // Busca empréstimo pelo pixPaymentId ou external_reference
      let emprestimo = await prisma.emprestimo.findFirst({
        where: {
          OR: [
            { pixPaymentId: String(paymentId) },
            { id: dadosPagamento.emprestimoId },
          ],
        },
      });

      if (!emprestimo) {
        logger.warn('Empréstimo não encontrado para o pagamento', { paymentId });
        return;
      }

      if (emprestimo.status === 'pago') {
        logger.warn('Pagamento duplicado ignorado', { emprestimoId: emprestimo.id });
        return;
      }

      // Confirma pagamento
      await emprestimoService.confirmarPagamento(
        emprestimo.id,
        dadosPagamento.valorPago || emprestimo.valorTotal,
        dadosPagamento.dataPagamento
      );

      logger.info('✅ Pagamento processado via webhook', { emprestimoId: emprestimo.id });
    } catch (error) {
      logger.error('Erro ao processar webhook', { error: error.message, body: req.body });
    }
  }
}

module.exports = new WebhookController();
