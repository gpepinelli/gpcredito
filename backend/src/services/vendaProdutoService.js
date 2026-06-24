const prisma = require('../lib/prisma');
const logger = require('../utils/logger');
const config = require('./configuracaoService');

const TIPOS_VALIDOS = new Set(['CARRO', 'MOTO', 'CELULAR']);
const STATUS_PRODUTO_VALIDOS = new Set(['DISPONIVEL', 'RESERVADO', 'VENDIDO', 'INATIVO']);

function normalizarTipo(tipo) {
  const valor = String(tipo || '').trim().toUpperCase();
  if (!TIPOS_VALIDOS.has(valor)) throw new Error('Tipo de produto invalido');
  return valor;
}

function normalizarProduto(dados) {
  return {
    tipo: normalizarTipo(dados.tipo),
    titulo: String(dados.titulo || '').trim(),
    descricao: dados.descricao ? String(dados.descricao).trim() : null,
    marca: dados.marca ? String(dados.marca).trim() : null,
    modelo: dados.modelo ? String(dados.modelo).trim() : null,
    ano: dados.ano ? Number(dados.ano) : null,
    identificador: dados.identificador ? String(dados.identificador).trim() : null,
    valorCusto: Number(dados.valorCusto || 0),
    valorVenda: Number(dados.valorVenda),
    status: STATUS_PRODUTO_VALIDOS.has(dados.status) ? dados.status : 'DISPONIVEL',
  };
}

class VendaProdutoService {
  async criarProduto(dados) {
    const produto = await prisma.produtoVenda.create({ data: normalizarProduto(dados) });
    logger.info('Produto de venda criado', { produtoId: produto.id, tipo: produto.tipo });
    return produto;
  }

  async listarProdutos(filtros = {}) {
    const where = {};
    if (filtros.tipo) where.tipo = normalizarTipo(filtros.tipo);
    if (filtros.status) where.status = String(filtros.status).toUpperCase();
    return prisma.produtoVenda.findMany({
      where,
      include: { vendas: { orderBy: { criadoEm: 'desc' }, take: 1 } },
      orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
    });
  }

  async atualizarProduto(id, dados) {
    const data = {};
    for (const campo of ['titulo', 'descricao', 'marca', 'modelo', 'identificador']) {
      if (Object.prototype.hasOwnProperty.call(dados, campo)) data[campo] = dados[campo] ? String(dados[campo]).trim() : null;
    }
    if (Object.prototype.hasOwnProperty.call(dados, 'ano')) data.ano = dados.ano === null || dados.ano === '' ? null : Number(dados.ano);
    if (Object.prototype.hasOwnProperty.call(dados, 'valorCusto')) data.valorCusto = Number(dados.valorCusto || 0);
    if (Object.prototype.hasOwnProperty.call(dados, 'valorVenda')) data.valorVenda = Number(dados.valorVenda);
    if (dados.tipo) data.tipo = normalizarTipo(dados.tipo);
    if (dados.status) data.status = String(dados.status).toUpperCase();

    return prisma.produtoVenda.update({ where: { id }, data });
  }

  async excluirProduto(id) {
    const produto = await prisma.produtoVenda.findUnique({
      where: { id },
      include: { vendas: true },
    });
    if (!produto) throw new Error('Produto nao encontrado');

    const possuiVendaConcluida = produto.vendas.some(venda => venda.status === 'CONCLUIDA');
    if (possuiVendaConcluida) {
      throw new Error('Produto possui venda concluida. Cancele a venda antes de excluir.');
    }

    await prisma.$transaction([
      prisma.vendaProduto.deleteMany({ where: { produtoId: id } }),
      prisma.produtoVenda.delete({ where: { id } }),
    ]);

    logger.warn('Produto de venda excluido', { produtoId: id, tipo: produto.tipo });
    return produto;
  }

