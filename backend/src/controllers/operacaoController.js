const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

class OperacaoController {
  async buscarPorNumero(req, res) {
    try {
      const { numeroOperacao } = req.params;
      const operacao = await prisma.emprestimo.findUnique({
        where: { numeroOperacao },
        include: {
          cliente: true,
          parcelas: { orderBy: { numero: 'asc' } },
          pagamentos: { orderBy: { dataPagamento: 'desc' } },
          contratos: { orderBy: { criadoEm: 'desc' } },
        },
      });

      if (!operacao) {
        return res.status(404).json({ sucesso: false, mensagem: 'Operacao nao encontrada' });
      }

      return res.json({ sucesso: true, operacao });
    } catch (error) {
      logger.error('Erro ao buscar operacao', { error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }

  async aceitarContrato(req, res) {
    try {
      const { numeroOperacao } = req.params;
      const contrato = await prisma.contratoOperacao.findFirst({
        where: { numeroOperacao },
        orderBy: { criadoEm: 'desc' },
      });

      if (!contrato) {
        return res.status(404).json({ sucesso: false, mensagem: 'Contrato da operacao nao encontrado' });
      }

      const atualizado = await prisma.contratoOperacao.update({
        where: { id: contrato.id },
        data: {
          statusContrato: 'ACEITO',
          aceitoEm: new Date(),
        },
      });

      await prisma.emprestimo.update({
        where: { numeroOperacao },
        data: { statusOperacao: 'APROVADO' },
      });

      logger.info('Contrato aceito', {
        numeroOperacao,
        numeroContrato: atualizado.numeroContrato,
        clienteId: atualizado.clienteId,
        contratoId: atualizado.id,
      });

      return res.json({ sucesso: true, contrato: atualizado });
    } catch (error) {
      logger.error('Erro ao aceitar contrato', { numeroOperacao: req.params.numeroOperacao, error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }
}

module.exports = new OperacaoController();
