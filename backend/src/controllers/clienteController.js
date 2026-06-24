// src/controllers/clienteController.js

const prisma = require('../lib/prisma');
const { validationResult } = require('express-validator');
const scoreService = require('../services/scoreService');
const documentoService = require('../services/documentoService');
const contratoService = require('../services/contratoService');
const config = require('../services/configuracaoService');
const logger = require('../utils/logger');

class ClienteController {
  async criar(req, res) {
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
      return res.status(400).json({ sucesso: false, erros: erros.array() });
    }

    try {
      const { nome, telefone, cpf, endereco } = req.body;

      const clienteExistente = await prisma.cliente.findUnique({ where: { telefone } });
      if (clienteExistente) {
        return res.status(409).json({ sucesso: false, mensagem: 'Telefone já cadastrado' });
      }

      const cpfNormalizado = cpf ? String(cpf).replace(/\D/g, '') : null;
      if (cpfNormalizado) {
        const cpfExistente = await prisma.cliente.findUnique({ where: { cpf: cpfNormalizado } });
        if (cpfExistente) {
          return res.status(409).json({ sucesso: false, mensagem: 'CPF ja cadastrado' });
        }
      }

      const cliente = await prisma.cliente.create({
        data: {
          nome,
          telefone,
          cpf: cpfNormalizado,
          endereco: endereco ? String(endereco).trim() : null,
          score: await config.getConfigNumber('SCORE_INICIAL'),
        },
      });
      logger.info('👤 Novo cliente criado', { clienteId: cliente.id, nome });

      return res.status(201).json({ sucesso: true, cliente });
    } catch (error) {
      logger.error('Erro ao criar cliente', { error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async listar(req, res) {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
      const busca = String(req.query.busca || '').trim();
      const cpfBusca = busca.replace(/\D/g, '');
      const where = busca ? {
        OR: [
          { nome: { contains: busca, mode: 'insensitive' } },
          { telefone: { contains: busca, mode: 'insensitive' } },
          ...(cpfBusca ? [{ cpf: { contains: cpfBusca, mode: 'insensitive' } }] : []),
        ],
      } : {};

      const [total, clientes] = await Promise.all([
        prisma.cliente.count({ where }),
        prisma.cliente.findMany({
          where,
          include: {
            emprestimos: {
              where: { status: { in: ['pendente', 'atrasado'] } },
              select: { id: true, valorTotal: true, status: true, dataVencimento: true },
            },
          },
          orderBy: { criadoEm: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);

      return res.json({ sucesso: true, clientes, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
    } catch (error) {
      logger.error('Erro ao listar clientes', { error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async buscarPorId(req, res) {
    try {
      const { id } = req.params;
      const cliente = await prisma.cliente.findUnique({
        where: { id },
        include: {
          emprestimos: { include: { pagamentos: true } },
          historicoScore: { orderBy: { data: 'desc' }, take: 10 },
          documentos: { orderBy: { criadoEm: 'desc' } },
          contratos: { orderBy: { criadoEm: 'desc' } },
        },
      });

      if (!cliente) {
        return res.status(404).json({ sucesso: false, mensagem: 'Cliente não encontrado' });
      }

      const avaliacaoCredito = await scoreService.avaliarCredito(cliente.score);
      return res.json({ sucesso: true, cliente, avaliacaoCredito });
    } catch (error) {
      logger.error('Erro ao buscar cliente', { error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async uploadDocumento(req, res) {
    try {
      const { id } = req.params;
      const { tipoDocumento, observacao } = req.body;
      const documento = await documentoService.salvarDocumento(id, tipoDocumento, req.file, observacao);
      return res.status(201).json({ sucesso: true, documento });
    } catch (error) {
      logger.error('Erro ao enviar documento', { clienteId: req.params.id, error: error.message });
      const status = error.message.includes('invalido') || error.message.includes('obrigatorio') ? 400 : 500;
      return res.status(status).json({ sucesso: false, mensagem: error.message });
    }
  }

  async listarDocumentos(req, res) {
    try {
      const documentos = await documentoService.listar(req.params.id);
      return res.json({ sucesso: true, documentos, total: documentos.length });
    } catch (error) {
      logger.error('Erro ao listar documentos', { clienteId: req.params.id, error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async baixarDocumento(req, res) {
    try {
      const documento = await documentoService.buscar(req.params.id, req.params.documentoId);
      return res.download(documentoService.caminhoAbsoluto(documento), documento.nomeOriginal);
    } catch (error) {
      logger.error('Erro ao baixar documento', { clienteId: req.params.id, documentoId: req.params.documentoId, error: error.message });
      return res.status(error.message.includes('nao encontrado') ? 404 : 500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async excluirDocumento(req, res) {
    try {
      const documento = await documentoService.excluir(req.params.id, req.params.documentoId);
      return res.json({ sucesso: true, mensagem: 'Documento excluido com sucesso', documento });
    } catch (error) {
      logger.error('Erro ao excluir documento', { clienteId: req.params.id, documentoId: req.params.documentoId, error: error.message });
      return res.status(error.message.includes('nao encontrado') ? 404 : 500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async historico(req, res) {
    try {
      const { id } = req.params;
      const cliente = await prisma.cliente.findUnique({
        where: { id },
        include: {
          documentos: { orderBy: { criadoEm: 'desc' } },
          contratos: { orderBy: { criadoEm: 'desc' } },
          emprestimos: {
            include: {
              parcelas: { orderBy: { numero: 'asc' } },
              pagamentos: { orderBy: { dataPagamento: 'desc' } },
              contratos: { orderBy: { criadoEm: 'desc' } },
              promessasPagamento: { orderBy: { dataPrometida: 'desc' } },
            },
            orderBy: { dataEmprestimo: 'desc' },
          },
          historicoScore: { orderBy: { data: 'desc' }, take: 20 },
        },
      });

      if (!cliente) {
        return res.status(404).json({ sucesso: false, mensagem: 'Cliente não encontrado' });
      }

      const abertos = new Set(['AGUARDANDO_ACEITE', 'APROVADO', 'LIBERADO', 'EM_DIA', 'ATRASADO']);
      const finalizados = new Set(['QUITADO', 'CANCELADO', 'RECUSADO']);
      const operacoesEmAberto = cliente.emprestimos.filter(e => abertos.has(e.statusOperacao));
      const operacoesQuitadas = cliente.emprestimos.filter(e => e.statusOperacao === 'QUITADO');
      const operacoesCanceladas = cliente.emprestimos.filter(e => e.statusOperacao === 'CANCELADO');
      const parcelas = cliente.emprestimos.flatMap(e => e.parcelas.map(p => ({ ...p, numeroOperacao: e.numeroOperacao })));
      const pagamentos = cliente.emprestimos.flatMap(e => e.pagamentos.map(p => ({ ...p, numeroOperacao: e.numeroOperacao })));
      const promessas = cliente.emprestimos.flatMap(e => e.promessasPagamento.map(p => ({ ...p, numeroOperacao: e.numeroOperacao })));
      const totalTomado = cliente.emprestimos.reduce((acc, e) => acc + Number(e.valor || 0), 0);
      const totalContratado = cliente.emprestimos.reduce((acc, e) => acc + Number(e.valorTotal || 0), 0);
      const totalPago = pagamentos.reduce((acc, p) => acc + Number(p.valorPago || 0), 0);
      const saldoDevedor = parcelas.filter(p => p.status !== 'pago').reduce((acc, p) => acc + Number(p.valor || 0), 0);
      const lucroGerado = Math.max(0, totalContratado - totalTomado);
      const lucroRecebido = Math.max(0, totalPago - Math.min(totalPago, totalTomado));

      return res.json({
        sucesso: true,
        cliente,
        resumo: {
          totalDocumentos: cliente.documentos.length,
          totalContratos: cliente.contratos.length,
          operacoesEmAberto: operacoesEmAberto.length,
          operacoesQuitadas: operacoesQuitadas.length,
          operacoesCanceladas: operacoesCanceladas.length,
          parcelasPagas: parcelas.filter(p => p.status === 'pago').length,
          parcelasEmAberto: parcelas.filter(p => p.status === 'pendente').length,
          parcelasAtrasadas: parcelas.filter(p => p.status === 'atrasado').length,
          totalTomado,
          totalContratado,
          totalPago,
          saldoDevedor,
          lucroGerado,
          lucroRecebido,
        },
        documentos: cliente.documentos,
        contratos: cliente.contratos,
        operacoes: {
          emAberto: operacoesEmAberto,
          quitadas: operacoesQuitadas,
          canceladas: operacoesCanceladas,
          finalizadas: cliente.emprestimos.filter(e => finalizados.has(e.statusOperacao)),
          todas: cliente.emprestimos,
        },
        parcelas,
        pagamentos,
        promessas,
      });
    } catch (error) {
      logger.error('Erro ao carregar historico do cliente', { clienteId: req.params.id, error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async excluir(req, res) {
    try {
      const { id } = req.params;

      const cliente = await prisma.cliente.findUnique({
        where: { id },
        include: {
          documentos: true,
          contratos: true,
          emprestimos: { select: { id: true } },
        },
      });

      if (!cliente) {
        return res.status(404).json({ sucesso: false, mensagem: 'Cliente nao encontrado' });
      }

      const emprestimoIds = cliente.emprestimos.map(emprestimo => emprestimo.id);

      await prisma.$transaction([
        prisma.promessaPagamento.deleteMany({ where: { clienteId: id } }),
        prisma.pixCobranca.deleteMany({ where: { emprestimoId: { in: emprestimoIds } } }),
        prisma.pagamento.deleteMany({ where: { emprestimoId: { in: emprestimoIds } } }),
        prisma.contratoOperacao.deleteMany({ where: { clienteId: id } }),
        prisma.documentoCliente.deleteMany({ where: { clienteId: id } }),
        prisma.vendaProduto.deleteMany({ where: { clienteId: id } }),
        prisma.parcela.deleteMany({ where: { emprestimoId: { in: emprestimoIds } } }),
        prisma.emprestimo.deleteMany({ where: { clienteId: id } }),
        prisma.historicoScore.deleteMany({ where: { clienteId: id } }),
        prisma.cliente.delete({ where: { id } }),
      ]);

      logger.warn('Cliente excluido', {
        clienteId: id,
        nome: cliente.nome,
        emprestimosRemovidos: emprestimoIds.length,
      });

      for (const documento of cliente.documentos) {
        documentoService.removerArquivoFisico(documento.caminhoArquivo);
      }

      for (const contrato of cliente.contratos) {
        await contratoService.removerContrato(contrato.caminhoArquivo);
      }

      return res.json({
        sucesso: true,
        mensagem: 'Cliente excluido com sucesso',
        cliente,
      });
    } catch (error) {
      logger.error('Erro ao excluir cliente', { error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }
}

module.exports = new ClienteController();
