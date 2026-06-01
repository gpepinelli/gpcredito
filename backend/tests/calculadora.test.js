const assert = require('node:assert/strict');
const test = require('node:test');

const { gerarParcelas, calcularValorTotal, validarCPF } = require('../src/utils/calculadora');

test('gera parcelas de credito com juros sobre saldo devedor', () => {
  const inicio = new Date('2026-05-18T12:00:00.000Z');
  const parcelas = gerarParcelas(1000, 30, 3, inicio);

  assert.deepEqual(parcelas.map((parcela) => parcela.valor), [633.33, 533.33, 433.34]);
  assert.deepEqual(parcelas.map((parcela) => parcela.valorJuros), [300, 200, 100]);
  assert.deepEqual(parcelas.map((parcela) => parcela.saldoDepois), [666.67, 333.34, 0]);
  assert.equal(calcularValorTotal(1000, 30, 3), 1600);
});

test('mantem arredondamento correto na ultima parcela', () => {
  const parcelas = gerarParcelas(1000, 10, 6, new Date('2026-05-18T12:00:00.000Z'));
  const amortizado = parcelas.reduce((acc, parcela) => Number((acc + parcela.amortizacao).toFixed(2)), 0);

  assert.equal(amortizado, 1000);
  assert.equal(parcelas.at(-1).saldoDepois, 0);
});

test('valida CPF sem exigir quando estiver vazio', () => {
  assert.equal(validarCPF(''), true);
  assert.equal(validarCPF('529.982.247-25'), true);
  assert.equal(validarCPF('111.111.111-11'), false);
});
