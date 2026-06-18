// src/jobs/cobrancaJob.js
// Cron Jobs - executam automaticamente todos os dias

const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { calcularDiasAtraso } = require('../utils/calculadora');
const whatsapp = require('../integrations/whatsapp');
const emprestimoService = require('../services/emprestimoService');
const orcamentoService = require('../services/orcamentoService');
const scoreService = require('../services/scoreService');
const pixCobrancaService = require('../services/pixCobrancaService');
const config = require('../services/configuracaoService');
const logger = require('../utils/logger');

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
    include: { cliente: true, parcelas: { orderBy: { numero: 'asc' } } },
  });

  let lembretes = 0;
  let pixEnviados = 0;
  let cobrancasAtraso = 0;
  let marcadosAtrasados = 0;

  const [diasPenalidade, mercadoPagoAtivo, pixAutomatico] = await Promise.all([
    config.getConfigNumber('DIAS_INADIMPLENCIA_PENALIDADE'),
    config.getConfigBoolean('MERCADOPAGO_ATIVO'),
    config.getConfigBoolean('PIX_AUTOMATICO_VENCIMENTO'),
  ]);

  async function enviarPix(emp) {
    if (mercadoPagoAtivo && pixAutomatico) {
      const resultado = await pixCobrancaService.gerarEEnviar(emp);
      return Boolean(resultado.enviado);
    }
    return whatsapp.enviarPixManual(emp.cliente, emp);
  }

  for (const emp of emprestimos) {
    const diasAtraso = calcularDiasAtraso(emp.dataVencimento);
    const venceAmanha = new Date(emp.dataVencimento) >= hoje && new Date(emp.dataVencimento) <= amanha;

    try {
      if (diasAtraso < -1) {
        // Ainda tem mais de 1 dia → não faz nada
        continue;
      } else if (venceAmanha) {
        // Vence amanha: lembrete + Pix manual do credor
        await whatsapp.enviarLembrete(emp.cliente, emp);
        if (await enviarPix(emp)) pixEnviados++;
        lembretes++;
      } else if (diasAtraso === 0) {
        // Vence hoje: aviso + Pix manual do credor
        await whatsapp.enviarCobrancaHoje(emp.cliente, emp);
        if (await enviarPix(emp)) pixEnviados++;
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
        if (await enviarPix(emp)) pixEnviados++;
        cobrancasAtraso++;

        if (diasAtraso >= diasPenalidade && !emp.scorePenalizadoInadimplenciaEm) {
          await scoreService.aplicarAlteracao(emp.clienteId, 'NAO_PAGAMENTO');
          await prisma.emprestimo.update({
            where: { id: emp.id },
            data: { scorePenalizadoInadimplenciaEm: new Date() },
          });
          logger.warn('🚨 Score penalizado por inadimplência', { clienteId: emp.clienteId, diasAtraso });
        }
      }

      await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
      logger.error('Erro ao processar empréstimo no cron', { emprestimoId: emp.id, error: error.message });
    }
  }

  logger.info('✅ [CRON] Verificação concluída', { lembretes, pixEnviados, cobrancasAtraso, marcadosAtrasados, total: emprestimos.length });
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

async function expirarOrcamentos() {
  try {
    await orcamentoService.expirarPendentes();
  } catch (error) {
    logger.error('Erro ao expirar orcamentos', { error: error.message });
  }
}

function cronExpression(hora = '09:00') {
  const [hh, mm] = String(hora).split(':').map(Number);
  return `${mm || 0} ${hh || 0} * * *`;
}

async function iniciarJobs() {
  const [horaManha, horaTarde, horaRenovacao, timezone] = await Promise.all([
    config.getConfig('COBRANCA_HORA_MANHA'),
    config.getConfig('COBRANCA_HORA_TARDE'),
    config.getConfig('RENOVACAO_HORA'),
    config.getConfig('TIMEZONE'),
  ]);
  cron.schedule(cronExpression(horaManha), verificarVencimentos, { timezone });
  cron.schedule(cronExpression(horaTarde), verificarVencimentos, { timezone });
  cron.schedule(cronExpression(horaRenovacao), verificarRenovacoes, { timezone });
  cron.schedule('0 * * * *', expirarOrcamentos, { timezone });
  logger.info('✅ Cron jobs registrados: cobranças às 09:00 e 18:00; renovações às 09:30 (Brasília)');
}

module.exports = { iniciarJobs, verificarVencimentos, verificarRenovacoes, expirarOrcamentos };