  async registrarVenda(dados) {
    const produto = await prisma.produtoVenda.findUnique({ where: { id: dados.produtoId } });
    if (!produto) throw new Error('Produto nao encontrado');
    if (!['DISPONIVEL', 'RESERVADO'].includes(produto.status)) throw new Error('Produto nao esta disponivel para venda');

    const [jurosVendaPadrao, valorMinimoVenda] = await Promise.all([
      config.getConfigNumber('JUROS_VENDA_PADRAO'),
      config.getConfigNumber('VALOR_MINIMO_VENDA'),
    ]);
    const valorBase = Number(dados.valorVenda || produto.valorVenda);
    if (valorBase < valorMinimoVenda) throw new Error(`Valor minimo para venda: R$ ${valorMinimoVenda}`);
    const valorEntrada = Number(dados.valorEntrada || 0);
    const parcelas = Number(dados.parcelas || 1);
    const valorVenda = Number((valorBase * (1 + jurosVendaPadrao / 100)).toFixed(2));
    const saldoParcelado = Math.max(0, valorVenda - valorEntrada);
    const valorParcela = Number((saldoParcelado / Math.max(1, parcelas)).toFixed(2));
    const venda = await prisma.$transaction(async (tx) => {
      const vendaCriada = await tx.vendaProduto.create({
        data: {
          produtoId: produto.id,
          clienteId: dados.clienteId || null,
          compradorNome: String(dados.compradorNome || '').trim(),
          compradorTelefone: dados.compradorTelefone ? String(dados.compradorTelefone).trim() : null,
          valorBase,
          valorVenda,
          valorEntrada,
          jurosPercentual: jurosVendaPadrao,
          valorParcela,
          parcelas,
          observacao: dados.observacao ? String(dados.observacao).trim() : null,
          status: 'CONCLUIDA',
          concluidoEm: new Date(),
        },
        include: { produto: true, cliente: true },
      });
      await tx.produtoVenda.update({ where: { id: produto.id }, data: { status: 'VENDIDO' } });
      return vendaCriada;
    });

    logger.info('Venda de produto registrada', { vendaId: venda.id, produtoId: produto.id, tipo: produto.tipo });
    return venda;
  }

  async listarVendas(filtros = {}) {
    const where = {};
    if (filtros.tipo) where.produto = { tipo: normalizarTipo(filtros.tipo) };
    if (filtros.status) where.status = String(filtros.status).toUpperCase();
    return prisma.vendaProduto.findMany({
      where,
      include: { produto: true, cliente: true },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async cancelarVenda(id) {
    const venda = await prisma.vendaProduto.findUnique({ where: { id }, include: { produto: true } });
    if (!venda) throw new Error('Venda nao encontrada');
    if (venda.status === 'CANCELADA') return venda;

    return prisma.$transaction(async (tx) => {
      await tx.produtoVenda.update({ where: { id: venda.produtoId }, data: { status: 'DISPONIVEL' } });
      return tx.vendaProduto.update({ where: { id }, data: { status: 'CANCELADA', concluidoEm: null }, include: { produto: true, cliente: true } });
    });
  }

  async resumo() {
    const [produtos, vendas] = await Promise.all([
      prisma.produtoVenda.findMany(),
      prisma.vendaProduto.findMany({ where: { status: 'CONCLUIDA' }, include: { produto: true } }),
    ]);

    const porTipo = {};
    for (const tipo of TIPOS_VALIDOS) {
      const produtosTipo = produtos.filter(p => p.tipo === tipo);
      const vendasTipo = vendas.filter(v => v.produto.tipo === tipo);
      const faturamento = vendasTipo.reduce((acc, venda) => acc + venda.valorVenda, 0);
      const lucro = vendasTipo.reduce((acc, venda) => acc + (venda.valorVenda - Number(venda.produto.valorCusto || 0)), 0);
      porTipo[tipo] = {
        estoque: produtosTipo.filter(p => p.status === 'DISPONIVEL').length,
        vendidos: vendasTipo.length,
        faturamento: Number(faturamento.toFixed(2)),
        lucro: Number(lucro.toFixed(2)),
      };
    }

    return { porTipo, totalProdutos: produtos.length, totalVendas: vendas.length };
  }
}

module.exports = new VendaProdutoService();
