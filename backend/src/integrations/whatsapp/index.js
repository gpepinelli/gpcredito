// src/integrations/whatsapp/index.js
// Adaptador WhatsApp — suporta mensagens de texto e envio de documentos (PDF)

const logger = require('../../utils/logger');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const prisma = new PrismaClient();
const TERMOS_ACEITE = ['DE ACORDO', 'CONCORDO', 'SIM'];

function dadosPixManual() {
  const chave = process.env.PIX_CHAVE || process.env.MEU_PIX || '';
  const nome = process.env.PIX_NOME || process.env.PIX_TITULAR || 'Guilherme dos Santos Pepinelli';
  return { chave: chave.trim(), nome: nome.trim() };
}

function proximaParcelaCobravel(emprestimo) {
  if (!Array.isArray(emprestimo.parcelas)) return null;
  return emprestimo.parcelas
    .slice()
    .sort((a, b) => a.numero - b.numero)
    .find(p => p.status === 'atrasado' || p.status === 'pendente') || null;
}

function valorCobranca(emprestimo) {
  return proximaParcelaCobravel(emprestimo)?.valor || emprestimo.valorTotal;
}

function vencimentoCobranca(emprestimo) {
  return proximaParcelaCobravel(emprestimo)?.dataVencimento || emprestimo.dataVencimento;
}

const templates = {
  lembrete: (nome, valor, dataVencimento) =>
    `Olá *${nome}*! 👋\n\nPassando para lembrar que seu pagamento de *${valor}* vence amanhã (${dataVencimento}).\n\nPague em dia e garanta +10 pontos no seu score! 😊`,
  vencimentoHoje: (nome, valor) =>
    `Olá *${nome}*! ⚠️\n\nSeu pagamento de *${valor}* vence *hoje*.\n\nSegue o Pix para pagamento na próxima mensagem.`,
  pixManual: (valor, chave, nome) =>
    `Pix para pagamento: ${chave}\nFavorecido: ${nome}\nValor: ${valor}\n\nApós pagar, envie o comprovante por aqui para conferência.`,
  pixCopiaCola: (copiaCola) =>
    copiaCola,
  atraso: (nome, valor, diasAtraso) =>
    `Olá *${nome}*! 🚨\n\nSeu pagamento de *${valor}* está em atraso há *${diasAtraso} dia(s)*.\n\nRegularize sua situação o quanto antes. O Pix para pagamento vai na próxima mensagem.`,
  confirmacao: (nome, valor) =>
    `✅ *Pagamento confirmado!*\n\nOlá *${nome}*, recebemos seu pagamento de *${valor}*.\n\nObrigado pela confiança! 🎉`,
  renovacao: (nome) =>
    `Olá *${nome}*! 💰\n\nSeu empréstimo foi quitado com sucesso!\n\nDeseja *renovar seu crédito*? Responda SIM para receber uma nova proposta.`,
  pixGerado: (nome, valor, copiaCola) =>
    `Olá *${nome}*! 📲\n\nSeu empréstimo de *${valor}* foi aprovado!\n\nUse o Pix abaixo para confirmar:\n\n\`${copiaCola}\`\n\nCopie o código acima e cole no app do seu banco.`,
  contrato: (nome) =>
    `📄 *Contrato de Empréstimo*\n\nOlá *${nome}*, segue em anexo o seu contrato.\n\nSe estiver de acordo, responda *DE ACORDO* neste WhatsApp para registrar o aceite digital.`,
  contratoAviso: (nome) =>
    `Olá *${nome}*, estou enviando agora o contrato de empréstimo em PDF.\n\nApós ler, responda *DE ACORDO* para registrar o aceite digital.`,
};

function apenasDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function extrairTextoMensagem(message) {
  return message?.conversation
    || message?.extendedTextMessage?.text
    || message?.imageMessage?.caption
    || message?.documentMessage?.caption
    || '';
}

async function buscarOperacaoPendente(clienteId) {
  return prisma.emprestimo.findFirst({
    where: {
      clienteId,
      statusOperacao: 'AGUARDANDO_ACEITE',
    },
    include: {
      cliente: { select: { id: true, nome: true, telefone: true } },
      contratos: {
        where: { statusContrato: { in: ['GERADO', 'ENVIADO'] } },
        orderBy: { criadoEm: 'desc' },
        take: 1,
      },
    },
    orderBy: { dataEmprestimo: 'desc' },
  });
}

