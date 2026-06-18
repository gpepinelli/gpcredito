const carteiraService = require('../services/carteiraService');

class CarteiraController {
  async resumo(req, res) {
    try {
      const carteira = await carteiraService.resumo();
      return res.json({ sucesso: true, carteira });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async movimentar(req, res) {
    try {
      const movimentacao = await carteiraService.movimentar(req.body);
      const carteira = await carteiraService.resumo();
      return res.status(201).json({ sucesso: true, movimentacao, carteira });
    } catch (error) {
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    }
  }

  async exportar(req, res) {
    try {
      const csv = await carteiraService.exportarCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="carteira.csv"');
      return res.send(csv);
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: error.message });
    }
  }

  async fluxoCaixa(req, res) {
    try {
      const fluxo = await carteiraService.fluxoCaixa(req.query);
      return res.json({ sucesso: true, fluxo });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: error.message });
    }
  }
}

module.exports = new CarteiraController();
