// src/utils/calculadora.js

function calcularValorTotal(valor, juros, meses = 1) {
  return gerarParcelas(valor, juros, meses).reduce((acc, p) => parseFloat((acc + p.valor).toFixed(2)), 0);
}

function calcularDataVencimento(diasParaVencer = 30) {
  const data = new Date();
  data.setDate(data.getDate() + diasParaVencer);
  data.setHours(23, 59, 59, 0);
  return data;
}

function calcularDiasAtraso(dataVencimento) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const venc = new Date(dataVencimento); venc.setHours(0,0,0,0);
  return Math.floor((hoje - venc) / (1000 * 60 * 60 * 24));
}

/**
 * Gera array de parcelas para um empréstimo parcelado.
 * Usa juros mensal sobre saldo devedor.
 * Intervalo fixo de 30 dias entre parcelas.
 */
function gerarParcelas(valorPrincipal, juros, totalParcelas, dataInicio = new Date()) {
  const total = Math.max(1, Math.ceil(Number(totalParcelas) || 1));
  const percentual = (Number(juros) || 0) / 100;
  const amortizacaoBase = parseFloat((valorPrincipal / total).toFixed(2));
  let saldoDevedor = parseFloat(Number(valorPrincipal).toFixed(2));

  return Array.from({ length: total }, (_, i) => {
    const venc = new Date(dataInicio);
    venc.setDate(venc.getDate() + 30 * (i + 1));
    venc.setHours(23, 59, 59, 0);
    const saldoAntes = parseFloat(saldoDevedor.toFixed(2));
    const amortizacao = i === total - 1
      ? saldoAntes
      : Math.min(amortizacaoBase, saldoAntes);
    const valorJuros = parseFloat((saldoAntes * percentual).toFixed(2));
    const valor = parseFloat((amortizacao + valorJuros).toFixed(2));
    const saldoDepois = parseFloat((saldoAntes - amortizacao).toFixed(2));
    saldoDevedor = saldoDepois;

    return {
      numero: i + 1,
      amortizacao,
      valorJuros,
      valor,
      saldoAntes,
      saldoDepois,
      dataVencimento: venc,
      status: 'pendente',
    };
  });
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarData(data) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(data));
}

module.exports = { calcularValorTotal, calcularDataVencimento, calcularDiasAtraso, gerarParcelas, formatarMoeda, formatarData };
