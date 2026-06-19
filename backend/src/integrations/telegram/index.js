const prisma = require('../../lib/prisma');
const logger = require('../../utils/logger');
const whatsapp = require('../whatsapp');
const carteiraService = require('../../services/carteiraService');
const emprestimoService = require('../../services/emprestimoService');
const vendaProdutoService = require('../../services/vendaProdutoService');

const INTERVALO_POLLING_MS = 5000;
const STATUS_ABERTOS = ['AGUARDANDO_ACEITE', 'APROVADO', 'LIBERADO', 'EM_DIA', 'ATRASADO'];
const STATUS_FINAIS = ['QUITADO', 'CANCELADO', 'RECUSADO'];

function boolEnv(valor) {
  return ['true', '1', 'sim', 'yes', 'on'].includes(String(valor || '').trim().toLowerCase());
}

function numeroEnv(chave, padrao) {
  const valor = Number(process.env[chave]);
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}

function moeda(valor) {
  return `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`;
}

function dataBr(data) {
  if (!data) return '-';
  return new Date(data).toLocaleDateString('pt-BR');
}

function dataHoraBr(data) {
  if (!data) return '-';
  return new Date(data).toLocaleString('pt-BR');
}

function diasAtraso(data) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const vencimento = new Date(data);
  vencimento.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((hoje - vencimento) / 86400000));
}

function limitarTexto(texto, limite = 3900) {
  const valor = String(texto || '');
  if (valor.length <= limite) return valor;
  return `${valor.slice(0, limite - 40)}\n\n...resultado resumido para caber no Telegram.`;
}

function primeiraLinha(item, fallback = '-') {
  return String(item || fallback).replace(/\s+/g, ' ').trim();
}

function normalizarBusca(args) {
  return args.join(' ').trim();
}

