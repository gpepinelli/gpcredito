// src/services/emprestimoService.js

const prisma = require('../lib/prisma');
const { calcularDataVencimento, calcularDiasAtraso, gerarParcelas } = require('../utils/calculadora');
const scoreService = require('./scoreService');
const whatsapp = require('../integrations/whatsapp');
const mercadopago = require('../integrations/mercadopago');
const logger = require('../utils/logger');
const contratoService = require('./contratoService');
const adminLogService = require('./adminLogService');
const config = require('./configuracaoService');

const STATUS_OPERACAO_ABERTA = ['AGUARDANDO_ACEITE', 'APROVADO', 'LIBERADO', 'EM_DIA', 'ATRASADO'];
const STATUS_OPERACAO_FINALIZADA_SEM_RENOVACAO = ['CANCELADO', 'RECUSADO'];
function calcularJurosRecebidoPagamento(pagamento) {
  if (pagamento.parcela) return Number(pagamento.parcela.valorJuros || 0);

  const emprestimo = pagamento.emprestimo;
  if (!emprestimo) return 0;

  const valorPago = Number(pagamento.valorPago || 0);
  const valorPrincipal = Number(emprestimo.valor || 0);
  const valorTotal = Number(emprestimo.valorTotal || 0);
  if (valorTotal <= 0 || valorPago <= 0) return 0;

  const proporcaoPrincipal = valorPrincipal / valorTotal;
  const principalProporcional = valorPago * proporcaoPrincipal;
  return Math.max(0, valorPago - principalProporcional);
}

async function gerarNumero(prefixo, campo) {
  const ano = new Date().getFullYear();
  const inicio = `${prefixo}-${ano}-`;
  const ultima = await prisma.emprestimo.findFirst({
    where: { [campo]: { startsWith: inicio } },
    orderBy: { [campo]: 'desc' },
    select: { [campo]: true },
  });
  const valorAtual = ultima?.[campo] || '';
  const sequencial = Number(valorAtual.split('-').pop() || 0) + 1;
  return `${inicio}${String(sequencial).padStart(6, '0')}`;
}

class EmprestimoService {

