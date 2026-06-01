// src/controllers/emprestimoController.js

const { validationResult } = require('express-validator');
const emprestimoService = require('../services/emprestimoService');
const logger = require('../utils/logger');

class EmprestimoController {
  async criar(req, res) {
    const erros = validationResult(req);
    if (!erros.isEmpty()) return res.status(400).json({ sucesso: false, erros: erros.array() });
    try {
      const { clienteId, valor, juros, diasParaVencer, totalParcelas } = req.body;
      const resultado = await emprestimoService.criar({ clienteId, valor, juros, diasParaVencer, totalParcelas: totalParcelas || 1 });
      return res.status(201).json({ sucesso: true, ...resultado });
    } catch (error) {
      logger.error('Erro ao criar empréstimo', { error: error.message });
      const status = error.message.includes('bloqueado') || error.message.includes('ativo') ? 400 : 500;
      return res.status(status).json({ sucesso: false, mensagem: error.message });
    }
  }

  async listar(req, res) {
    try {
      const resultado = await emprestimoService.listar(req.query);
      return res.json({ sucesso: true, ...resultado });
    } catch (error) {
      logger.error('Erro ao listar empréstimos', { error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async listarInadimplentes(req, res) {
    try {
      const inadimplentes = await emprestimoService.listarInadimplentes();
      return res.json({ sucesso: true, inadimplentes, total: inadimplentes.length });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async excluir(req, res) {
    try {
      const emprestimo = await emprestimoService.excluir(req.params.id);
      return res.json({ sucesso: true, mensagem: 'Emprestimo excluido com sucesso', emprestimo });
    } catch (error) {
      return res.status(error.message.includes('nao encontrado') ? 404 : 500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async lucroTotal(req, res) {
    try {
      const lucro = await emprestimoService.calcularLucroTotal();
      return res.json({ sucesso: true, ...lucro });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async metricasMensais(req, res) {
    try {
      const metricas = await emprestimoService.metricasMensais();
      return res.json({ sucesso: true, metricas });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async exportarDados(req, res) {
    try {
      const dados = await emprestimoService.dadosParaExport();
      return res.json({ sucesso: true, ...dados });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async alertas(req, res) {
    try {
      const alertas = await emprestimoService.alertasDoDia();
      return res.json({ sucesso: true, alertas });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async aceitarManual(req, res) {
    try {
      const emprestimo = await emprestimoService.aceitarManual(req.params.id);
      return res.json({ sucesso: true, emprestimo });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async liberarDinheiro(req, res) {
    try {
      const emprestimo = await emprestimoService.liberarDinheiro(req.params.id);
      return res.json({ sucesso: true, emprestimo });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async reenviarContrato(req, res) {
    try {
      const resultado = await emprestimoService.reenviarContrato(req.params.id);
      return res.json({ sucesso: true, ...resultado });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async reenviarPix(req, res) {
    try {
      const resultado = await emprestimoService.reenviarPix(req.params.id);
      return res.json({ sucesso: true, ...resultado });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async atualizarObservacao(req, res) {
    try {
      const emprestimo = await emprestimoService.atualizarObservacao(req.params.id, req.body.observacao);
      return res.json({ sucesso: true, emprestimo });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async renegociarPrazo(req, res) {
    try {
      const emprestimo = await emprestimoService.renegociarPrazo(req.params.id, req.body.dataVencimento, req.body.observacao);
      return res.json({ sucesso: true, emprestimo });
    } catch (error) {
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    }
  }

  async cobrancaLote(req, res) {
    try {
      const resultado = await emprestimoService.enviarCobrancaLote(req.body.ids || []);
      return res.json({ sucesso: true, ...resultado });
    } catch (error) {
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    }
  }

  async confirmarPagamentoManual(req, res) {
    try {
      const { id } = req.params;
      const { valorPago } = req.body;
      if (!valorPago || valorPago <= 0) return res.status(400).json({ sucesso: false, mensagem: 'Valor pago inválido' });
      const pagamento = await emprestimoService.confirmarPagamento(id, valorPago);
      return res.json({ sucesso: true, pagamento });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async confirmarPagamentoParcela(req, res) {
    try {
      const { id, parcelaId } = req.params;
      const pagamento = await emprestimoService.confirmarPagamentoParcela(id, parcelaId);
      return res.json({ sucesso: true, pagamento });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: error.message });
    }
  }
}

module.exports = new EmprestimoController();
