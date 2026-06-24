// src/integrations/mercadopago/index.js
// Integracao com Mercado Pago para geracao e confirmacao de Pix.

const logger = require('../../utils/logger');
const config = require('../../services/configuracaoService');

function montarWebhookUrl() {
  const appUrl = String(process.env.APP_URL || '').replace(/\/+$/, '');
  if (!appUrl) return undefined;
  return `${appUrl}/api/webhook/mercadopago`;
}

class MercadoPagoService {
  constructor() {
    this.accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    this.baseUrl = 'https://api.mercadopago.com';
    this.simulado = !this.accessToken || this.accessToken.includes('seu-token');

    if (this.simulado) {
      logger.warn('Mercado Pago em modo SIMULADO. Configure MERCADOPAGO_ACCESS_TOKEN no .env');
    }
  }

  async gerarPix(emprestimo, cliente, opcoes = {}) {
    const ativo = await config.getConfigBoolean('MERCADOPAGO_ATIVO');
    if (!ativo || this.simulado) {
      return this._simularPix(emprestimo, cliente, opcoes);
    }

    try {
      const valor = Number(opcoes.valor || emprestimo.valorTotal);
      const body = {
        transaction_amount: valor,
        description: opcoes.descricao || `Emprestimo - ${cliente.nome}`,
        payment_method_id: 'pix',
        payer: {
          email: `${cliente.telefone}@gpcredito.com`,
          first_name: cliente.nome.split(' ')[0],
          last_name: cliente.nome.split(' ').slice(1).join(' ') || 'Cliente',
          identification: {
            type: 'CPF',
            number: cliente.cpf || '00000000000',
          },
        },
        notification_url: montarWebhookUrl(),
        external_reference: opcoes.externalReference || emprestimo.id,
      };

      const response = await fetch(`${this.baseUrl}/v1/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': opcoes.idempotencyKey || emprestimo.id,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao gerar Pix');
      }

      logger.info('Pix Mercado Pago gerado', { emprestimoId: emprestimo.id, paymentId: data.id, valor });

      return {
        qrCode: data.point_of_interaction?.transaction_data?.qr_code_base64,
        copiaCola: data.point_of_interaction?.transaction_data?.qr_code,
        paymentId: String(data.id),
      };
    } catch (error) {
      logger.error('Erro ao gerar Pix no Mercado Pago', { error: error.message });
      throw error;
    }
  }

  async verificarPagamento(paymentId) {
    if (this.simulado) {
      return this._simularVerificacao(paymentId);
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao verificar pagamento');
      }

      return {
        status: data.status,
        emprestimoId: data.external_reference,
        valorPago: data.transaction_amount,
        dataPagamento: data.date_approved,
      };
    } catch (error) {
      logger.error('Erro ao verificar pagamento Mercado Pago', { paymentId, error: error.message });
      throw error;
    }
  }

  _simularPix(emprestimo, cliente, opcoes = {}) {
    const fakeId = opcoes.idempotencyKey || `FAKE-${Date.now()}`;
    logger.info('[SIMULADO] Pix gerado', { emprestimoId: emprestimo.id, valor: opcoes.valor || emprestimo.valorTotal });
    return {
      qrCode: null,
      copiaCola: `00020126580014BR.GOV.BCB.PIX0136${fakeId}5204000053039865802BR5913${cliente.nome.substring(0, 13)}6008BRASILIA62070503***6304FAKE`,
      paymentId: fakeId,
    };
  }

  _simularVerificacao(paymentId) {
    return {
      status: 'approved',
      emprestimoId: null,
      valorPago: 0,
      dataPagamento: new Date().toISOString(),
    };
  }
}

module.exports = new MercadoPagoService();
