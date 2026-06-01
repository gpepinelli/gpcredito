const adminLogService = require('../services/adminLogService');
const emprestimoService = require('../services/emprestimoService');
const whatsapp = require('../integrations/whatsapp');

class AdminController {
  async logs(req, res) {
    try {
      const resultado = await adminLogService.listar(req.query);
      return res.json({ sucesso: true, ...resultado });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async whatsappStatus(req, res) {
    try {
      return res.json({ sucesso: true, status: whatsapp.status() });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async inadimplenciaAging(req, res) {
    try {
      const aging = await emprestimoService.inadimplenciaAging();
      return res.json({ sucesso: true, aging });
    } catch (error) {
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }
}

module.exports = new AdminController();