  async criar({ clienteId, valor, juros, diasParaVencer, totalParcelas = 1 }) {
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new Error('Cliente nao encontrado');

    const [
      permitirMultiplas,
      jurosMinimo,
      jurosMaximo,
      valorMinimo,
      valorMaximo,
      parcelasMinimas,
      parcelasMaximas,
      intervaloParcelasDias,
      diasPrimeiroVencimento,
    ] = await Promise.all([
      config.getConfigBoolean('ALLOW_MULTIPLE_ACTIVE_OPERATIONS'),
      config.getConfigNumber('JUROS_MINIMO'),
      config.getConfigNumber('JUROS_MAXIMO'),
      config.getConfigNumber('VALOR_MINIMO_EMPRESTIMO'),
      config.getConfigNumber('VALOR_MAXIMO_EMPRESTIMO'),
      config.getConfigNumber('PARCELAS_MINIMAS'),
      config.getConfigNumber('PARCELAS_MAXIMAS'),
      config.getConfigNumber('INTERVALO_PARCELAS_DIAS'),
      config.getConfigNumber('DIAS_PRIMEIRO_VENCIMENTO'),
    ]);

    const valorNumerico = Number(valor);
    const jurosNumerico = Number(juros);
    const totalParcelasNumerico = Number(totalParcelas || parcelasMinimas);
    const diasVencimentoNumerico = Number(diasParaVencer || diasPrimeiroVencimento);

    if (valorNumerico < valorMinimo || valorNumerico > valorMaximo) {
      throw new Error(`Valor deve estar entre R$ ${valorMinimo} e R$ ${valorMaximo}`);
    }
    if (jurosNumerico < jurosMinimo || jurosNumerico > jurosMaximo) {
      throw new Error(`Juros deve estar entre ${jurosMinimo}% e ${jurosMaximo}%`);
    }
    if (totalParcelasNumerico < parcelasMinimas || totalParcelasNumerico > parcelasMaximas) {
      throw new Error(`Parcelas deve estar entre ${parcelasMinimas} e ${parcelasMaximas}`);
    }

    const avaliacao = await scoreService.avaliarCredito(cliente.score);
    if (!avaliacao.permitido) throw new Error(avaliacao.mensagem);

    if (!permitirMultiplas) {
      const emprestimoAtivo = await prisma.emprestimo.findFirst({
        where: { clienteId, statusOperacao: { in: STATUS_OPERACAO_ABERTA } },
      });
      if (emprestimoAtivo) throw new Error('Cliente ja possui operacao ativa. Quite ou finalize antes de criar outra.');
    }

    const parcelas = gerarParcelas(valorNumerico, jurosNumerico, totalParcelasNumerico, new Date(), intervaloParcelasDias);
    const valorTotal = parcelas.reduce((acc, p) => parseFloat((acc + p.valor).toFixed(2)), 0);
    const dataVencimento = totalParcelasNumerico === 1
      ? calcularDataVencimento(diasVencimentoNumerico)
      : parcelas[parcelas.length - 1].dataVencimento;
    const numeroOperacao = await gerarNumero('OP', 'numeroOperacao');
    const numeroContrato = await gerarNumero('CT', 'numeroContrato');
    const caminhoContrato = contratoService.caminhoRelativoContrato(cliente, numeroOperacao);

    const emprestimo = await prisma.emprestimo.create({
      data: {
        clienteId,
        numeroOperacao,
        numeroContrato,
        valor: valorNumerico,
        juros: jurosNumerico,
        valorTotal,
        dataVencimento,
        totalParcelas: totalParcelasNumerico,
        status: 'pendente',
        statusOperacao: 'AGUARDANDO_ACEITE',
        parcelas: totalParcelasNumerico > 1 ? {
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
        contratos: {
          create: {
            numeroContrato,
            numeroOperacao,
            clienteId,
            caminhoArquivo: caminhoContrato,
            hashSha256: '',
            statusContrato: 'GERADO',
          },
        },
      },
      include: { parcelas: true, contratos: true },
    });

    let contratoEnviado = false;
    try {
      const caminhoPdf = await contratoService.gerarContrato(emprestimo, cliente);
      contratoEnviado = await whatsapp.enviarContrato(cliente, caminhoPdf);
      if (contratoEnviado) {
        await prisma.contratoOperacao.update({
          where: { numeroContrato },
          data: { statusContrato: 'ENVIADO' },
        });
      }
    } catch (error) {
      logger.error('Erro ao gerar/enviar contrato da operacao', { emprestimoId: emprestimo.id, numeroOperacao, error: error.message });
    }

    logger.info('Operacao financeira criada', { emprestimoId: emprestimo.id, numeroOperacao, numeroContrato, clienteId, valor: valorNumerico, valorTotal, totalParcelas: totalParcelasNumerico, dataVencimento, contratoEnviado });
    return { emprestimo, avaliacao, contratoEnviado };
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
      logger.info('âœ… Pix gerado e enviado', { emprestimoId: emprestimo.id });
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
    if (!emprestimo) throw new Error('EmprÃ©stimo nÃ£o encontrado');
    if (emprestimo.status === 'pago') return { mensagem: 'Pagamento jÃ¡ confirmado anteriormente' };

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

      const statusOperacao = novoStatus === 'pago'
        ? 'QUITADO'
        : (emprestimo.statusOperacao === 'ATRASADO' ? 'ATRASADO' : 'EM_DIA');

      await tx.emprestimo.update({
        where: { id: emprestimoId },
        data: { status: novoStatus, statusOperacao },
      });

      return pagamentoCriado;
    });

    if (novoStatus === 'pago') {
      const tipoScore = scoreService.determinarTipoScore(diasAtraso);
      await scoreService.aplicarAlteracao(emprestimo.clienteId, tipoScore);
      await whatsapp.enviarConfirmacao(emprestimo.cliente, pagamento);
    }

    logger.info('âœ… Pagamento confirmado', { emprestimoId, valorPago, novoStatus });
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
    if (!emprestimo) throw new Error('EmprÃ©stimo nÃ£o encontrado');
    if (emprestimo.status === 'pago') return { mensagem: 'Pagamento jÃ¡ confirmado anteriormente' };

