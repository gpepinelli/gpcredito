const configuracaoService = require('../services/configuracaoService');
const { senhaExclusaoValida } = require('../utils/auth');
const logger = require('../utils/logger');

class ConfiguracaoController {
  async listar(req, res) {
    try {
      const configuracoes = await configuracaoService.listar();
      return res.json({ sucesso: true, configuracoes });
    } catch (error) {
      logger.error('Erro ao listar configuracoes', { error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async atualizar(req, res) {
    try {
      const configuracao = await configuracaoService.atualizar(req.params.chave, req.body.valor);
      return res.json({ sucesso: true, configuracao });
    } catch (error) {
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    }
  }

  async resetar(req, res) {
    try {
      const configuracao = await configuracaoService.resetar(req.params.chave);
      return res.json({ sucesso: true, configuracao });
    } catch (error) {
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    }
  }

  async resetarTodos(req, res) {
    try {
      if (!senhaExclusaoValida(req.body?.senha)) {
        return res.status(403).json({ sucesso: false, mensagem: 'Senha de exclusao invalida' });
      }
      const configuracoes = await configuracaoService.resetarTodos();
      return res.json({ sucesso: true, configuracoes });
    } catch (error) {
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    }
  }
}

module.exports = new ConfiguracaoController();