class TelegramService {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
    this.ativo = boolEnv(process.env.TELEGRAM_ATIVO);
    this.offset = 0;
    this.intervalo = null;
    this.inicializado = false;
    this.rateLimitWindowMs = numeroEnv('TELEGRAM_RATE_LIMIT_WINDOW_MS', 10000);
    this.rateLimitMax = numeroEnv('TELEGRAM_RATE_LIMIT_MAX', 6);
    this.rateLimitBuckets = new Map();
  }

  status() {
    return {
      enabled: this.ativo,
      configured: Boolean(this.token && this.chatId),
      polling: Boolean(this.intervalo),
      rateLimit: {
        windowMs: this.rateLimitWindowMs,
        max: this.rateLimitMax,
      },
    };
  }

  async initialize() {
    if (!this.ativo) {
      logger.info('Telegram desativado.');
      return;
    }

    if (!this.token) {
      logger.warn('Telegram ativo, mas TELEGRAM_BOT_TOKEN nao foi configurado.');
      return;
    }

    this.inicializado = true;
    this.intervalo = setInterval(() => this.poll().catch(error => {
      logger.error('Erro no polling do Telegram', { error: error.message });
    }), INTERVALO_POLLING_MS);
    this.intervalo.unref?.();

    logger.info('Telegram bot iniciado', { chatConfigurado: Boolean(this.chatId) });
    if (this.chatId) await this.sendMessage('GPCredito online. Use /ajuda para ver os comandos.');
  }

  async api(method, payload = {}) {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.description || `Erro Telegram ${method}`);
    }
    return data.result;
  }

  async sendMessage(text, chatId = this.chatId) {
    if (!this.ativo || !this.token || !chatId) return false;
    await this.api('sendMessage', {
      chat_id: chatId,
      text: limitarTexto(text),
      disable_web_page_preview: true,
    });
    return true;
  }

  async poll() {
    const updates = await this.api('getUpdates', {
      offset: this.offset,
      timeout: 0,
      allowed_updates: ['message'],
    });

    for (const update of updates || []) {
      this.offset = Math.max(this.offset, update.update_id + 1);
      await this.handleUpdate(update);
    }
  }

  verificarRateLimit(chatId, comando) {
    if (['/start', '/ajuda', '/help'].includes(comando)) return { permitido: true };

    const agora = Date.now();
    const chave = String(chatId);
    const inicioJanela = agora - this.rateLimitWindowMs;
    const bucket = (this.rateLimitBuckets.get(chave) || []).filter(timestamp => timestamp > inicioJanela);

    if (bucket.length >= this.rateLimitMax) {
      const aguardarMs = Math.max(1000, this.rateLimitWindowMs - (agora - bucket[0]));
      this.rateLimitBuckets.set(chave, bucket);
      return { permitido: false, aguardarSegundos: Math.ceil(aguardarMs / 1000) };
    }

    bucket.push(agora);
    this.rateLimitBuckets.set(chave, bucket);
    return { permitido: true };
  }

  async handleUpdate(update) {
    const message = update.message;
    const chatId = String(message?.chat?.id || '');
    const text = String(message?.text || '').trim();
    if (!chatId || !text) return;

    if (!this.chatId) {
      logger.warn('Mensagem Telegram recebida sem TELEGRAM_CHAT_ID configurado', { chatId });
      await this.sendMessage(`Seu TELEGRAM_CHAT_ID e: ${chatId}\nConfigure esse valor no .env da VPS.`, chatId);
      return;
    }

    if (chatId !== String(this.chatId)) {
      logger.warn('Mensagem Telegram ignorada de chat nao autorizado', { chatId });
      return;
    }

    const [comandoBruto, ...args] = text.split(/\s+/);
    const comando = comandoBruto.toLowerCase().split('@')[0];
    const rateLimit = this.verificarRateLimit(chatId, comando);
    if (!rateLimit.permitido) {
      return this.sendMessage(`Muitos comandos em sequencia. Aguarde ${rateLimit.aguardarSegundos}s e tente novamente.`);
    }

    try {
      if (['/start', '/ajuda', '/help'].includes(comando)) return this.sendMessage(this.ajuda());
      if (['/status', '/saude'].includes(comando)) return this.sendMessage(await this.comandoStatus());
      if (['/resumo', '/financeiro'].includes(comando)) return this.sendMessage(await this.comandoResumoFinanceiro());
      if (comando === '/hoje') return this.sendMessage(await this.comandoHoje());
      if (comando === '/carteira') return this.sendMessage(await this.comandoCarteira());
      if (comando === '/atrasados') return this.sendMessage(await this.comandoAtrasados());
      if (comando === '/aging') return this.sendMessage(await this.comandoAging());
      if (comando === '/aceites') return this.sendMessage(await this.comandoOperacoesPorStatus('AGUARDANDO_ACEITE'));
      if (comando === '/liberar') return this.sendMessage(await this.comandoOperacoesPorStatus('APROVADO'));
      if (comando === '/operacoes') return this.sendMessage(await this.comandoOperacoes(args));
      if (comando === '/operacao') return this.sendMessage(await this.comandoOperacao(args));
      if (comando === '/clientes') return this.sendMessage(await this.comandoClientes(args));
      if (comando === '/cliente') return this.sendMessage(await this.comandoCliente(args));
      if (comando === '/scorebaixo') return this.sendMessage(await this.comandoScoreBaixo());
      if (comando === '/promessas') return this.sendMessage(await this.comandoPromessas());
      if (comando === '/pix') return this.sendMessage(await this.comandoPix());
      if (comando === '/vendas') return this.sendMessage(await this.comandoVendas());
      if (comando === '/estoque') return this.sendMessage(await this.comandoEstoque(args));
      if (comando === '/orcamentos') return this.sendMessage(await this.comandoOrcamentos());
      return this.sendMessage('Comando nao reconhecido. Use /ajuda.');
    } catch (error) {
      logger.error('Erro ao responder comando Telegram', { comando, error: error.message });
      return this.sendMessage(`Erro ao executar ${comando}: ${error.message}`);
    }
  }

  ajuda() {
    return [
      'GPCredito - comandos',
      '',
      'Sistema',
      '/status - servidor, banco, WhatsApp, Telegram e carteira',
      '/hoje - vencimentos, atrasos, aceites e liberacoes',
      '',
      'Financeiro',
      '/resumo - capital, recebidos, lucro, atraso e aberto',
      '/carteira - saldo operacional e ultimas movimentacoes',
      '/atrasados - operacoes em atraso',
      '/aging - inadimplencia por faixa de dias',
      '/pix - cobrancas Pix pendentes',
      '',
      'Credito',
      '/operacoes [status] - ultimas operacoes, opcional por status',
      '/operacao OP-2026-000001 - detalhe de uma operacao',
      '/aceites - contratos aguardando aceite',
      '/liberar - operacoes aprovadas aguardando liberacao',
      '/promessas - promessas de pagamento pendentes',
      '',
      'Clientes',
      '/clientes termo - busca clientes por nome, CPF ou telefone',
      '/cliente termo - resumo do primeiro cliente encontrado',
      '/scorebaixo - clientes com score abaixo de 80',
      '',
      'Vendas e estoque',
      '/vendas - resumo de vendas por modulo',
      '/estoque [carro|moto|celular] - produtos disponiveis',
      '/orcamentos - orcamentos pendentes recentes',
    ].join('\n');
  }

  async comandoStatus() {
    await prisma.$queryRaw`SELECT 1`;
    const wa = whatsapp.status ? whatsapp.status() : { connected: false, queued: 0, adapter: 'unknown' };
    const carteira = await carteiraService.resumo();
    return [
      'Status GPCredito',
      '',
      'Servidor: online',
      'Banco: ok',
      `WhatsApp: ${wa.connected ? 'conectado' : 'desconectado'} (${wa.adapter || 'n/a'})`,
      `Fila WhatsApp: ${wa.queued || 0}`,
      `Telegram: ativo (${this.rateLimitMax} comandos/${Math.round(this.rateLimitWindowMs / 1000)}s)`,
      `Carteira: ${moeda(carteira.saldo)}`,
      `Atualizado em: ${dataHoraBr(new Date())}`,
    ].join('\n');
  }

  async comandoResumoFinanceiro() {
    const painel = await emprestimoService.painelFinanceiro();
    const r = painel.resumo;
    return [
      'Resumo financeiro',
      '',
      `Capital liberado: ${moeda(r.totalColocadoRua)}`,
      `Total contratado: ${moeda(r.totalContratado)}`,
      `Recebido: ${moeda(r.totalRecebido)}`,
      `Lucro recebido: ${moeda(r.lucroRecebido)}`,
      `Em aberto: ${moeda(r.valorEmAberto)}`,
      `Juros a receber: ${moeda(r.jurosAReceber)}`,
      `Em atraso: ${moeda(r.valorAtrasado)} (${r.parcelasAtrasadas} parcela(s))`,
      `Aguardando liberacao: ${moeda(r.valorAguardandoLiberacao)} (${r.aguardandoLiberacao})`,
      '',
      `Carteira disponivel: ${moeda(r.carteira?.saldo)}`,
    ].join('\n');
  }

  async comandoHoje() {
    const [alertas, painel, promessas] = await Promise.all([
      emprestimoService.alertasDoDia(),
      emprestimoService.painelFinanceiro(),
      prisma.promessaPagamento.count({ where: { status: 'PENDENTE', dataPrometida: { lte: fimDoDia(new Date()) } } }),
    ]);
    return [
      'Agenda operacional',
      '',
      `Vencendo hoje: ${alertas.vencendoHoje}`,
      `Vencendo amanha: ${alertas.vencendoAmanha}`,
      `Atrasados: ${alertas.atrasados}`,
      `Aguardando aceite: ${painel.resumo.aguardandoAceite}`,
      `Aprovadas para liberar: ${painel.resumo.aguardandoLiberacao}`,
      `Promessas ate hoje: ${promessas}`,
    ].join('\n');
  }

  async comandoCarteira() {
    const carteira = await carteiraService.resumo();
    const ultimas = carteira.ultimas || [];
    return [
      'Carteira operacional',
      '',
      `Capital configurado: ${moeda(carteira.capitalInicial)}`,
      `Entradas: ${moeda(carteira.entradas)}`,
      `Saidas: ${moeda(carteira.saidas)}`,
      `Saldo atual: ${moeda(carteira.saldo)}`,
      '',
      'Ultimas movimentacoes',
      ...(ultimas.length ? ultimas.map(item => {
        const sinal = item.tipo === 'ENTRADA' ? '+' : '-';
        const operacao = item.emprestimo?.numeroOperacao ? ` (${item.emprestimo.numeroOperacao})` : '';
        return `${sinal} ${moeda(item.valor)} - ${primeiraLinha(item.descricao, item.tipo)}${operacao}`;
      }) : ['Nenhuma movimentacao registrada.']),
    ].join('\n');
  }

  async comandoAtrasados() {
    const hoje = inicioDoDia(new Date());
    const atrasados = await prisma.emprestimo.findMany({
      where: {
        OR: [
          { status: 'atrasado' },
          { statusOperacao: 'ATRASADO' },
          { dataVencimento: { lt: hoje } },
        ],
        statusOperacao: { notIn: STATUS_FINAIS },
      },
      include: { cliente: true, pagamentos: { where: { status: 'confirmado' } } },
      orderBy: { dataVencimento: 'asc' },
      take: 10,
    });

    if (atrasados.length === 0) return 'Nenhuma operacao atrasada agora.';

    return [
      'Operacoes atrasadas',
      '',
      ...atrasados.map(item => {
        const pago = item.pagamentos.reduce((acc, p) => acc + Number(p.valorPago || 0), 0);
        const saldo = Math.max(0, Number(item.valorTotal || 0) - pago);
        return `${item.numeroOperacao} - ${item.cliente?.nome || 'Cliente'} - saldo ${moeda(saldo)} - ${diasAtraso(item.dataVencimento)} dia(s)`;
      }),
    ].join('\n');
  }

  async comandoAging() {
    const faixas = await emprestimoService.inadimplenciaAging();
    return [
      'Inadimplencia por faixa',
      '',
      ...Object.values(faixas).map(faixa => `${faixa.label}: ${faixa.total} operacao(oes), ${moeda(faixa.valor)}`),
    ].join('\n');
  }

  async comandoOperacoes(args) {
    const status = args[0] ? String(args[0]).toUpperCase() : null;
    if (status && ![...STATUS_ABERTOS, ...STATUS_FINAIS].includes(status)) {
      return `Status invalido. Use: ${[...STATUS_ABERTOS, ...STATUS_FINAIS].join(', ')}`;
    }
    return this.comandoOperacoesPorStatus(status);
  }

  async comandoOperacoesPorStatus(status = null) {
    const operacoes = await prisma.emprestimo.findMany({
      where: status ? { statusOperacao: status } : { statusOperacao: { in: STATUS_ABERTOS } },
      include: { cliente: true, pagamentos: { where: { status: 'confirmado' } } },
      orderBy: { dataEmprestimo: 'desc' },
      take: 10,
    });

    if (operacoes.length === 0) return status ? `Nenhuma operacao com status ${status}.` : 'Nenhuma operacao aberta.';

    return [
      status ? `Operacoes - ${status}` : 'Operacoes abertas',
      '',
      ...operacoes.map(item => {
        const pago = item.pagamentos.reduce((acc, p) => acc + Number(p.valorPago || 0), 0);
        const saldo = Math.max(0, Number(item.valorTotal || 0) - pago);
        return `${item.numeroOperacao} - ${item.cliente?.nome || 'Cliente'} - ${item.statusOperacao} - saldo ${moeda(saldo)}`;
      }),
    ].join('\n');
  }

  async comandoOperacao(args) {
    const busca = normalizarBusca(args);
    if (!busca) return 'Informe o numero da operacao. Exemplo: /operacao OP-2026-000001';

    const operacao = await prisma.emprestimo.findFirst({
      where: { numeroOperacao: { contains: busca, mode: 'insensitive' } },
      include: {
        cliente: true,
        pagamentos: { where: { status: 'confirmado' }, orderBy: { dataPagamento: 'desc' } },
        parcelas: { orderBy: { numero: 'asc' } },
      },
      orderBy: { dataEmprestimo: 'desc' },
    });
    if (!operacao) return 'Operacao nao encontrada.';

    const pago = operacao.pagamentos.reduce((acc, p) => acc + Number(p.valorPago || 0), 0);
    const saldo = Math.max(0, Number(operacao.valorTotal || 0) - pago);
    const proxima = operacao.parcelas.find(p => p.status !== 'pago');
    return [
      `Operacao ${operacao.numeroOperacao}`,
      '',
      `Cliente: ${operacao.cliente?.nome || '-'}`,
      `CPF: ${operacao.cliente?.cpf || '-'}`,
      `Status: ${operacao.statusOperacao}`,
      `Principal: ${moeda(operacao.valor)}`,
      `Total contrato: ${moeda(operacao.valorTotal)}`,
      `Recebido: ${moeda(pago)}`,
      `Saldo: ${moeda(saldo)}`,
      `Vencimento final: ${dataBr(operacao.dataVencimento)}`,
      `Parcelas: ${operacao.totalParcelas}`,
      proxima ? `Proxima parcela: ${proxima.numero} - ${moeda(proxima.valor)} - ${dataBr(proxima.dataVencimento)}` : 'Proxima parcela: nenhuma',
      operacao.observacao ? `Observacao: ${primeiraLinha(operacao.observacao)}` : null,
    ].filter(Boolean).join('\n');
  }

  async comandoClientes(args) {
    const busca = normalizarBusca(args);
    if (!busca) return 'Informe um termo. Exemplo: /clientes ana';
    const clientes = await buscarClientes(busca, 10);
    if (clientes.length === 0) return 'Nenhum cliente encontrado.';
    return [
      'Clientes encontrados',
      '',
      ...clientes.map(cliente => `${cliente.nome} - ${cliente.telefone} - score ${cliente.score}${cliente.cpf ? ` - CPF ${cliente.cpf}` : ''}`),
    ].join('\n');
  }

  async comandoCliente(args) {
    const busca = normalizarBusca(args);
    if (!busca) return 'Informe nome, CPF ou telefone. Exemplo: /cliente ana';
    const [cliente] = await buscarClientes(busca, 1, {
      emprestimos: { include: { pagamentos: { where: { status: 'confirmado' } } } },
      vendas: { include: { produto: true } },
      orcamentos: { orderBy: { criadoEm: 'desc' }, take: 3 },
    });
    if (!cliente) return 'Cliente nao encontrado.';

    const abertas = cliente.emprestimos.filter(e => STATUS_ABERTOS.includes(e.statusOperacao));
    const totalTomado = cliente.emprestimos.reduce((acc, e) => acc + Number(e.valor || 0), 0);
    const totalPago = cliente.emprestimos.flatMap(e => e.pagamentos).reduce((acc, p) => acc + Number(p.valorPago || 0), 0);
    const saldo = cliente.emprestimos.reduce((acc, e) => {
      const pago = e.pagamentos.reduce((soma, p) => soma + Number(p.valorPago || 0), 0);
      return acc + Math.max(0, Number(e.valorTotal || 0) - pago);
    }, 0);

    return [
      `Cliente: ${cliente.nome}`,
      '',
      `Telefone: ${cliente.telefone}`,
      `CPF: ${cliente.cpf || '-'}`,
      `Score: ${cliente.score}`,
      `Operacoes abertas: ${abertas.length}`,
      `Total principal tomado: ${moeda(totalTomado)}`,
      `Total pago: ${moeda(totalPago)}`,
      `Saldo devedor: ${moeda(saldo)}`,
      `Vendas vinculadas: ${cliente.vendas.length}`,
      `Orcamentos recentes: ${cliente.orcamentos.length}`,
    ].join('\n');
  }

  async comandoScoreBaixo() {
    const clientes = await prisma.cliente.findMany({
      where: { score: { lt: 80 } },
      orderBy: [{ score: 'asc' }, { nome: 'asc' }],
      take: 10,
    });
    if (clientes.length === 0) return 'Nenhum cliente com score abaixo de 80.';
    return [
      'Clientes com score baixo',
      '',
      ...clientes.map(cliente => `${cliente.nome} - score ${cliente.score} - ${cliente.telefone}`),
    ].join('\n');
  }

  async comandoPromessas() {
    const promessas = await prisma.promessaPagamento.findMany({
      where: { status: 'PENDENTE' },
      include: { cliente: true, emprestimo: true },
      orderBy: { dataPrometida: 'asc' },
      take: 10,
    });
    if (promessas.length === 0) return 'Nenhuma promessa de pagamento pendente.';
    return [
      'Promessas de pagamento',
      '',
      ...promessas.map(item => `${dataBr(item.dataPrometida)} - ${item.cliente?.nome || 'Cliente'} - ${moeda(item.valor)} - ${item.emprestimo?.numeroOperacao || '-'}`),
    ].join('\n');
  }

  async comandoPix() {
    const pendentes = await prisma.pixCobranca.findMany({
      where: { status: 'PENDENTE' },
      include: { emprestimo: { include: { cliente: true } }, parcela: true },
      orderBy: { criadoEm: 'desc' },
      take: 10,
    });
    if (pendentes.length === 0) return 'Nenhuma cobranca Pix pendente.';
    return [
      'Pix pendentes',
      '',
      ...pendentes.map(item => {
        const parcela = item.parcela ? `parcela ${item.parcela.numero}` : 'contrato';
        return `${item.emprestimo.numeroOperacao} - ${item.emprestimo.cliente?.nome || 'Cliente'} - ${parcela} - ${moeda(item.valor)}`;
      }),
    ].join('\n');
  }

  async comandoVendas() {
    const resumo = await vendaProdutoService.resumo();
    return [
      'Vendas e estoque',
      '',
      ...Object.entries(resumo.porTipo).map(([tipo, dados]) => `${tipo}: ${dados.estoque} em estoque, ${dados.vendidos} vendido(s), faturamento ${moeda(dados.faturamento)}, lucro ${moeda(dados.lucro)}`),
      '',
      `Produtos cadastrados: ${resumo.totalProdutos}`,
      `Vendas concluidas: ${resumo.totalVendas}`,
    ].join('\n');
  }

  async comandoEstoque(args) {
    const tipo = args[0] ? String(args[0]).toUpperCase() : null;
    const tipos = { CARRO: 'CARRO', CARROS: 'CARRO', MOTO: 'MOTO', MOTOS: 'MOTO', CELULAR: 'CELULAR', CELULARES: 'CELULAR' };
    const tipoNormalizado = tipo ? tipos[tipo] : null;
    if (tipo && !tipoNormalizado) return 'Tipo invalido. Use carro, moto ou celular.';

    const produtos = await prisma.produtoVenda.findMany({
      where: { status: 'DISPONIVEL', ...(tipoNormalizado ? { tipo: tipoNormalizado } : {}) },
      orderBy: { criadoEm: 'desc' },
      take: 10,
    });
    if (produtos.length === 0) return 'Nenhum produto disponivel no estoque consultado.';
    return [
      tipoNormalizado ? `Estoque - ${tipoNormalizado}` : 'Estoque disponivel',
      '',
      ...produtos.map(item => `${item.tipo} - ${item.titulo} - venda ${moeda(item.valorVenda)}${item.identificador ? ` - ${item.identificador}` : ''}`),
    ].join('\n');
  }

  async comandoOrcamentos() {
    const orcamentos = await prisma.orcamento.findMany({
      where: { status: 'PENDENTE' },
      include: { cliente: true },
      orderBy: { criadoEm: 'desc' },
      take: 10,
    });
    if (orcamentos.length === 0) return 'Nenhum orcamento pendente.';
    return [
      'Orcamentos pendentes',
      '',
      ...orcamentos.map(item => `${item.cliente?.nome || 'Simulacao'} - ${moeda(item.valor)} - ${item.parcelas}x - criado ${dataBr(item.criadoEm)}`),
    ].join('\n');
  }
}

function inicioDoDia(data) {
  const inicio = new Date(data);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}

function fimDoDia(data) {
  const fim = new Date(data);
  fim.setHours(23, 59, 59, 999);
  return fim;
}

async function buscarClientes(busca, take, include = undefined) {
  const termo = String(busca || '').trim();
  const query = {
    where: {
      OR: [
        { nome: { contains: termo, mode: 'insensitive' } },
        { telefone: { contains: termo, mode: 'insensitive' } },
        { cpf: { contains: termo, mode: 'insensitive' } },
      ],
    },
    orderBy: { nome: 'asc' },
    take,
  };
  if (include) query.include = include;
  return prisma.cliente.findMany(query);
}

const telegramService = new TelegramService();
telegramService.__test = { TelegramService, moeda, dataBr, limitarTexto };

module.exports = telegramService;
