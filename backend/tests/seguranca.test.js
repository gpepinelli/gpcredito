const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/services/configuracaoService');
const documentoService = require('../src/services/documentoService');

test('configuracao desconhecida nao le variavel de ambiente arbitraria', async () => {
  process.env.ADMIN_PASSWORD = 'segredo-nao-deve-vazar';
  assert.equal(config.envFallback('ADMIN_PASSWORD'), undefined);
  assert.equal(await config.getConfig('ADMIN_PASSWORD'), '');
});

test('validacao de documento aceita assinatura real de PDF, PNG e JPG', () => {
  const pdf = { mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n') };
  const png = { mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]) };
  const jpg = { mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) };

  assert.equal(documentoService.assinaturaArquivoValida(pdf), true);
  assert.equal(documentoService.assinaturaArquivoValida(png), true);
  assert.equal(documentoService.assinaturaArquivoValida(jpg), true);
});

test('validacao de documento rejeita executavel renomeado para PDF', () => {
  const falsoPdf = { mimetype: 'application/pdf', buffer: Buffer.from('MZ fake exe') };
  assert.equal(documentoService.assinaturaArquivoValida(falsoPdf), false);
});
