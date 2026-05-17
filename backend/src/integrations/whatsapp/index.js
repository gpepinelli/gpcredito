// src/integrations/whatsapp/index.js
// Adaptador WhatsApp — suporta mensagens de texto e envio de documentos (PDF)

const logger = require('../../utils/logger');
const fs = require('fs');

const templates = {
  lembrete: (nome, valor, dataVencimento) =>
    `Olá *${nome}*! 👋\n\nPassando para lembrar que seu pagamento de *R$ ${valor}* vence amanhã (${dataVencimento}).\n\nPague em dia e garanta +10 pontos no seu score! 😊`,
  vencimentoHoje: (nome, valor) =>
    `Olá *${nome}*! ⚠️\n\nSeu pagamento de *R$ ${valor}* vence *hoje*.\n\nGerei um Pix para você — o código chega na próxima mensagem, é só copiar e colar no seu banco. 👇`,
  pixCopiaCola: (copiaCola) =>
    copiaCola,
  atraso: (nome, valor, diasAtraso) =>
    `Olá *${nome}*! 🚨\n\nSeu pagamento de *R$ ${valor}* está em atraso há *${diasAtraso} dia(s)*.\n\nRegularize sua situação o quanto antes para evitar restrições em seu cadastro.`,
  confirmacao: (nome, valor) =>
    `✅ *Pagamento confirmado!*\n\nOlá *${nome}*, recebemos seu pagamento de *R$ ${valor}*.\n\nObrigado pela confiança! 🎉`,
  renovacao: (nome) =>
    `Olá *${nome}*! 💰\n\nSeu empréstimo foi quitado com sucesso!\n\nDeseja *renovar seu crédito*? Responda SIM para receber uma nova proposta.`,
  pixGerado: (nome, valor, copiaCola) =>
    `Olá *${nome}*! 📲\n\nSeu empréstimo de *R$ ${valor}* foi aprovado!\n\nUse o Pix abaixo para confirmar:\n\n\`${copiaCola}\`\n\nCopie o código acima e cole no app do seu banco.`,
  contrato: (nome) =>
    `📄 *Contrato de Empréstimo*\n\nOlá *${nome}*, segue em anexo o seu contrato. Guarde para sua referência.`,
};

class BaileysAdapter {
  constructor() { this.sock = null; this.connected = false; this.messageQueue = []; }

  async initialize() {
    try {
      const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } =
        await import('@whiskeysockets/baileys');
      const { state, saveCreds } = await useMultiFileAuthState(
        process.env.WHATSAPP_SESSION_PATH || './whatsapp-session'
      );
      this.sock = makeWASocket({ auth: state, printQRInTerminal: true, logger: { level: 'silent' } });
      this.sock.ev.on('creds.update', saveCreds);
      this.sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'open') { this.connected = true; logger.info('✅ WhatsApp conectado!'); this._processQueue(); }
        else if (connection === 'close') {
          this.connected = false;
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          if (shouldReconnect) setTimeout(() => this.initialize(), 5000);
        }
      });
    } catch (error) {
      logger.warn('⚠️  Baileys não instalado. Execute: npm install @whiskeysockets/baileys');
    }
  }

  _jid(telefone) {
    const n = telefone.replace(/\D/g, '');
    return n.includes('@') ? n : `55${n}@s.whatsapp.net`;
  }

  async sendMessage(telefone, mensagem) {
    const jid = this._jid(telefone);
    if (!this.connected) { this.messageQueue.push({ type: 'text', jid, mensagem }); return false; }
    try { await this.sock.sendMessage(jid, { text: mensagem }); return true; }
    catch (e) { logger.error('Erro WA texto', { e: e.message }); return false; }
  }

  async sendDocument(telefone, caminhoPdf, nomeArquivo, legenda) {
    const jid = this._jid(telefone);
    if (!this.connected) { this.messageQueue.push({ type: 'document', jid, caminhoPdf, nomeArquivo, legenda }); return false; }
    try {
      await this.sock.sendMessage(jid, { document: fs.readFileSync(caminhoPdf), fileName: nomeArquivo, mimetype: 'application/pdf', caption: legenda });
      logger.info('📄 PDF enviado via WhatsApp', { telefone, nomeArquivo });
      return true;
    } catch (e) { logger.error('Erro WA PDF', { e: e.message }); return false; }
  }

  async _processQueue() {
    for (const item of this.messageQueue) {
      if (item.type === 'document')
        await this.sock.sendMessage(item.jid, { document: fs.readFileSync(item.caminhoPdf), fileName: item.nomeArquivo, mimetype: 'application/pdf', caption: item.legenda });
      else
        await this.sock.sendMessage(item.jid, { text: item.mensagem });
      await new Promise(r => setTimeout(r, 1000));
    }
    this.messageQueue = [];
  }
}

