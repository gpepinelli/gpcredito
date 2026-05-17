// src/services/scoreService.js
// Lógica de score de crédito dos clientes

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

// Regras de alteração de score
const REGRAS_SCORE = {
  PAGOU_EM_DIA: { valor: +10, motivo: 'Pagamento realizado em dia' },
  PAGOU_ANTECIPADO: { valor: +15, motivo: 'Pagamento realizado antecipadamente' },
  ATRASO_ATE_3_DIAS: { valor: -10, motivo: 'Pagamento com atraso de até 3 dias' },
  ATRASO_ATE_7_DIAS: { valor: -15, motivo: 'Pagamento com atraso entre 4 e 7 dias' },
  ATRASO_MAIOR_7_DIAS: { valor: -25, motivo: 'Pagamento com atraso maior que 7 dias' },
  NAO_PAGAMENTO: { valor: -50, motivo: 'Inadimplência confirmada' },
};

// Limites de score para concessão de crédito
const LIMITES = {
  CONFIAVEL: 80,    // >= 80: cliente confiável, crédito liberado
  RISCO_MEDIO: 50,  // 50-79: risco médio, crédito liberado com cautela
  BLOQUEADO: 0,     // < 50: bloqueado para novos empréstimos
  MAXIMO: 200,      // Score máximo possível
  MINIMO: 0,        // Score mínimo possível
};

class ScoreService {
  /**
   * Aplica alteração no score do cliente
   * @param {string} clienteId
   * @param {string} tipo - Chave de REGRAS_SCORE
   */
  async aplicarAlteracao(clienteId, tipo) {
    const regra = REGRAS_SCORE[tipo];
    if (!regra) throw new Error(`Tipo de score inválido: ${tipo}`);

    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new Error('Cliente não encontrado');

    // Calcula novo score respeitando limites
    const novoScore = Math.max(
      LIMITES.MINIMO,
      Math.min(LIMITES.MAXIMO, cliente.score + regra.valor)
    );

    // Atualiza score e salva no histórico em uma transação
    await prisma.$transaction([
      prisma.cliente.update({
        where: { id: clienteId },
        data: { score: novoScore },
      }),
      prisma.historicoScore.create({
        data: {
          clienteId,
          alteracao: regra.valor,
          motivo: regra.motivo,
        },
      }),
    ]);

    logger.info('📊 Score atualizado', {
      clienteId,
      scoreAnterior: cliente.score,
      alteracao: regra.valor,
      novoScore,
      motivo: regra.motivo,
    });

    return novoScore;
  }

  /**
   * Determina o tipo de alteração de score baseado no pagamento
   * @param {number} diasAtraso - Positivo = atrasado, negativo = antecipado, 0 = em dia
   */
  determinarTipoScore(diasAtraso) {
    if (diasAtraso < 0) return 'PAGOU_ANTECIPADO';
    if (diasAtraso === 0) return 'PAGOU_EM_DIA';
    if (diasAtraso <= 3) return 'ATRASO_ATE_3_DIAS';
    if (diasAtraso <= 7) return 'ATRASO_ATE_7_DIAS';
    return 'ATRASO_MAIOR_7_DIAS';
  }

  /**
   * Verifica se cliente pode pegar novo empréstimo
   * @param {number} score
   * @returns {{ permitido: boolean, nivel: string, mensagem: string }}
   */
  avaliarCredito(score) {
    if (score >= LIMITES.CONFIAVEL) {
      return {
        permitido: true,
        nivel: 'confiavel',
        mensagem: '✅ Cliente confiável - crédito liberado',
      };
    }
    if (score >= LIMITES.RISCO_MEDIO) {
      return {
        permitido: true,
        nivel: 'risco_medio',
        mensagem: '⚠️  Cliente com risco médio - crédito liberado com cautela',
      };
    }
    return {
      permitido: false,
      nivel: 'bloqueado',
      mensagem: '🚫 Score abaixo do mínimo - cliente bloqueado para novos empréstimos',
    };
  }

  /**
   * Busca histórico de score de um cliente
   */
  async buscarHistorico(clienteId) {
    return prisma.historicoScore.findMany({
      where: { clienteId },
      orderBy: { data: 'desc' },
    });
  }
}

module.exports = new ScoreService();
