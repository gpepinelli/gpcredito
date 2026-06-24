const path = require('path');
const prisma = require('../lib/prisma');
const { gerarParcelas } = require('../utils/calculadora');
const config = require('./configuracaoService');
const storageService = require('./storageService');
const whatsapp = require('../integrations/whatsapp');
const logger = require('../utils/logger');
const { executarPythonJson } = require('../utils/pythonRunner');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');

function dataBaseParaPrimeiroVencimento(primeiroVencimento, intervaloDias) {
  const base = new Date(primeiroVencimento);
  base.setDate(base.getDate() - Number(intervaloDias || 30));
  return base;
}

class OrcamentoService {
  async simular({ valor, juros, parcelas, primeiroVencimento }) {
    const intervalo = await config.getConfigNumber('INTERVALO_PARCELAS_DIAS');
    const qtd = Math.max(1, Number(parcelas || 1));
    const vencimento = primeiroVencimento ? new Date(`${primeiroVencimento}T23:59:59`) : new Date();
    if (!primeiroVencimento) vencimento.setDate(vencimento.getDate() + intervalo);
    const lista = gerarParcelas(Number(valor), Number(juros), qtd, dataBaseParaPrimeiroVencimento(vencimento, intervalo), intervalo);
    const valorTotal = lista.reduce((acc, item) => Number((acc + item.valor).toFixed(2)), 0);
    const totalJuros = lista.reduce((acc, item) => Number((acc + item.valorJuros).toFixed(2)), 0);
    return { parcelas: lista, valorTotal, totalJuros, primeiroVencimento: vencimento };
  }

  async criar({ clienteId = null, valor, juros, parcelas, primeiroVencimento }) {
    const cliente = clienteId ? await prisma.cliente.findUnique({ where: { id: clienteId } }) : null;
    if (clienteId && !cliente) throw new Error('Cliente nao encontrado');
    const simulacao = await this.simular({ valor, juros, parcelas, primeiroVencimento });
    const criadoEm = new Date();
    const expiradoEm = new Date(criadoEm.getTime() + 24 * 60 * 60 * 1000);

    const orcamento = await prisma.orcamento.create({
      data: {
        clienteId: cliente?.id || null,
        valor: Number(valor),
        juros: Number(juros),
        parcelas: Number(parcelas || 1),
        primeiroVencimento: simulacao.primeiroVencimento,
        expiradoEm,
      },
      include: { cliente: true },
    });

    const caminhoPdf = storageService.caminhoOrcamento(cliente || 'simulacao', orcamento.id);
    const caminhoSaida = storageService.absoluto(caminhoPdf);
    const empresa = await config.getConfig('NOME_EMPRESA');
    const dadosPdf = JSON.stringify({
      empresa,
      emitidoEm: criadoEm.toISOString(),
      validoAte: expiradoEm.toISOString(),
      cliente: cliente ? { nome: cliente.nome, telefone: cliente.telefone, cpf: cliente.cpf } : null,
      valor: Number(valor),
      juros: Number(juros),
      parcelas: Number(parcelas || 1),
      valorTotal: simulacao.valorTotal,
      totalJuros: simulacao.totalJuros,
      parcelasDetalhadas: simulacao.parcelas,
      caminhoSaida,
    });
    await executarPythonJson(path.join(ROOT_DIR, 'backend', 'scripts', 'gerar_orcamento.py'), dadosPdf);
    await storageService.registrarPdf({
      tipo: 'ORCAMENTO',
      caminhoPdf,
      clienteId: cliente?.id || null,
      origemTipo: 'Orcamento',
      origemId: orcamento.id,
    });
    const atualizado = await prisma.orcamento.update({
      where: { id: orcamento.id },
      data: { caminhoPdf },
      include: { cliente: true },
    });
    logger.info('Orcamento gerado', { orcamentoId: atualizado.id, caminhoPdf });
    return { orcamento: atualizado, simulacao };
  }

  async listar() {
    await this.expirarPendentes();
    return prisma.orcamento.findMany({
      include: { cliente: true },
      orderBy: { criadoEm: 'desc' },
      take: 30,
    });
  }

  async buscar(id) {
    await this.expirarPendentes();
    const orcamento = await prisma.orcamento.findUnique({ where: { id }, include: { cliente: true } });
    if (!orcamento) throw new Error('Orcamento nao encontrado');
    const simulacao = await this.simular({
      valor: orcamento.valor,
      juros: orcamento.juros,
      parcelas: orcamento.parcelas,
      primeiroVencimento: orcamento.primeiroVencimento.toISOString().slice(0, 10),
    });
    return { orcamento, simulacao };
  }

  async enviarWhatsApp(id) {
    const { orcamento } = await this.buscar(id);
    if (!orcamento.cliente) throw new Error('Orcamento sem cliente vinculado');
    if (!orcamento.caminhoPdf) throw new Error('PDF do orcamento nao encontrado');
    const caminho = storageService.absoluto(orcamento.caminhoPdf);
    const enviado = await whatsapp.enviarOrcamento(orcamento.cliente, caminho);
    return { enviado: Boolean(enviado) };
  }

  async converter(id) {
    const { orcamento } = await this.buscar(id);
    if (orcamento.status !== 'PENDENTE') throw new Error('Somente orcamentos pendentes podem ser convertidos');
    const atualizado = await prisma.orcamento.update({
      where: { id },
      data: { status: 'CONVERTIDO' },
      include: { cliente: true },
    });
    return atualizado;
  }

  async excluir(id) {
    const orcamento = await prisma.orcamento.findUnique({ where: { id } });
    if (!orcamento) throw new Error('Orcamento nao encontrado');

    await prisma.$transaction([
      prisma.arquivoPdf.deleteMany({ where: { origemTipo: 'Orcamento', origemId: id } }),
      prisma.orcamento.delete({ where: { id } }),
    ]);
    storageService.removerArquivo(orcamento.caminhoPdf);
    logger.warn('Orcamento excluido manualmente', { orcamentoId: id, caminhoPdf: orcamento.caminhoPdf });
    return orcamento;
  }

  async expirarPendentes(agora = new Date()) {
    const vencidos = await prisma.orcamento.findMany({
      where: { status: 'PENDENTE', expiradoEm: { lte: agora } },
      select: { id: true, caminhoPdf: true },
    });
    for (const orcamento of vencidos) {
      await prisma.$transaction([
        prisma.arquivoPdf.deleteMany({ where: { origemTipo: 'Orcamento', origemId: orcamento.id } }),
        prisma.orcamento.delete({ where: { id: orcamento.id } }),
      ]);
      storageService.removerArquivo(orcamento.caminhoPdf);
    }
    if (vencidos.length > 0) logger.info('Orcamentos vencidos removidos automaticamente', { total: vencidos.length });
    return vencidos.length;
  }
}

module.exports = new OrcamentoService();
