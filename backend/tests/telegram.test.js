const test = require('node:test');
const assert = require('node:assert/strict');

const telegram = require('../src/integrations/telegram');

test('rate limit do Telegram bloqueia flood e libera comandos de ajuda', () => {
  const { TelegramService } = telegram.__test;
  const service = new TelegramService();
  service.rateLimitWindowMs = 10000;
  service.rateLimitMax = 2;

  assert.equal(service.verificarRateLimit('chat-1', '/status').permitido, true);
  assert.equal(service.verificarRateLimit('chat-1', '/carteira').permitido, true);

  const bloqueado = service.verificarRateLimit('chat-1', '/resumo');
  assert.equal(bloqueado.permitido, false);
  assert.equal(bloqueado.aguardarSegundos > 0, true);

  assert.equal(service.verificarRateLimit('chat-1', '/ajuda').permitido, true);
});

test('rate limit do Telegram separa buckets por chat', () => {
  const { TelegramService } = telegram.__test;
  const service = new TelegramService();
  service.rateLimitWindowMs = 10000;
  service.rateLimitMax = 1;

  assert.equal(service.verificarRateLimit('chat-a', '/status').permitido, true);
  assert.equal(service.verificarRateLimit('chat-a', '/status').permitido, false);
  assert.equal(service.verificarRateLimit('chat-b', '/status').permitido, true);
});
