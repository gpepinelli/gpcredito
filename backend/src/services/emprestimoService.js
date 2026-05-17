// src/services/emprestimoService.js

const { PrismaClient } = require('@prisma/client');
const { calcularDataVencimento, calcularDiasAtraso, gerarParcelas } = require('../utils/calculadora');
const scoreService = require('./scoreService');
const whatsapp = require('../integrations/whatsapp');
const mercadopago = require('../integrations/mercadopago');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

class EmprestimoService {

  async criar({ clienteId, valor, juros, diasParaVencer = 30, totalParcelas = 1 }) {
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new Error('Cliente não encontrado');

    const avaliacao = scoreService.avaliarCredito(cliente.score);
    if (!avaliacao.permitido) throw new Error(avaliacao.mensagem);

    const emprestimoAtivo = await prisma.emprestimo.findFirst({
      where: { clienteId, status: { in: ['pendente', 'atrasado'] } },
    });
    if (emprestimoAtivo) throw new Error('Cliente já possui empréstimo ativo. Quite antes de pegar outro.');

    // Para empréstimo de parcela única, dataVencimento = diasParaVencer
    // Para parcelado, dataVencimento = vencimento da última parcela
    const parcelas = gerarParcelas(valor, juros, totalParcelas);
    const valorTotal = parcelas.reduce((acc, p) => parseFloat((acc + p.valor).toFixed(2)), 0);
    const dataVencimento = totalParcelas === 1
      ? calcularDataVencimento(diasParaVencer)
      : parcelas[parcelas.length - 1].dataVencimento;

    const emprestimo = await prisma.emprestimo.create({
      data: {
        clienteId,
        valor,
        juros,
        valorTotal,
        dataVencimento,
        totalParcelas,
        status: 'pendente',
        parcelas: totalParcelas > 1 ? {
          create: parcelas.map(p => ({
            numero: p.numero,
            valor: p.valor,
            amortizacao: p.amortizacao,
            valorJuros: p.valorJuros,
            saldoAntes: p.saldoAntes,
            saldoDepois: p.saldoDepois,
            dataVencimento: p.dataVencimento,
            status: 'pendente',
          })),
        } : undefined,
      },
      include: { parcelas: true },
    });

    logger.info('💰 Empréstimo criado', { emprestimoId: emprestimo.id, clienteId, valor, valorTotal, totalParcelas, dataVencimento });
    return { emprestimo, avaliacao };
  }

  async gerarEEnviarPix(emprestimo, cliente) {
    if (emprestimo.pixPaymentId) return;
    try {
      const pix = await mercadopago.gerarPix(emprestimo, cliente);
      await prisma.emprestimo.update({
        where: { id: emprestimo.id },
        data: { pixQrCode: pix.qrCode, pixCopiaCola: pix.copiaCola, pixPaymentId: pix.paymentId },
      });
      emprestimo.pixCopiaCola = pix.copiaCola;
      emprestimo.pixQrCode = pix.qrCode;
      emprestimo.pixPaymentId = pix.paymentId;
      await whatsapp.enviarPixVencimento(cliente, emprestimo);
      await new Promise(r => setTimeout(r, 3000));
      await whatsapp.enviarPixCopiaCola(cliente, emprestimo);
      logger.info('✅ Pix gerado e enviado', { emprestimoId: emprestimo.id });
    } catch (error) {
      logger.error('Erro ao gerar/enviar Pix', { emprestimoId: emprestimo.id, error: error.message });
      throw error;
    }
  }

