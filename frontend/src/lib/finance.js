import { STATUS_OPERACAO_ENCERRADA } from './constants.js';

export function calcularParcelas(valor, juros, totalParcelas, primeiroVencimento = null) {
  const principal = Number(valor || 0);
  const taxa = Number(juros || 0) / 100;
  const qtd = Math.max(1, Number(totalParcelas || 1));
  let saldo = principal;
  let amortizacaoDistribuida = 0;
  const amortizacaoBase = Number((principal / qtd).toFixed(2));
  const primeiraData = primeiroVencimento ? new Date(`${primeiroVencimento}T23:59:59`) : null;

  return Array.from({ length: qtd }, (_, index) => {
    const amortizacao = index === qtd - 1
      ? Number((principal - amortizacaoDistribuida).toFixed(2))
      : Math.min(amortizacaoBase, saldo);
    const valorJuros = Number((saldo * taxa).toFixed(2));
    const parcela = amortizacao + valorJuros;
    const vencimento = primeiraData ? new Date(primeiraData) : new Date();
    if (primeiraData) vencimento.setDate(primeiraData.getDate() + (index * 30));
    else vencimento.setDate(vencimento.getDate() + ((index + 1) * 30));
    saldo = Math.max(0, saldo - amortizacao);
    amortizacaoDistribuida = Number((amortizacaoDistribuida + amortizacao).toFixed(2));
    return {
      numero: index + 1,
      valor: Number(parcela.toFixed(2)),
      valorJuros,
      amortizacao,
      saldoAntes: Number((saldo + amortizacao).toFixed(2)),
      vencimento,
      saldoDepois: Number(saldo.toFixed(2)),
    };
  });
}

export function operacaoPendente(item = {}) {
  if (item.statusOperacao) return !STATUS_OPERACAO_ENCERRADA.includes(item.statusOperacao);
  return item.status !== 'pago';
}
