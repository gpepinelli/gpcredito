const test = require('node:test');
const assert = require('node:assert/strict');

const scoreService = require('../src/services/scoreService');
const loginRateLimitService = require('../src/services/loginRateLimitService');

test('scoreService determina tipo de score por atraso', () => {
  assert.equal(scoreService.determinarTipoScore(-1), 'PAGOU_ANTECIPADO');
  assert.equal(scoreService.determinarTipoScore(0), 'PAGOU_EM_DIA');
  assert.equal(scoreService.determinarTipoScore(3), 'ATRASO_ATE_3_DIAS');
  assert.equal(scoreService.determinarTipoScore(7), 'ATRASO_ATE_7_DIAS');
  assert.equal(scoreService.determinarTipoScore(8), 'ATRASO_MAIOR_7_DIAS');
});

test('loginRateLimit normaliza chave e identifica janela expirada', () => {
  assert.equal(loginRateLimitService.normalizarChave(''), 'desconhecido');
  assert.equal(loginRateLimitService.normalizarChave('x'.repeat(250)).length, 180);

  const agora = new Date('2026-06-19T12:00:00.000Z');
  const dentroJanela = { atualizadoEm: new Date(agora.getTime() - loginRateLimitService.JANELA_MS + 1000) };
  const foraJanela = { atualizadoEm: new Date(agora.getTime() - loginRateLimitService.JANELA_MS - 1000) };

  assert.equal(loginRateLimitService.expirouJanela(dentroJanela, agora), false);
  assert.equal(loginRateLimitService.expirouJanela(foraJanela, agora), true);
});
