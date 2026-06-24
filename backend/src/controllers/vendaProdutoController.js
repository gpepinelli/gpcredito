const { validationResult } = require('express-validator');
const vendaProdutoService = require('../services/vendaProdutoService');
const logger = require('../utils/logger');

function responderErro(res, error) {
  const mensagem = error.message || 'Erro interno do servidor';
  const status = mensagem.includes('nao encontrado')
    ? 404
    : mensagem.includes('invalido') || mensagem.includes('disponivel') || mensagem.includes('possui venda')
      ? 400
      : 500;
  return res.status(status).json({ sucesso: false, mensagem });
}

class VendaProdutoController {
  async criarProduto(req, res) {
    const erros = validationResult(req);
    if (!erros.isEmpty()) return res.status(400).json({ sucesso: false, erros: erros.array() });
    try {
      const produto = await vendaProdutoService.criarProduto(req.body);
      return res.status(201).json({ sucesso: true, produto });
    } catch (error) {
      logger.error('Erro ao criar produto de venda', { error: error.message });
      return responderErro(res, error);
    }
  }

  async listarProdutos(req, res) {
    try {
      const produtos = await vendaProdutoService.listarProdutos(req.query);
      return res.json({ sucesso: true, produtos, total: produtos.length });
    } catch (error) {
      return responderErro(res, error);
    }
  }

  async atualizarProduto(req, res) {
    try {
      const produto = await vendaProdutoService.atualizarProduto(req.params.id, req.body);
      return res.json({ sucesso: true, produto });
    } catch (error) {
      return responderErro(res, error);
    }
  }

  async excluirProduto(req, res) {
    try {
      const produto = await vendaProdutoService.excluirProduto(req.params.id);
      return res.json({ sucesso: true, produto });
    } catch (error) {
      logger.error('Erro ao excluir produto de venda', { produtoId: req.params.id, error: error.message });
      return responderErro(res, error);
    }
  }

  async registrarVenda(req, res) {
    const erros = validationResult(req);
    if (!erros.isEmpty()) return res.status(400).json({ sucesso: false, erros: erros.array() });
    try {
      const venda = await vendaProdutoService.registrarVenda(req.body);
      return res.status(201).json({ sucesso: true, venda });
    } catch (error) {
      logger.error('Erro ao registrar venda de produto', { error: error.message });
      return responderErro(res, error);
    }
  }

  async listarVendas(req, res) {
    try {
      const vendas = await vendaProdutoService.listarVendas(req.query);
      return res.json({ sucesso: true, vendas, total: vendas.length });
    } catch (error) {
      return responderErro(res, error);
    }
  }

  async cancelarVenda(req, res) {
    try {
      const venda = await vendaProdutoService.cancelarVenda(req.params.id);
      return res.json({ sucesso: true, venda });
    } catch (error) {
      return responderErro(res, error);
    }
  }

  async resumo(req, res) {
    try {
      const resumo = await vendaProdutoService.resumo();
      return res.json({ sucesso: true, resumo });
    } catch (error) {
      return responderErro(res, error);
    }
  }
}

module.exports = new VendaProdutoController();
