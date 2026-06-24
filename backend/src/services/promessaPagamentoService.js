const prisma = require('../lib/prisma');
const adminLogService = require('./adminLogService');

class PromessaPagamentoService {
  async criar(emprestimoId, { valor, dataPrometida, observacao }) {
    const emprestimo = await prisma.emprestimo.findUnique({ where: { id: emprestimoId }, include: { cliente: true } });
    if (!emprestimo) throw new Error('Emprestimo nao encontrado');
    const valorNumerico = Number(valor || 0);
    if (valorNumerico <= 0) throw new Error('Valor prometido invalido');
    if (!dataPrometida) throw new Error('Data prometida e obrigatoria');

    const promessa = await prisma.promessaPagamento.create({
      data: {
        clienteId: emprestimo.clienteId,
        emprestimoId,
        valor: valorNumerico,
        dataPrometida: new Date(`${dataPrometida}T23:59:59`),
        observacao: observacao || null,
      },
      include: { emprestimo: { select: { numeroOperacao: true } }, cliente: { select: { nome: true } } },
    });
    await adminLogService.registrar('PROMESSA_PAGAMENTO_CRIADA', 'Promessa de pagamento registrada', {
      promessaId: promessa.id,
      emprestimoId,
      clienteId: emprestimo.clienteId,
      valor: valorNumerico,
      dataPrometida,
    });
    return promessa;
  }

  async atualizar(id, { status, observacao }) {
    const statusNormalizado = String(status || '').toUpperCase();
    if (!['PENDENTE', 'CUMPRIDA', 'NAO_CUMPRIDA', 'CANCELADA'].includes(statusNormalizado)) {
      throw new Error('Status de promessa invalido');
    }
    const promessa = await prisma.promessaPagamento.update({
      where: { id },
      data: {
        status: statusNormalizado,
        ...(observacao !== undefined ? { observacao: observacao || null } : {}),
      },
      include: { emprestimo: { select: { numeroOperacao: true } }, cliente: { select: { nome: true } } },
    });
    await adminLogService.registrar('PROMESSA_PAGAMENTO_ATUALIZADA', 'Promessa de pagamento atualizada', {
      promessaId: id,
      status: statusNormalizado,
    });
    return promessa;
  }
}

module.exports = new PromessaPagamentoService();
