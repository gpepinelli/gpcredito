const promessaPagamentoService = require('../services/promessaPagamentoService');

class PromessaPagamentoController {
  async criar(req, res) {
    try {
      const promessa = await promessaPagamentoService.criar(req.params.id, req.body);
      return res.status(201).json({ sucesso: true, promessa });
    } catch (error) {
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    }
  }

  async atualizar(req, res) {
    try {
      const promessa = await promessaPagamentoService.atualizar(req.params.id, req.body);
      return res.json({ sucesso: true, promessa });
    } catch (error) {
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    }
  }
}

module.exports = new PromessaPagamentoController();
