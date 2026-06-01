// src/integrations/mercadopago/index.js
// Integração com Mercado Pago para geração e recebimento de Pix

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
      logger.warn('⚠️  Mercado Pago em modo SIMULADO. Configure MERCADOPAGO_ACCESS_TOKEN no .env');
    }
  }

  /**
   * Gera um Pix para o empréstimo
   * @param {Object} emprestimo - Dados do empréstimo
   * @param {Object} cliente - Dados do cliente
   * @returns {Object} { qrCode, copiaCola, paymentId }
   */
  async gerarPix(emprestimo, cliente) {
    const ativo = await config.getConfigBoolean('MERCADOPAGO_ATIVO');
    if (!ativo || this.simulado) {
      return this._simularPix(emprestimo, cliente);
    }

    try {
      const body = {
        transaction_amount: emprestimo.valorTotal,
        description: `Empréstimo - ${cliente.nome}`,
        payment_method_id: 'pix',
        payer: {
          email: `${cliente.telefone}@emprestimo.com`, // Email fictício obrigatório pela API
          first_name: cliente.nome.split(' ')[0],
          last_name: cliente.nome.split(' ').slice(1).join(' ') || 'Cliente',
          identification: {
            type: 'CPF',
            number: cliente.cpf || '00000000000',
          },
        },
        notification_url: montarWebhookUrl(),
        external_reference: emprestimo.id, // Para identificar no webhook
      };

      const response = await fetch(`${this.baseUrl}/v1/payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': emprestimo.id, // Evita duplicidade
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao gerar Pix');
      }

      logger.info('✅ Pix gerado com sucesso', { emprestimoId: emprestimo.id, paymentId: data.id });

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

  /**
   * Verifica e processa um webhook do Mercado Pago
   * @param {string} paymentId - ID do pagamento recebido no webhook
   * @returns {Object} Dados do pagamento
   */
  async verificarPagamento(paymentId) {
    if (this.simulado) {
      return this._simularVerificacao(paymentId);
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao verificar pagamento');
      }

      return {
        status: data.status, // 'approved', 'pending', 'rejected'
        emprestimoId: data.external_reference,
        valorPago: data.transaction_amount,
        dataPagamento: data.date_approved,
      };
    } catch (error) {
      logger.error('Erro ao verificar pagamento Mercado Pago', { paymentId, error: error.message });
      throw error;
    }
  }

  // ============================================================
  // SIMULAÇÕES para desenvolvimento (sem precisar de conta real)
  // ============================================================
  _simularPix(emprestimo, cliente) {
    const fakeId = `FAKE-${Date.now()}`;
    logger.info('💡 [SIMULADO] Pix gerado', { emprestimoId: emprestimo.id });
    return {
      qrCode: null,
      copiaCola: `00020126580014BR.GOV.BCB.PIX0136${fakeId}5204000053039865802BR5913${cliente.nome.substring(0,13)}6008BRASILIA62070503***6304FAKE`,
      paymentId: fakeId,
    };
  }

  _simularVerificacao(paymentId) {
    return {
      status: 'approved',
      emprestimoId: null, // Precisará ser resolvido por outro meio em simulação
      valorPago: 0,
      dataPagamento: new Date().toISOString(),
    };
  }
}

module.exports = new MercadoPagoService();
