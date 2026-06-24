const prisma = require('../lib/prisma');
const config = require('./configuracaoService');

function arredondar(valor) {
  return Number(Number(valor || 0).toFixed(2));
}

async function capitalInicial() {
  return arredondar(await config.getConfigNumber('CARTEIRA_OPERACIONAL'));
}

async function totais(tx = prisma) {
  const agrupado = await tx.carteiraMovimentacao.groupBy({
    by: ['tipo'],
    _sum: { valor: true },
  });
  const entradas = arredondar(agrupado.find(item => item.tipo === 'ENTRADA')?._sum?.valor || 0);
  const saidas = arredondar(agrupado.find(item => item.tipo === 'SAIDA')?._sum?.valor || 0);
  const inicial = await capitalInicial();
  return {
    capitalInicial: inicial,
    entradas,
    saidas,
    saldo: arredondar(inicial + entradas - saidas),
  };
}

async function bloquearCarteira(tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('gpcredito:carteira'))`;
}

class CarteiraService {
  async sincronizarLiberacoesAntigas(tx = prisma) {
    const emprestimos = await tx.emprestimo.findMany({
      where: {
        statusOperacao: { in: ['LIBERADO', 'EM_DIA', 'ATRASADO', 'QUITADO'] },
        carteiraMovimentacoes: { none: { tipo: 'SAIDA' } },
      },
      select: { id: true, numeroOperacao: true, valor: true },
    });

    for (const emprestimo of emprestimos) {
      await tx.carteiraMovimentacao.create({
        data: {
          tipo: 'SAIDA',
          valor: arredondar(emprestimo.valor),
          descricao: `Liberacao da operacao ${emprestimo.numeroOperacao}`,
          emprestimoId: emprestimo.id,
        },
      });
    }
    return emprestimos.length;
  }

  async resumo() {
    await this.sincronizarLiberacoesAntigas();
    const [resumo, ultimas] = await Promise.all([
      totais(),
      prisma.carteiraMovimentacao.findMany({
        include: { emprestimo: { select: { id: true, numeroOperacao: true, cliente: { select: { nome: true } } } } },
        orderBy: { criadoEm: 'desc' },
        take: 8,
      }),
    ]);
    return { ...resumo, ultimas };
  }

  async listarMovimentacoes() {
    await this.sincronizarLiberacoesAntigas();
    return prisma.carteiraMovimentacao.findMany({
      include: { emprestimo: { select: { numeroOperacao: true, cliente: { select: { nome: true } } } } },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async exportarCsv() {
    const movimentacoes = await this.listarMovimentacoes();
    const linhas = [
      ['data', 'tipo', 'valor', 'descricao', 'operacao', 'cliente'],
      ...movimentacoes.map(item => [
        item.criadoEm.toISOString(),
        item.tipo,
        item.valor.toFixed(2).replace('.', ','),
        item.descricao || '',
        item.emprestimo?.numeroOperacao || '',
        item.emprestimo?.cliente?.nome || '',
      ]),
    ];
    return linhas.map(linha => linha.map(valor => `"${String(valor).replace(/"/g, '""')}"`).join(';')).join('\n');
  }

  async fluxoCaixa({ inicio, fim } = {}) {
    await this.sincronizarLiberacoesAntigas();
    const whereData = {};
    if (inicio) whereData.gte = new Date(`${inicio}T00:00:00`);
    if (fim) whereData.lte = new Date(`${fim}T23:59:59`);

    const [movimentacoes, pagamentos, carteira] = await Promise.all([
      prisma.carteiraMovimentacao.findMany({
        where: Object.keys(whereData).length ? { criadoEm: whereData } : {},
        include: { emprestimo: { select: { numeroOperacao: true, cliente: { select: { nome: true } } } } },
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.pagamento.findMany({
        where: {
          status: 'confirmado',
          ...(Object.keys(whereData).length ? { dataPagamento: whereData } : {}),
        },
        include: { parcela: true, emprestimo: { include: { cliente: true } } },
        orderBy: { dataPagamento: 'desc' },
      }),
      this.resumo(),
    ]);

    const entradasCarteira = movimentacoes.filter(m => m.tipo === 'ENTRADA').reduce((acc, m) => acc + Number(m.valor || 0), 0);
    const saidasCarteira = movimentacoes.filter(m => m.tipo === 'SAIDA').reduce((acc, m) => acc + Number(m.valor || 0), 0);
    const recebido = pagamentos.reduce((acc, p) => acc + Number(p.valorPago || 0), 0);
    const jurosRecebidos = pagamentos.reduce((acc, p) => acc + Number(p.parcela?.valorJuros || 0), 0);

    return {
      resumo: {
        saldoAtualCarteira: carteira.saldo,
        entradasCarteira,
        saidasCarteira,
        pagamentosRecebidos: recebido,
        jurosRecebidos,
        resultadoPeriodo: entradasCarteira + recebido - saidasCarteira,
      },
      movimentacoes,
      pagamentos,
    };
  }

  async movimentar({ tipo, valor, descricao = null, emprestimoId = null }) {
    const tipoNormalizado = String(tipo || '').toUpperCase();
    if (!['ENTRADA', 'SAIDA'].includes(tipoNormalizado)) throw new Error('Tipo de movimentacao invalido');
    const valorNumerico = arredondar(valor);
    if (valorNumerico <= 0) throw new Error('Valor da movimentacao deve ser maior que zero');

    return prisma.$transaction(async (tx) => {
      await bloquearCarteira(tx);
      if (tipoNormalizado === 'SAIDA') {
        const resumo = await totais(tx);
        if (resumo.saldo < valorNumerico) throw new Error(`Saldo insuficiente na carteira. Disponivel: R$ ${resumo.saldo.toFixed(2)}`);
      }

      return tx.carteiraMovimentacao.create({
        data: {
          tipo: tipoNormalizado,
          valor: valorNumerico,
          descricao: descricao || null,
          emprestimoId,
        },
      });
    });
  }

  async debitarLiberacao(tx, emprestimo) {
    await bloquearCarteira(tx);
    const jaDebitado = await tx.carteiraMovimentacao.findFirst({
      where: { emprestimoId: emprestimo.id, tipo: 'SAIDA' },
    });
    if (jaDebitado) return jaDebitado;

    const resumo = await totais(tx);
    const valor = arredondar(emprestimo.valor);
    if (resumo.saldo < valor) {
      throw new Error(`Saldo insuficiente na carteira para liberar esta operacao. Disponivel: R$ ${resumo.saldo.toFixed(2)}`);
    }

    return tx.carteiraMovimentacao.create({
      data: {
        tipo: 'SAIDA',
        valor,
        descricao: `Liberacao da operacao ${emprestimo.numeroOperacao}`,
        emprestimoId: emprestimo.id,
      },
    });
  }
}

module.exports = new CarteiraService();