class MockAdapter {
  async initialize() { logger.info('📱 WhatsApp SIMULADO ativo.'); }

  async sendMessage(telefone, mensagem) {
    logger.info('📱 [SIMULADO] Mensagem WhatsApp', { telefone });
    console.log(`\n${'═'.repeat(55)}\n📲  WHATSAPP → ${telefone}\n${'═'.repeat(55)}\n${mensagem}\n${'═'.repeat(55)}\n`);
    return true;
  }

  async sendDocument(telefone, caminhoPdf, nomeArquivo, legenda) {
    logger.info('📄 [SIMULADO] PDF WhatsApp', { telefone, nomeArquivo, caminhoPdf });
    console.log(`\n${'═'.repeat(55)}\n📄  WHATSAPP PDF → ${telefone}\n    Arquivo: ${nomeArquivo}\n    Legenda: ${legenda}\n${'═'.repeat(55)}\n`);
    return true;
  }
}

class WhatsAppService {
  constructor() {
    const adapter = process.env.WHATSAPP_ADAPTER || 'mock';
    this.adapter = adapter === 'baileys' ? new BaileysAdapter() : new MockAdapter();
    this.templates = templates;
  }

  async initialize() { return this.adapter.initialize(); }

  async enviarLembrete(cliente, emprestimo) {
    const { formatarMoeda, formatarData } = require('../../utils/calculadora');
    return this.adapter.sendMessage(cliente.telefone, templates.lembrete(cliente.nome, formatarMoeda(emprestimo.valorTotal), formatarData(emprestimo.dataVencimento)));
  }

  async enviarCobrancaHoje(cliente, emprestimo) {
    const { formatarMoeda } = require('../../utils/calculadora');
    return this.adapter.sendMessage(cliente.telefone, templates.vencimentoHoje(cliente.nome, formatarMoeda(emprestimo.valorTotal)));
  }

  /**
   * Mensagem 1 — avisa que o Pix está chegando
   */
  async enviarPixVencimento(cliente, emprestimo) {
    const { formatarMoeda } = require('../../utils/calculadora');
    return this.adapter.sendMessage(
      cliente.telefone,
      templates.vencimentoHoje(cliente.nome, formatarMoeda(emprestimo.valorTotal))
    );
  }

  /**
   * Mensagem 2 — somente o código copia e cola, para o cliente copiar direto
   */
  async enviarPixCopiaCola(cliente, emprestimo) {
    return this.adapter.sendMessage(
      cliente.telefone,
      templates.pixCopiaCola(emprestimo.pixCopiaCola)
    );
  }

  async enviarCobrancaAtraso(cliente, emprestimo, diasAtraso) {
    const { formatarMoeda } = require('../../utils/calculadora');
    return this.adapter.sendMessage(cliente.telefone, templates.atraso(cliente.nome, formatarMoeda(emprestimo.valorTotal), diasAtraso));
  }

  async enviarConfirmacao(cliente, pagamento) {
    const { formatarMoeda } = require('../../utils/calculadora');
    return this.adapter.sendMessage(cliente.telefone, templates.confirmacao(cliente.nome, formatarMoeda(pagamento.valorPago)));
  }

  async enviarRenovacao(cliente) {
    return this.adapter.sendMessage(cliente.telefone, templates.renovacao(cliente.nome));
  }

  async enviarPixGerado(cliente, emprestimo) {
    const { formatarMoeda } = require('../../utils/calculadora');
    return this.adapter.sendMessage(cliente.telefone, templates.pixGerado(cliente.nome, formatarMoeda(emprestimo.valorTotal), emprestimo.pixCopiaCola));
  }

  async enviarContrato(cliente, caminhoPdf) {
    const nomeArquivo = `Contrato_Emprestimo_${cliente.nome.replace(/\s+/g, '_')}.pdf`;
    return this.adapter.sendDocument(cliente.telefone, caminhoPdf, nomeArquivo, templates.contrato(cliente.nome));
  }
}

module.exports = new WhatsAppService();