  async confirmarPagamento(emprestimoId, valorPago, dataPagamento = new Date()) {
    const emprestimo = await prisma.emprestimo.findUnique({
      where: { id: emprestimoId },
      include: {
        cliente: true,
        pagamentos: { where: { status: 'confirmado' } },
        parcelas: { orderBy: { numero: 'asc' } },
      },
    });
    if (!emprestimo) throw new Error('Empréstimo não encontrado');
    if (emprestimo.status === 'pago') return { mensagem: 'Pagamento já confirmado anteriormente' };

    const diasAtraso = calcularDiasAtraso(emprestimo.dataVencimento);
    const totalPagoAnterior = emprestimo.pagamentos.reduce((acc, p) => acc + p.valorPago, 0);
    const totalAposPagamento = totalPagoAnterior + Number(valorPago);
    const contratoQuitado = totalAposPagamento >= emprestimo.valorTotal - 0.01;

    let parcelaId = null;
    let novoStatus = 'pendente';

    const pagamento = await prisma.$transaction(async (tx) => {
      // Se o pagamento manual cobre o contrato, liquida todas as parcelas pendentes.
      if (contratoQuitado && emprestimo.parcelas.length > 0) {
        await tx.parcela.updateMany({
          where: { emprestimoId, status: { in: ['pendente', 'atrasado'] } },
          data: { status: 'pago', dataPagamento: new Date(dataPagamento) },
        });
      } else if (emprestimo.totalParcelas > 1 && emprestimo.parcelas.length > 0) {
        const proxima = emprestimo.parcelas.find(p => p.status === 'pendente' || p.status === 'atrasado');
        if (proxima) {
          parcelaId = proxima.id;
          await tx.parcela.update({
            where: { id: proxima.id },
            data: { status: 'pago', dataPagamento: new Date(dataPagamento) },
          });
        }
      }

      // Verifica se todas as parcelas foram pagas
      const parcelasPendentes = await tx.parcela.count({
        where: { emprestimoId, status: { in: ['pendente', 'atrasado'] } },
      });
      novoStatus = (contratoQuitado || emprestimo.totalParcelas === 1 || parcelasPendentes === 0) ? 'pago' : 'pendente';

      const pagamentoCriado = await tx.pagamento.create({
        data: { emprestimoId, valorPago, dataPagamento: new Date(dataPagamento), status: 'confirmado' },
      });

      await tx.emprestimo.update({
        where: { id: emprestimoId },
        data: { status: novoStatus },
      });

      return pagamentoCriado;
    });

    if (novoStatus === 'pago') {
      const tipoScore = scoreService.determinarTipoScore(diasAtraso);
      await scoreService.aplicarAlteracao(emprestimo.clienteId, tipoScore);
      await whatsapp.enviarConfirmacao(emprestimo.cliente, pagamento);
      setTimeout(async () => { await whatsapp.enviarRenovacao(emprestimo.cliente); }, 5 * 60 * 1000);
    }

    logger.info('✅ Pagamento confirmado', { emprestimoId, valorPago, novoStatus });
    return pagamento;
  }

  async confirmarPagamentoParcela(emprestimoId, parcelaId, dataPagamento = new Date()) {
    const emprestimo = await prisma.emprestimo.findUnique({
      where: { id: emprestimoId },
      include: {
        cliente: true,
        parcelas: { orderBy: { numero: 'asc' } },
      },
    });
    if (!emprestimo) throw new Error('Empréstimo não encontrado');
    if (emprestimo.status === 'pago') return { mensagem: 'Pagamento já confirmado anteriormente' };

    const parcela = emprestimo.parcelas.find(p => p.id === parcelaId);
    if (!parcela) throw new Error('Parcela não encontrada');
    if (parcela.status === 'pago') return { mensagem: 'Parcela já paga anteriormente' };

    let novoStatus = 'pendente';
    const pagamento = await prisma.$transaction(async (tx) => {
      await tx.parcela.update({
        where: { id: parcelaId },
        data: { status: 'pago', dataPagamento: new Date(dataPagamento) },
      });

      const parcelasPendentes = await tx.parcela.count({
        where: { emprestimoId, status: { in: ['pendente', 'atrasado'] } },
      });
      novoStatus = parcelasPendentes === 0 ? 'pago' : 'pendente';

      const pagamentoCriado = await tx.pagamento.create({
        data: {
          emprestimoId,
          parcelaId,
          valorPago: parcela.valor,
          dataPagamento: new Date(dataPagamento),
          status: 'confirmado',
        },
      });

      await tx.emprestimo.update({
        where: { id: emprestimoId },
        data: { status: novoStatus },
      });

      return pagamentoCriado;
    });

    if (novoStatus === 'pago') {
      const diasAtraso = calcularDiasAtraso(emprestimo.dataVencimento);
      const tipoScore = scoreService.determinarTipoScore(diasAtraso);
      await scoreService.aplicarAlteracao(emprestimo.clienteId, tipoScore);
      await whatsapp.enviarConfirmacao(emprestimo.cliente, pagamento);
      setTimeout(async () => { await whatsapp.enviarRenovacao(emprestimo.cliente); }, 5 * 60 * 1000);
    }

    logger.info('✅ Parcela paga', { emprestimoId, parcelaId, valorPago: parcela.valor, novoStatus });
    return pagamento;
  }

