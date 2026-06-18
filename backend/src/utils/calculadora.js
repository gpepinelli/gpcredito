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
function arredondar(valor) {
  return parseFloat(Number(valor || 0).toFixed(2));
}

function gerarParcelas(valorPrincipal, juros, totalParcelas, dataInicio = new Date(), intervaloDias = 30) {
  const total = Math.max(1, Math.ceil(Number(totalParcelas) || 1));
  const principal = arredondar(valorPrincipal);
  const percentual = (Number(juros) || 0) / 100;
  const amortizacaoBase = arredondar(principal / total);
  let saldoDevedor = principal;
  let amortizacaoDistribuida = 0;
  const parcelasSac = [];

  for (let i = 0; i < total; i += 1) {
    const venc = new Date(dataInicio);
    venc.setDate(venc.getDate() + Number(intervaloDias || 30) * (i + 1));
    venc.setHours(23, 59, 59, 0);
    const saldoAntes = arredondar(saldoDevedor);
    const amortizacao = i === total - 1
      ? arredondar(principal - amortizacaoDistribuida)
      : Math.min(amortizacaoBase, saldoAntes);
    const valorJuros = arredondar(saldoAntes * percentual);
    const valor = arredondar(amortizacao + valorJuros);
    const saldoDepois = arredondar(saldoAntes - amortizacao);
    saldoDevedor = saldoDepois;
    amortizacaoDistribuida = arredondar(amortizacaoDistribuida + amortizacao);

    parcelasSac.push({
      numero: i + 1,
      amortizacao,
      valorJuros,
      valor,
      saldoAntes,
      saldoDepois,
      dataVencimento: venc,
      status: 'pendente',
    });
  }

  if (total === 1) return parcelasSac;

  const totalCalculado = arredondar(parcelasSac.reduce((acc, parcela) => acc + parcela.valor, 0));
  const parcelaFixaBase = arredondar(totalCalculado / total);
  let valorDistribuido = 0;

  return parcelasSac.map((parcela, index) => {
    const valor = index === total - 1
      ? arredondar(totalCalculado - valorDistribuido)
      : parcelaFixaBase;
    valorDistribuido = arredondar(valorDistribuido + valor);
    return { ...parcela, valor };
  });
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarData(data) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(data));
}

function validarCPF(cpf = '') {
  const limpo = String(cpf).replace(/\D/g, '');
  if (!limpo) return true;
  if (limpo.length !== 11 || /^(\d)\1{10}$/.test(limpo)) return false;

  const calcularDigito = (base) => {
    const soma = base
      .split('')
      .reduce((acc, digito, index) => acc + Number(digito) * (base.length + 1 - index), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const primeiro = calcularDigito(limpo.slice(0, 9));
  const segundo = calcularDigito(limpo.slice(0, 10));
  return primeiro === Number(limpo[9]) && segundo === Number(limpo[10]);
}

module.exports = {
  calcularValorTotal,
  calcularDataVencimento,
  calcularDiasAtraso,
  formatarData,
  formatarMoeda,
  gerarParcelas,
  validarCPF,
};
