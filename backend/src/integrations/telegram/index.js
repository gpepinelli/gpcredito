const prisma = require('../../lib/prisma');
const logger = require('../../utils/logger');
const whatsapp = require('../whatsapp');
const carteiraService = require('../../services/carteiraService');
const emprestimoService = require('../../services/emprestimoService');

const INTERVALO_POLLING_MS = 5000;

function boolEnv(valor) {
  return ['true', '1', 'sim', 'yes', 'on'].includes(String(valor || '').trim().toLowerCase());
}

function moeda(valor) {
  return `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`;
}

function dataBr(data) {
  return new Date(data).toLocaleDateString('pt-BR');
}

class TelegramService {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
    this.ativo = boolEnv(process.env.TELEGRAM_ATIVO);
    this.offset = 0;
    this.intervalo = null;
    this.inicializado = false;
  }

  status() {
    return {
      enabled: this.ativo,
      configured: Boolean(this.token && this.chatId),
      polling: Boolean(this.intervalo),
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
    if (this.chatId) await this.sendMessage('GPCredito online. Use /status para verificar o sistema.');
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
      text,
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

    const comando = text.split(/\s+/)[0].toLowerCase();
    try {
      if (['/start', '/ajuda', '/help'].includes(comando)) return this.sendMessage(this.ajuda());
      if (comando === '/status') return this.sendMessage(await this.comandoStatus());
      if (comando === '/hoje') return this.sendMessage(await this.comandoHoje());
      if (comando === '/carteira') return this.sendMessage(await this.comandoCarteira());
      if (comando === '/atrasados') return this.sendMessage(await this.comandoAtrasados());
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
      '/status - servidor, banco, WhatsApp e carteira',
      '/hoje - vencimentos e atrasos do dia',
      '/carteira - saldo operacional',
      '/atrasados - primeiras operacoes em atraso',
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
      `Carteira: ${moeda(carteira.saldo)}`,
    ].join('\n');
  }

  async comandoHoje() {
    const alertas = await emprestimoService.alertasDoDia();
    return [
      'Agenda de hoje',
      '',
      `Vencendo hoje: ${alertas.vencendoHoje}`,
      `Vencendo amanha: ${alertas.vencendoAmanha}`,
      `Atrasados: ${alertas.atrasados}`,
    ].join('\n');
  }

  async comandoCarteira() {
    const carteira = await carteiraService.resumo();
    return [
      'Carteira operacional',
      '',
      `Capital inicial: ${moeda(carteira.capitalInicial)}`,
      `Entradas: ${moeda(carteira.entradas)}`,
      `Saidas: ${moeda(carteira.saidas)}`,
      `Saldo atual: ${moeda(carteira.saldo)}`,
    ].join('\n');
  }

  async comandoAtrasados() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const atrasados = await prisma.emprestimo.findMany({
      where: {
        OR: [
          { status: 'atrasado' },
          { statusOperacao: 'ATRASADO' },
          { dataVencimento: { lt: hoje } },
        ],
        statusOperacao: { notIn: ['QUITADO', 'CANCELADO', 'RECUSADO'] },
      },
      include: { cliente: true },
      orderBy: { dataVencimento: 'asc' },
      take: 10,
    });

    if (atrasados.length === 0) return 'Nenhuma operacao atrasada agora.';

    return [
      'Operacoes atrasadas',
      '',
      ...atrasados.map(item => `${item.numeroOperacao} - ${item.cliente?.nome || 'Cliente'} - ${moeda(item.valorTotal)} - venc. ${dataBr(item.dataVencimento)}`),
    ].join('\n');
  }
}

module.exports = new TelegramService();
