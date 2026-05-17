// src/jobs/cobrancaJob.js
// Cron Jobs - executam automaticamente todos os dias

const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { calcularDiasAtraso } = require('../utils/calculadora');
const whatsapp = require('../integrations/whatsapp');
const emprestimoService = require('../services/emprestimoService');
const scoreService = require('../services/scoreService');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Verifica empréstimos pendentes e atrasados
 * Roda todo dia às 9h da manhã
 */
async function verificarVencimentos() {
  logger.info('⏰ [CRON] Iniciando verificação de vencimentos...');

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  amanha.setHours(23, 59, 59, 0);

  const emprestimos = await prisma.emprestimo.findMany({
    where: {
      status: { in: ['pendente', 'atrasado'] },
    },
    include: { cliente: true },
  });

  let lembretes = 0;
  let pixGerados = 0;
  let cobrancasAtraso = 0;
  let marcadosAtrasados = 0;

  for (const emp of emprestimos) {
    const diasAtraso = calcularDiasAtraso(emp.dataVencimento);
    const venceAmanha = new Date(emp.dataVencimento) >= hoje && new Date(emp.dataVencimento) <= amanha;

    try {
      if (diasAtraso < -1) {
        // Ainda tem mais de 1 dia → não faz nada
        continue;
      } else if (venceAmanha) {
        // Vence amanhã → lembrete leve (sem Pix ainda)
        await whatsapp.enviarLembrete(emp.cliente, emp);
        lembretes++;
      } else if (diasAtraso === 0) {
        // Vence hoje → gera Pix e envia duas mensagens separadas
        await emprestimoService.gerarEEnviarPix(emp, emp.cliente);
        pixGerados++;
      } else if (diasAtraso > 0) {
        // Atrasado → cobrança firme + marca como atrasado
        if (emp.status !== 'atrasado') {
          await prisma.emprestimo.update({
            where: { id: emp.id },
            data: { status: 'atrasado', statusOperacao: 'ATRASADO' },
          });
          marcadosAtrasados++;
        }
        await whatsapp.enviarCobrancaAtraso(emp.cliente, emp, diasAtraso);
        cobrancasAtraso++;

        if (diasAtraso === 8) {
          await scoreService.aplicarAlteracao(emp.clienteId, 'NAO_PAGAMENTO');
          logger.warn('🚨 Score penalizado por inadimplência', { clienteId: emp.clienteId, diasAtraso });
        }
      }

      await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
      logger.error('Erro ao processar empréstimo no cron', { emprestimoId: emp.id, error: error.message });
    }
  }

  logger.info('✅ [CRON] Verificação concluída', { lembretes, pixGerados, cobrancasAtraso, marcadosAtrasados, total: emprestimos.length });
}

async function verificarRenovacoes() {
  logger.info('[CRON] Iniciando verificacao de renovacoes...');
  try {
    const resultado = await emprestimoService.processarRenovacoesPendentes();
    logger.info('[CRON] Renovacoes verificadas', resultado);
  } catch (error) {
    logger.error('Erro ao verificar renovacoes', { error: error.message });
  }
}

function iniciarJobs() {
  cron.schedule('0 9 * * *', verificarVencimentos, { timezone: 'America/Sao_Paulo' });
  cron.schedule('0 18 * * *', verificarVencimentos, { timezone: 'America/Sao_Paulo' });
  cron.schedule('30 9 * * *', verificarRenovacoes, { timezone: 'America/Sao_Paulo' });
  logger.info('✅ Cron jobs registrados: cobranças às 09:00 e 18:00; renovações às 09:30 (Brasília)');
}

module.exports = { iniciarJobs, verificarVencimentos, verificarRenovacoes };