async function buscarOperacaoPendenteUnica() {
  const operacoes = await prisma.emprestimo.findMany({
    where: {
      statusOperacao: 'AGUARDANDO_ACEITE',
      contratos: {
        some: { statusContrato: { in: ['GERADO', 'ENVIADO'] } },
      },
    },
    include: {
      cliente: { select: { id: true, nome: true, telefone: true } },
      contratos: {
        where: { statusContrato: { in: ['GERADO', 'ENVIADO'] } },
        orderBy: { criadoEm: 'desc' },
        take: 1,
      },
    },
    orderBy: { dataEmprestimo: 'desc' },
    take: 2,
  });

  return operacoes.length === 1 ? operacoes[0] : null;
}

async function processarAceiteDigital(telefoneOrigem, texto) {
  const conteudo = String(texto || '').trim().toUpperCase();
  if (!TERMOS_ACEITE.includes(conteudo)) return;

  const origem = apenasDigitos(telefoneOrigem).replace(/^55/, '');
  const clientes = await prisma.cliente.findMany({ select: { id: true, nome: true, telefone: true } });
  const cliente = clientes.find(c => {
    const telefoneCliente = apenasDigitos(c.telefone).replace(/^55/, '');
    return telefoneCliente && (origem.endsWith(telefoneCliente) || telefoneCliente.endsWith(origem));
  });

  const operacao = cliente
    ? await buscarOperacaoPendente(cliente.id)
    : await buscarOperacaoPendenteUnica();

  if (!operacao || !operacao.contratos[0]) {
    const pendentes = await prisma.emprestimo.count({
      where: {
        statusOperacao: 'AGUARDANDO_ACEITE',
        contratos: { some: { statusContrato: { in: ['GERADO', 'ENVIADO'] } } },
      },
    });

    logger.warn('Aceite digital recebido, mas contrato pendente nao foi identificado com seguranca', {
      clienteId: cliente?.id,
      telefoneOrigem,
      pendentes,
    });
    return;
  }

  await prisma.$transaction([
    prisma.contratoOperacao.update({
      where: { id: operacao.contratos[0].id },
      data: { statusContrato: 'ACEITO', aceitoEm: new Date() },
    }),
    prisma.emprestimo.update({
      where: { id: operacao.id },
      data: { statusOperacao: 'APROVADO' },
    }),
  ]);

  logger.info('Contrato aceito digitalmente via WhatsApp', {
    clienteId: operacao.clienteId,
    clienteNome: operacao.cliente?.nome,
    emprestimoId: operacao.id,
    numeroOperacao: operacao.numeroOperacao,
    numeroContrato: operacao.contratos[0].numeroContrato,
    telefoneOrigem,
    termo: conteudo,
    identificadoPorTelefone: Boolean(cliente),
  });
}

class BaileysAdapter {
  constructor() { this.sock = null; this.connected = false; this.messageQueue = []; }