    const parcela = emprestimo.parcelas.find(p => p.id === parcelaId);
    if (!parcela) throw new Error('Parcela nÃ£o encontrada');
    if (parcela.status === 'pago') return { mensagem: 'Parcela jÃ¡ paga anteriormente' };

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

      const statusOperacao = novoStatus === 'pago'
        ? 'QUITADO'
        : (emprestimo.statusOperacao === 'ATRASADO' ? 'ATRASADO' : 'EM_DIA');

      await tx.emprestimo.update({
        where: { id: emprestimoId },
        data: { status: novoStatus, statusOperacao },
      });

      return pagamentoCriado;
    });

    if (novoStatus === 'pago') {
      const diasAtraso = calcularDiasAtraso(emprestimo.dataVencimento);
      const tipoScore = scoreService.determinarTipoScore(diasAtraso);
      await scoreService.aplicarAlteracao(emprestimo.clienteId, tipoScore);
      await whatsapp.enviarConfirmacao(emprestimo.cliente, pagamento);
    }

    logger.info('âœ… Parcela paga', { emprestimoId, parcelaId, valorPago: parcela.valor, novoStatus });
    return pagamento;
  }

  async listar(filtros = {}) {
    const pagina = Math.max(1, Number(filtros.page || filtros.pagina || 1));
    const limite = Math.min(100, Math.max(1, Number(filtros.limit || filtros.limite || 25)));
    const where = {};

    if (filtros.status) where.status = String(filtros.status);
    if (filtros.statusOperacao) where.statusOperacao = String(filtros.statusOperacao).toUpperCase();
    if (filtros.clienteId) where.clienteId = String(filtros.clienteId);
    if (filtros.busca) {
      const busca = String(filtros.busca).trim();
      where.OR = [
        { numeroOperacao: { contains: busca, mode: 'insensitive' } },
        { numeroContrato: { contains: busca, mode: 'insensitive' } },
        { cliente: { is: { nome: { contains: busca, mode: 'insensitive' } } } },
        { cliente: { is: { telefone: { contains: busca, mode: 'insensitive' } } } },
      ];
    }
    if (filtros.inicio || filtros.fim) {
      where.dataVencimento = {};
      if (filtros.inicio) where.dataVencimento.gte = new Date(`${filtros.inicio}T00:00:00`);
      if (filtros.fim) where.dataVencimento.lte = new Date(`${filtros.fim}T23:59:59`);
    }

    const [total, emprestimos] = await Promise.all([
      prisma.emprestimo.count({ where }),
      prisma.emprestimo.findMany({
        where,
        include: { cliente: true, pagamentos: true, contratos: true, parcelas: { orderBy: { numero: 'asc' } } },
        orderBy: { dataVencimento: 'asc' },
        skip: (pagina - 1) * limite,
        take: limite,
      }),
    ]);

    return {
      emprestimos,
      total,
      page: pagina,
      limit: limite,
      totalPages: Math.max(1, Math.ceil(total / limite)),
    };
  }

  async alertasDoDia() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fimHoje = new Date(hoje);
    fimHoje.setHours(23, 59, 59, 999);
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    const fimAmanha = new Date(amanha);
    fimAmanha.setHours(23, 59, 59, 999);

    const whereAberto = { statusOperacao: { in: STATUS_OPERACAO_ABERTA } };
    const [vencendoHoje, vencendoAmanha, atrasados] = await Promise.all([
      prisma.emprestimo.count({ where: { ...whereAberto, dataVencimento: { gte: hoje, lte: fimHoje } } }),
      prisma.emprestimo.count({ where: { ...whereAberto, dataVencimento: { gte: amanha, lte: fimAmanha } } }),
      prisma.emprestimo.count({ where: { ...whereAberto, OR: [{ status: 'atrasado' }, { statusOperacao: 'ATRASADO' }, { dataVencimento: { lt: hoje } }] } }),
    ]);

    return { vencendoHoje, vencendoAmanha, atrasados };
  }

  async painelFinanceiro() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const statusComDinheiroNaRua = ['LIBERADO', 'EM_DIA', 'ATRASADO', 'QUITADO'];
    const emprestimos = await prisma.emprestimo.findMany({
      where: { statusOperacao: { notIn: STATUS_OPERACAO_FINALIZADA_SEM_RENOVACAO } },
      include: {
        cliente: true,
        pagamentos: { where: { status: 'confirmado' }, include: { parcela: true } },
        parcelas: { orderBy: { numero: 'asc' } },
      },
      orderBy: { dataEmprestimo: 'desc' },
    });

    const resumo = {
      totalColocadoRua: 0,
      totalContratado: 0,
      totalRecebido: 0,
      lucroRecebido: 0,
      valorEmAberto: 0,
      valorAtrasado: 0,
      jurosAReceber: 0,
      operacoesAtivas: 0,
      operacoesAtrasadas: 0,
      parcelasAtrasadas: 0,
      aguardandoAceite: 0,
      aguardandoLiberacao: 0,
    };

    const ultimasOperacoes = [];

    for (const emprestimo of emprestimos) {
      const statusOperacao = emprestimo.statusOperacao;
      const dinheiroNaRua = statusComDinheiroNaRua.includes(statusOperacao);
      const ativo = STATUS_OPERACAO_ABERTA.includes(statusOperacao);
      const totalPago = emprestimo.pagamentos.reduce((acc, pagamento) => acc + Number(pagamento.valorPago || 0), 0);
      const saldoAberto = Math.max(0, Number(emprestimo.valorTotal || 0) - totalPago);
      const lucroRecebidoOperacao = emprestimo.pagamentos.reduce((acc, pagamento) => acc + calcularJurosRecebidoPagamento({ ...pagamento, emprestimo }), 0);
      const jurosTotalOperacao = Math.max(0, Number(emprestimo.valorTotal || 0) - Number(emprestimo.valor || 0));
      const parcelasAtrasadas = emprestimo.parcelas.filter((parcela) => parcela.status !== 'pago' && new Date(parcela.dataVencimento) < hoje);
      const valorParcelasAtrasadas = parcelasAtrasadas.reduce((acc, parcela) => acc + Number(parcela.valor || 0), 0);

      if (dinheiroNaRua) {
        resumo.totalColocadoRua += Number(emprestimo.valor || 0);
        resumo.totalContratado += Number(emprestimo.valorTotal || 0);
        resumo.totalRecebido += totalPago;
        resumo.lucroRecebido += lucroRecebidoOperacao;
      }

      if (ativo) {
        resumo.operacoesAtivas += 1;
        resumo.valorEmAberto += saldoAberto;
        resumo.jurosAReceber += Math.max(0, jurosTotalOperacao - lucroRecebidoOperacao);
      }

      if (statusOperacao === 'ATRASADO' || parcelasAtrasadas.length > 0) {
        resumo.operacoesAtrasadas += 1;
        resumo.parcelasAtrasadas += parcelasAtrasadas.length;
        resumo.valorAtrasado += valorParcelasAtrasadas || saldoAberto;
      }

      if (statusOperacao === 'AGUARDANDO_ACEITE') resumo.aguardandoAceite += 1;
      if (statusOperacao === 'APROVADO') resumo.aguardandoLiberacao += 1;

      if (ultimasOperacoes.length < 6) {
        ultimasOperacoes.push({
          id: emprestimo.id,
          numeroOperacao: emprestimo.numeroOperacao,
          cliente: emprestimo.cliente?.nome || null,
          valor: emprestimo.valor,
          valorTotal: emprestimo.valorTotal,
          saldoAberto,
          statusOperacao,
          dataVencimento: emprestimo.dataVencimento,
        });
      }
    }

    Object.keys(resumo).forEach((chave) => {
      if (typeof resumo[chave] === 'number') resumo[chave] = Number(resumo[chave].toFixed(2));
    });

    return { resumo, ultimasOperacoes };
  }

  async aceitarManual(emprestimoId) {
    const emprestimo = await prisma.emprestimo.findUnique({
      where: { id: emprestimoId },
      include: { contratos: { orderBy: { criadoEm: 'desc' }, take: 1 } },
    });
    if (!emprestimo) throw new Error('Emprestimo nao encontrado');

    return prisma.$transaction(async (tx) => {
      const contrato = emprestimo.contratos[0];
      if (contrato) {
        await tx.contratoOperacao.update({
          where: { id: contrato.id },
          data: { statusContrato: 'ACEITO', aceitoEm: new Date() },
        });
      }
      return tx.emprestimo.update({
        where: { id: emprestimoId },
        data: { statusOperacao: 'APROVADO' },
        include: { cliente: true, pagamentos: true, contratos: true, parcelas: { orderBy: { numero: 'asc' } } },
      });
    });
  }

  async liberarDinheiro(emprestimoId) {
    const emprestimo = await prisma.emprestimo.findUnique({ where: { id: emprestimoId } });
    if (!emprestimo) throw new Error('Emprestimo nao encontrado');
    if (!['APROVADO', 'LIBERADO'].includes(emprestimo.statusOperacao)) {
      throw new Error('Operacao precisa estar aprovada para liberar o dinheiro');
    }
    const atualizado = await prisma.emprestimo.update({
      where: { id: emprestimoId },
      data: { statusOperacao: 'LIBERADO' },
      include: { cliente: true, pagamentos: true, contratos: true, parcelas: { orderBy: { numero: 'asc' } } },
    });
    await adminLogService.registrar('CREDITO_LIBERADO', 'Dinheiro liberado ao cliente', { emprestimoId, numeroOperacao: atualizado.numeroOperacao });
    return atualizado;
  }

  async reenviarContrato(emprestimoId) {
    const emprestimo = await prisma.emprestimo.findUnique({
      where: { id: emprestimoId },
      include: { cliente: true, parcelas: { orderBy: { numero: 'asc' } }, contratos: { orderBy: { criadoEm: 'desc' }, take: 1 } },
    });
    if (!emprestimo) throw new Error('Emprestimo nao encontrado');
    const caminhoPdf = await contratoService.gerarContrato(emprestimo, emprestimo.cliente);
    const enviado = await whatsapp.enviarContrato(emprestimo.cliente, caminhoPdf);
    if (enviado && emprestimo.contratos[0]) {
      await prisma.contratoOperacao.update({ where: { id: emprestimo.contratos[0].id }, data: { statusContrato: 'ENVIADO' } });
    }
    return { enviado };
  }

  async reenviarPix(emprestimoId) {
    const emprestimo = await prisma.emprestimo.findUnique({ where: { id: emprestimoId }, include: { cliente: true } });
    if (!emprestimo) throw new Error('Emprestimo nao encontrado');
    const enviado = emprestimo.pixCopiaCola
      ? await whatsapp.enviarPixCopiaCola(emprestimo.cliente, emprestimo)
      : await whatsapp.enviarPixManual(emprestimo.cliente, emprestimo);
    return { enviado: Boolean(enviado) };
  }

  async atualizarObservacao(emprestimoId, observacao = '') {
    return prisma.emprestimo.update({
      where: { id: emprestimoId },
      data: { observacao: String(observacao || '').trim() || null },
      include: { cliente: true, pagamentos: true, contratos: true, parcelas: { orderBy: { numero: 'asc' } } },
    });
  }

  async renegociarPrazo(emprestimoId, dataVencimento, observacao = '') {
    const novaData = new Date(`${dataVencimento}T23:59:59`);
    if (Number.isNaN(novaData.getTime())) throw new Error('Data de vencimento invalida');
    const atualizado = await prisma.emprestimo.update({
      where: { id: emprestimoId },
      data: {
        dataVencimento: novaData,
        status: 'pendente',
        statusOperacao: 'EM_DIA',
        observacao: observacao ? String(observacao).trim() : undefined,
      },
      include: { cliente: true, pagamentos: true, contratos: true, parcelas: { orderBy: { numero: 'asc' } } },
    });
    await adminLogService.registrar('PRAZO_RENEGOCIADO', 'Prazo de operacao renegociado', { emprestimoId, numeroOperacao: atualizado.numeroOperacao, dataVencimento });
    return atualizado;
  }

  async enviarCobrancaLote(ids = []) {
    const selecionados = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (selecionados.length === 0) throw new Error('Nenhuma operacao selecionada');
    const emprestimos = await prisma.emprestimo.findMany({
      where: { id: { in: selecionados } },
      include: { cliente: true, parcelas: true },
    });
    let enviados = 0;
    let falhas = 0;
    for (const emprestimo of emprestimos) {
      const dias = Math.max(1, calcularDiasAtraso(emprestimo.dataVencimento));
      const ok = await whatsapp.enviarCobrancaAtraso(emprestimo.cliente, emprestimo, dias);
      if (ok) enviados += 1;
      else falhas += 1;
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    await adminLogService.registrar('COBRANCA_LOTE', 'Cobranca WhatsApp enviada em lote', { ids: selecionados, enviados, falhas });
    return { enviados, falhas, total: emprestimos.length };
  }

  async listarTodos(filtros = {}) {
    return prisma.emprestimo.findMany({
      where: filtros,
      include: { cliente: true, pagamentos: true, contratos: true, parcelas: { orderBy: { numero: 'asc' } } },
      orderBy: { dataVencimento: 'asc' },
    });
  }

  async listarInadimplentes() {
    return prisma.emprestimo.findMany({
      where: { status: 'atrasado' },
      include: { cliente: true, contratos: true, parcelas: true },
      orderBy: { dataVencimento: 'asc' },
    });
  }

  async inadimplenciaAging() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const atrasados = await prisma.emprestimo.findMany({
      where: {
        statusOperacao: { in: ['ATRASADO', 'EM_DIA', 'LIBERADO'] },
        dataVencimento: { lt: hoje },
      },
      include: { cliente: true },
      orderBy: { dataVencimento: 'asc' },
    });
    const faixas = {
      '1-7': { label: '1 a 7 dias', total: 0, valor: 0, itens: [] },
      '8-15': { label: '8 a 15 dias', total: 0, valor: 0, itens: [] },
      '16-30': { label: '16 a 30 dias', total: 0, valor: 0, itens: [] },
      '30+': { label: '30+ dias', total: 0, valor: 0, itens: [] },
    };
    for (const item of atrasados) {
      const dias = calcularDiasAtraso(item.dataVencimento);
      const chave = dias <= 7 ? '1-7' : dias <= 15 ? '8-15' : dias <= 30 ? '16-30' : '30+';
      faixas[chave].total += 1;
      faixas[chave].valor = Number((faixas[chave].valor + Number(item.valorTotal || 0)).toFixed(2));
      faixas[chave].itens.push({ id: item.id, numeroOperacao: item.numeroOperacao, cliente: item.cliente?.nome, dias, valorTotal: item.valorTotal });
    }
    return faixas;
  }

  async excluir(emprestimoId) {
    const emprestimo = await prisma.emprestimo.findUnique({
      where: { id: emprestimoId },
      include: { cliente: true, pagamentos: true, contratos: true },
    });
    if (!emprestimo) throw new Error('Emprestimo nao encontrado');

    await prisma.$transaction([
      prisma.pagamento.deleteMany({ where: { emprestimoId } }),
      prisma.contratoOperacao.deleteMany({ where: { emprestimoId } }),
      prisma.parcela.deleteMany({ where: { emprestimoId } }),
      prisma.emprestimo.delete({ where: { id: emprestimoId } }),
    ]);

    for (const contrato of emprestimo.contratos) {
      await contratoService.removerContrato(contrato.caminhoArquivo);
    }

    logger.warn('Emprestimo excluido', {
      emprestimoId,
      clienteId: emprestimo.clienteId,
      cliente: emprestimo.cliente?.nome,
      contratosRemovidos: emprestimo.contratos.length,
    });
    return emprestimo;
  }

  async calcularLucroTotal() {
    const pagamentos = await prisma.pagamento.findMany({
      where: { status: 'confirmado' },
      include: { emprestimo: true, parcela: true },
    });
    const totalRecebido = pagamentos.reduce((acc, p) => acc + p.valorPago, 0);
    const emprestimosRecebidos = new Map();
    for (const pagamento of pagamentos) {
      if (pagamento.emprestimo) emprestimosRecebidos.set(pagamento.emprestimo.id, pagamento.emprestimo.valor);
    }
    const totalEmprestado = [...emprestimosRecebidos.values()].reduce((acc, valor) => acc + valor, 0);
    const lucroJuros = pagamentos.reduce((acc, pagamento) => acc + calcularJurosRecebidoPagamento(pagamento), 0);
    return {
      totalEmprestado: parseFloat(totalEmprestado.toFixed(2)),
      totalRecebido: parseFloat(totalRecebido.toFixed(2)),
      lucroJuros: parseFloat(lucroJuros.toFixed(2)),
      totalPagamentos: pagamentos.length,
    };
  }

  // MÃ©tricas mensais para relatÃ³rio
  async metricasMensais() {
    const emprestimos = await prisma.emprestimo.findMany({
      include: { pagamentos: { where: { status: 'confirmado' }, include: { parcela: true } } },
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
        meses[key].lucro += calcularJurosRecebidoPagamento({ ...p, emprestimo: emp });
        meses[key].qPagos += 1;
      }
    }

    return Object.values(meses).map(m => ({
      ...m,
      emprestados: parseFloat(m.emprestados.toFixed(2)),
      recebidos: parseFloat(m.recebidos.toFixed(2)),
      lucro: parseFloat(m.lucro.toFixed(2)),
    }));
  }

  // Dados completos para exportaÃ§Ã£o Excel
  async dadosParaExport() {
    const [emprestimos, clientes, pagamentos] = await Promise.all([
      prisma.emprestimo.findMany({ include: { cliente: true, pagamentos: true, contratos: true, parcelas: { orderBy: { numero: 'asc' } } }, orderBy: { dataEmprestimo: 'desc' } }),
      prisma.cliente.findMany({ include: { emprestimos: true }, orderBy: { criadoEm: 'desc' } }),
      prisma.pagamento.findMany({ include: { emprestimo: { include: { cliente: true } } }, orderBy: { dataPagamento: 'desc' } }),
    ]);
    return { emprestimos, clientes, pagamentos };
  }

  async processarRenovacoesPendentes(agora = new Date()) {
    const diasRenovacao = await config.getConfigNumber('RENOVACAO_DIAS_APOS_QUITACAO');
    const limite = new Date(agora);
    limite.setDate(limite.getDate() - diasRenovacao);

    const emprestimos = await prisma.emprestimo.findMany({
      where: {
        status: 'pago',
        statusOperacao: 'QUITADO',
        renovacaoOferecidaEm: null,
      },
      include: {
        cliente: true,
        pagamentos: {
          where: { status: 'confirmado' },
          orderBy: { dataPagamento: 'desc' },
          take: 1,
        },
      },
    });

    let enviadas = 0;
    let aguardandoPrazo = 0;
    let ignoradasPorNovaOperacao = 0;

    for (const emprestimo of emprestimos) {
      const dataQuitacao = emprestimo.pagamentos[0]?.dataPagamento || emprestimo.dataVencimento;
      if (dataQuitacao > limite) {
        aguardandoPrazo++;
        continue;
      }

      const novaOperacao = await prisma.emprestimo.findFirst({
        where: {
          clienteId: emprestimo.clienteId,
          id: { not: emprestimo.id },
          dataEmprestimo: { gt: dataQuitacao },
          statusOperacao: { notIn: STATUS_OPERACAO_FINALIZADA_SEM_RENOVACAO },
        },
        select: { id: true, numeroOperacao: true, statusOperacao: true },
      });

      if (novaOperacao) {
        ignoradasPorNovaOperacao++;
        continue;
      }

      const operacaoAtiva = await prisma.emprestimo.findFirst({
        where: {
          clienteId: emprestimo.clienteId,
          id: { not: emprestimo.id },
          statusOperacao: { in: STATUS_OPERACAO_ABERTA },
        },
        select: { id: true, numeroOperacao: true },
      });

      if (operacaoAtiva) {
        ignoradasPorNovaOperacao++;
        continue;
      }

      await whatsapp.enviarRenovacao(emprestimo.cliente);
      await prisma.emprestimo.update({
        where: { id: emprestimo.id },
        data: { renovacaoOferecidaEm: agora },
      });
      enviadas++;
      logger.info('Oferta de renovacao enviada', {
        emprestimoId: emprestimo.id,
        numeroOperacao: emprestimo.numeroOperacao,
        clienteId: emprestimo.clienteId,
        dataQuitacao,
      });
    }

    return { enviadas, aguardandoPrazo, ignoradasPorNovaOperacao, analisadas: emprestimos.length };
  }
}

module.exports = new EmprestimoService();

