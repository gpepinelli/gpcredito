const { validationResult } = require('express-validator');
const orcamentoService = require('../services/orcamentoService');
const logger = require('../utils/logger');

class OrcamentoController {
  async criar(req, res) {
    const erros = validationResult(req);
    if (!erros.isEmpty()) return res.status(400).json({ sucesso: false, erros: erros.array() });
    try {
      const resultado = await orcamentoService.criar(req.body);
      return res.status(201).json({ sucesso: true, ...resultado });
    } catch (error) {
      logger.error('Erro ao criar orcamento', { error: error.message });
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    }
  }

  async listar(req, res) {
    try {
      const orcamentos = await orcamentoService.listar();
      return res.json({ sucesso: true, orcamentos });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async buscar(req, res) {
    try {
      const resultado = await orcamentoService.buscar(req.params.id);
      return res.json({ sucesso: true, ...resultado });
    } catch (error) {
      return res.status(404).json({ sucesso: false, mensagem: error.message });
    }
  }

  async enviar(req, res) {
    try {
      const resultado = await orcamentoService.enviarWhatsApp(req.params.id);
      return res.json({ sucesso: true, ...resultado });
    } catch (error) {
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    }
  }

  async converter(req, res) {
    try {
      const orcamento = await orcamentoService.converter(req.params.id);
      return res.json({ sucesso: true, orcamento });
    } catch (error) {
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    }
  }
}

module.exports = new OrcamentoController();
