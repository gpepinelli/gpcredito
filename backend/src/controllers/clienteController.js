// src/controllers/clienteController.js

const { PrismaClient } = require('@prisma/client');
const { validationResult } = require('express-validator');
const scoreService = require('../services/scoreService');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

class ClienteController {
  async criar(req, res) {
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
      return res.status(400).json({ sucesso: false, erros: erros.array() });
    }

    try {
      const { nome, telefone } = req.body;

      const clienteExistente = await prisma.cliente.findUnique({ where: { telefone } });
      if (clienteExistente) {
        return res.status(409).json({ sucesso: false, mensagem: 'Telefone já cadastrado' });
      }

      const cliente = await prisma.cliente.create({ data: { nome, telefone } });
      logger.info('👤 Novo cliente criado', { clienteId: cliente.id, nome });

      return res.status(201).json({ sucesso: true, cliente });
    } catch (error) {
      logger.error('Erro ao criar cliente', { error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async listar(req, res) {
    try {
      const clientes = await prisma.cliente.findMany({
        include: {
          emprestimos: {
            where: { status: { in: ['pendente', 'atrasado'] } },
            select: { id: true, valorTotal: true, status: true, dataVencimento: true },
          },
        },
        orderBy: { criadoEm: 'desc' },
      });

      return res.json({ sucesso: true, clientes, total: clientes.length });
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
        },
      });

      if (!cliente) {
        return res.status(404).json({ sucesso: false, mensagem: 'Cliente não encontrado' });
      }

      const avaliacaoCredito = scoreService.avaliarCredito(cliente.score);
      return res.json({ sucesso: true, cliente, avaliacaoCredito });
    } catch (error) {
      logger.error('Erro ao buscar cliente', { error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async excluir(req, res) {
    try {
      const { id } = req.params;

      const cliente = await prisma.cliente.findUnique({
        where: { id },
        include: { emprestimos: { select: { id: true } } },
      });

      if (!cliente) {
        return res.status(404).json({ sucesso: false, mensagem: 'Cliente nao encontrado' });
      }

      const emprestimoIds = cliente.emprestimos.map(emprestimo => emprestimo.id);

      await prisma.$transaction([
        prisma.pagamento.deleteMany({ where: { emprestimoId: { in: emprestimoIds } } }),
        prisma.emprestimo.deleteMany({ where: { clienteId: id } }),
        prisma.historicoScore.deleteMany({ where: { clienteId: id } }),
        prisma.cliente.delete({ where: { id } }),
      ]);

      logger.warn('Cliente excluido', {
        clienteId: id,
        nome: cliente.nome,
        emprestimosRemovidos: emprestimoIds.length,
      });

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