  async initialize() {
    try {
      const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } =
        await import('@whiskeysockets/baileys');
      const { state, saveCreds } = await useMultiFileAuthState(
        process.env.WHATSAPP_SESSION_PATH || './whatsapp-session'
      );
      this.sock = makeWASocket({ auth: state, printQRInTerminal: false, logger: pino({ level: 'silent' }) });
      this.sock.ev.on('creds.update', saveCreds);
      this.sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          logger.info('Escaneie o QR Code no WhatsApp para conectar.');
          qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') { this.connected = true; logger.info('✅ WhatsApp conectado!'); this._processQueue(); }
        else if (connection === 'close') {
          this.connected = false;
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          if (shouldReconnect) setTimeout(() => this.initialize(), 5000);
        }
      });
      this.sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages || []) {
          if (msg.key?.fromMe) continue;
          const telefoneOrigem = msg.key?.remoteJid || '';
          const texto = extrairTextoMensagem(msg.message);
          try {
            await processarAceiteDigital(telefoneOrigem, texto);
          } catch (error) {
            logger.error('Erro ao processar mensagem recebida no WhatsApp', { error: error.message, telefoneOrigem });
          }
        }
      });
    } catch (error) {
      logger.warn('⚠️  Falha ao iniciar Baileys', { error: error.message });
    }
  }

  _candidatosJid(telefone) {
    const n = telefone.replace(/\D/g, '');
    if (telefone.includes('@')) return telefone;
    const numero = n.startsWith('55') ? n : `55${n}`;
    const candidatos = new Set([numero]);

    // No Brasil, algumas contas ainda resolvem sem o nono digito.
    if (numero.length === 13 && numero.startsWith('55') && numero[4] === '9') {
      candidatos.add(`${numero.slice(0, 4)}${numero.slice(5)}`);
    }

    return [...candidatos].map(candidato => `${candidato}@s.whatsapp.net`);
  }

  async _resolverJid(telefone) {
    if (telefone.includes('@')) return telefone;
    const candidatos = this._candidatosJid(telefone);
    try {
      const resultados = await this.sock.onWhatsApp(...candidatos);
      const encontrado = resultados?.find(r => r.exists && r.jid);
      logger.info('Resolucao de WhatsApp', { telefone, candidatos, encontrado: encontrado?.jid || null });
      return encontrado?.jid || candidatos[0];
    } catch (error) {
      logger.warn('Nao foi possivel resolver numero no WhatsApp, usando JID padrao', { telefone, error: error.message });
      return candidatos[0];
    }
  }

  async sendMessage(telefone, mensagem) {
    if (!this.connected) { this.messageQueue.push({ type: 'text', telefone, mensagem }); return false; }
    const jid = await this._resolverJid(telefone);
    try {
      const resultado = await this.sock.sendMessage(jid, { text: mensagem });
      logger.info('Mensagem enviada via WhatsApp', { telefone, jid, messageId: resultado?.key?.id });
      return true;
    }
    catch (e) { logger.error('Erro WA texto', { e: e.message }); return false; }
  }

  async sendDocument(telefone, caminhoPdf, nomeArquivo, legenda) {
    if (!this.connected) { this.messageQueue.push({ type: 'document', telefone, caminhoPdf, nomeArquivo, legenda }); return false; }
    const jid = await this._resolverJid(telefone);
    try {
      const resultado = await this.sock.sendMessage(jid, { document: fs.readFileSync(caminhoPdf), fileName: nomeArquivo, mimetype: 'application/pdf', caption: legenda });
      logger.info('📄 PDF enviado via WhatsApp', { telefone, jid, nomeArquivo, messageId: resultado?.key?.id });
      return true;
    } catch (e) { logger.error('Erro WA PDF', { e: e.message }); return false; }
  }

  async _processQueue() {
    for (const item of this.messageQueue) {
      if (item.type === 'document')
        await this.sendDocument(item.telefone, item.caminhoPdf, item.nomeArquivo, item.legenda);
      else
        await this.sendMessage(item.telefone, item.mensagem);
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
    return this.adapter.sendMessage(cliente.telefone, templates.lembrete(cliente.nome, formatarMoeda(valorCobranca(emprestimo)), formatarData(vencimentoCobranca(emprestimo))));
  }

  async enviarCobrancaHoje(cliente, emprestimo) {
    const { formatarMoeda } = require('../../utils/calculadora');
    return this.adapter.sendMessage(cliente.telefone, templates.vencimentoHoje(cliente.nome, formatarMoeda(valorCobranca(emprestimo))));
  }

  /**
   * Mensagem 1 — avisa que o Pix está chegando
   */
  async enviarPixVencimento(cliente, emprestimo) {
    const { formatarMoeda } = require('../../utils/calculadora');
    return this.adapter.sendMessage(
      cliente.telefone,
      templates.vencimentoHoje(cliente.nome, formatarMoeda(valorCobranca(emprestimo)))
    );
  }

  /**
   * Mensagem 2 — somente o código copia e cola, para o cliente copiar direto
   */
  async enviarPixCopiaCola(cliente, emprestimo) {
    const { formatarMoeda } = require('../../utils/calculadora');
    const pix = dadosPixManual();
    if (pix.chave) {
      return this.adapter.sendMessage(
        cliente.telefone,
        templates.pixManual(formatarMoeda(valorCobranca(emprestimo)), pix.chave, pix.nome)
      );
    }

    return this.adapter.sendMessage(
      cliente.telefone,
      templates.pixCopiaCola(emprestimo.pixCopiaCola)
    );
  }

  async enviarPixManual(cliente, emprestimo) {
    const { formatarMoeda } = require('../../utils/calculadora');
    const pix = dadosPixManual();
    if (!pix.chave) {
      logger.warn('PIX_CHAVE nao configurada; Pix manual nao enviado', { clienteId: cliente.id, emprestimoId: emprestimo.id });
      return false;
    }

    return this.adapter.sendMessage(
      cliente.telefone,
      templates.pixManual(formatarMoeda(valorCobranca(emprestimo)), pix.chave, pix.nome)
    );
  }

  async enviarCobrancaAtraso(cliente, emprestimo, diasAtraso) {
    const { formatarMoeda } = require('../../utils/calculadora');
    return this.adapter.sendMessage(cliente.telefone, templates.atraso(cliente.nome, formatarMoeda(valorCobranca(emprestimo)), diasAtraso));
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
    await this.adapter.sendMessage(cliente.telefone, templates.contratoAviso(cliente.nome));
    await new Promise(r => setTimeout(r, 1200));
    return this.adapter.sendDocument(cliente.telefone, caminhoPdf, nomeArquivo, templates.contrato(cliente.nome));
  }
}

module.exports = new WhatsAppService();
