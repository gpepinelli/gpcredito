const prisma = require('../lib/prisma');
const logger = require('../utils/logger');
const config = require('./configuracaoService');

const REGRAS_SCORE = {
  PAGOU_EM_DIA: { chave: 'SCORE_PAGAMENTO_EM_DIA', motivo: 'Pagamento realizado em dia' },
  PAGOU_ANTECIPADO: { chave: 'SCORE_PAGAMENTO_ANTECIPADO', motivo: 'Pagamento realizado antecipadamente' },
  ATRASO_ATE_3_DIAS: { chave: 'SCORE_ATRASO_ATE_3_DIAS', motivo: 'Pagamento com atraso de ate 3 dias' },
  ATRASO_ATE_7_DIAS: { chave: 'SCORE_ATRASO_4_A_7_DIAS', motivo: 'Pagamento com atraso entre 4 e 7 dias' },
  ATRASO_MAIOR_7_DIAS: { chave: 'SCORE_ATRASO_ACIMA_7_DIAS', motivo: 'Pagamento com atraso maior que 7 dias' },
  NAO_PAGAMENTO: { chave: 'SCORE_PENALIDADE_INADIMPLENCIA', motivo: 'Inadimplencia confirmada' },
};

class ScoreService {
  async aplicarAlteracao(clienteId, tipo) {
    const regra = REGRAS_SCORE[tipo];
    if (!regra) throw new Error(`Tipo de score invalido: ${tipo}`);

    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new Error('Cliente nao encontrado');

    const [alteracao, scoreMinimo, scoreMaximo] = await Promise.all([
      config.getConfigNumber(regra.chave),
      config.getConfigNumber('SCORE_MINIMO'),
      config.getConfigNumber('SCORE_MAXIMO'),
    ]);

    const novoScore = Math.max(scoreMinimo, Math.min(scoreMaximo, cliente.score + alteracao));

    await prisma.$transaction([
      prisma.cliente.update({
        where: { id: clienteId },
        data: { score: novoScore },
      }),
      prisma.historicoScore.create({
        data: {
          clienteId,
          alteracao,
          motivo: regra.motivo,
        },
      }),
    ]);

    logger.info('Score atualizado', {
      clienteId,
      scoreAnterior: cliente.score,
      alteracao,
      novoScore,
      motivo: regra.motivo,
    });

    return novoScore;
  }

  determinarTipoScore(diasAtraso) {
    if (diasAtraso < 0) return 'PAGOU_ANTECIPADO';
    if (diasAtraso === 0) return 'PAGOU_EM_DIA';
    if (diasAtraso <= 3) return 'ATRASO_ATE_3_DIAS';
    if (diasAtraso <= 7) return 'ATRASO_ATE_7_DIAS';
    return 'ATRASO_MAIOR_7_DIAS';
  }

  async avaliarCredito(score) {
    const [limiteBloqueado, limiteRiscoMedio] = await Promise.all([
      config.getConfigNumber('SCORE_LIMITE_BLOQUEADO'),
      config.getConfigNumber('SCORE_LIMITE_RISCO_MEDIO'),
    ]);

    if (score >= limiteRiscoMedio) {
      return {
        permitido: true,
        nivel: 'confiavel',
        mensagem: 'Cliente confiavel - credito liberado',
      };
    }

    if (score >= limiteBloqueado) {
      return {
        permitido: true,
        nivel: 'risco_medio',
        mensagem: 'Cliente com risco medio - credito liberado com cautela',
      };
    }

    return {
      permitido: false,
      nivel: 'bloqueado',
      mensagem: 'Score abaixo do minimo - cliente bloqueado para novos emprestimos',
    };
  }

  async buscarHistorico(clienteId) {
    return prisma.historicoScore.findMany({
      where: { clienteId },
      orderBy: { data: 'desc' },
    });
  }
}

module.exports = new ScoreService();