  async listar(filtros = {}) {
    return prisma.emprestimo.findMany({
      where: filtros,
      include: { cliente: true, pagamentos: true, parcelas: { orderBy: { numero: 'asc' } } },
      orderBy: { dataVencimento: 'asc' },
    });
  }

  async listarInadimplentes() {
    return prisma.emprestimo.findMany({
      where: { status: 'atrasado' },
      include: { cliente: true, parcelas: true },
      orderBy: { dataVencimento: 'asc' },
    });
  }

  async excluir(emprestimoId) {
    const emprestimo = await prisma.emprestimo.findUnique({
      where: { id: emprestimoId },
      include: { cliente: true, pagamentos: true },
    });
    if (!emprestimo) throw new Error('Emprestimo nao encontrado');

    await prisma.$transaction([
      prisma.pagamento.deleteMany({ where: { emprestimoId } }),
      prisma.parcela.deleteMany({ where: { emprestimoId } }),
      prisma.emprestimo.delete({ where: { id: emprestimoId } }),
    ]);

    logger.warn('Emprestimo excluido', { emprestimoId, clienteId: emprestimo.clienteId, cliente: emprestimo.cliente?.nome });
    return emprestimo;
  }

  async calcularLucroTotal() {
    const pagamentos = await prisma.pagamento.findMany({
      where: { status: 'confirmado' },
      include: { emprestimo: true },
    });
    const totalRecebido = pagamentos.reduce((acc, p) => acc + p.valorPago, 0);
    const totalEmprestado = pagamentos.reduce((acc, p) => acc + p.emprestimo.valor, 0);
    return {
      totalEmprestado: parseFloat(totalEmprestado.toFixed(2)),
      totalRecebido: parseFloat(totalRecebido.toFixed(2)),
      lucroJuros: parseFloat((totalRecebido - totalEmprestado).toFixed(2)),
      totalPagamentos: pagamentos.length,
    };
  }

  // Métricas mensais para relatório
  async metricasMensais() {
    const emprestimos = await prisma.emprestimo.findMany({
      include: { pagamentos: { where: { status: 'confirmado' } } },
      orderBy: { dataEmprestimo: 'asc' },
    });

    const meses = {};
    for (const emp of emprestimos) {
      const key = emp.dataEmprestimo.toISOString().slice(0, 7); // "2025-04"
      if (!meses[key]) meses[key] = { mes: key, emprestados: 0, recebidos: 0, lucro: 0, qtd: 0, qPagos: 0 };
      meses[key].emprestados += emp.valor;
      meses[key].qtd += 1;
      for (const p of emp.pagamentos) {
        meses[key].recebidos += p.valorPago;
        meses[key].qPagos += 1;
      }
      meses[key].lucro = meses[key].recebidos - meses[key].emprestados;
    }

    return Object.values(meses).map(m => ({
      ...m,
      emprestados: parseFloat(m.emprestados.toFixed(2)),
      recebidos: parseFloat(m.recebidos.toFixed(2)),
      lucro: parseFloat(m.lucro.toFixed(2)),
    }));
  }

  // Dados completos para exportação Excel
  async dadosParaExport() {
    const [emprestimos, clientes, pagamentos] = await Promise.all([
      prisma.emprestimo.findMany({ include: { cliente: true, pagamentos: true, parcelas: { orderBy: { numero: 'asc' } } }, orderBy: { dataEmprestimo: 'desc' } }),
      prisma.cliente.findMany({ include: { emprestimos: true }, orderBy: { criadoEm: 'desc' } }),
      prisma.pagamento.findMany({ include: { emprestimo: { include: { cliente: true } } }, orderBy: { dataPagamento: 'desc' } }),
    ]);
    return { emprestimos, clientes, pagamentos };
  }
}

module.exports = new EmprestimoService();
