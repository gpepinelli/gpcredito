const prisma = require('../lib/prisma');
const { CONFIG_DEFINITIONS, CONFIG_MAP } = require('../config/defaults');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function envFallback(chave) {
  if (chave === 'PIX_CHAVE') return process.env.PIX_CHAVE || process.env.MEU_PIX;
  if (chave === 'PIX_NOME') return process.env.PIX_NOME || process.env.PIX_TITULAR;
  if (chave === 'MERCADOPAGO_ATIVO') return process.env.MERCADOPAGO_ACCESS_TOKEN ? 'true' : undefined;
  return process.env[chave];
}

function defaultValue(chave) {
  return CONFIG_MAP[chave]?.valor;
}

function normalizarBoolean(valor) {
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  const texto = String(valor).trim().toLowerCase();
  if (['true', '1', 'sim', 'yes', 'on'].includes(texto)) return 'true';
  if (['false', '0', 'nao', 'no', 'off'].includes(texto)) return 'false';
  throw new Error('Valor booleano invalido');
}

function validarValor(chave, valor) {
  const def = CONFIG_MAP[chave];
  if (!def) throw new Error('Configuracao desconhecida');
  const texto = valor === null || valor === undefined ? '' : String(valor).trim();
  if (def.obrigatorio && texto === '') throw new Error('Configuracao obrigatoria');

  if (def.tipo === 'NUMBER') {
    const numero = Number(texto);
    if (!Number.isFinite(numero)) throw new Error('Valor numerico invalido');
    if (def.min !== undefined && numero < def.min) throw new Error(`Valor minimo: ${def.min}`);
    if (def.max !== undefined && numero > def.max) throw new Error(`Valor maximo: ${def.max}`);
    return String(numero);
  }

  if (def.tipo === 'BOOLEAN') return normalizarBoolean(texto);
  if (def.tipo === 'TIME') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(texto)) throw new Error('Horario deve estar no formato HH:MM');
    return texto;
  }
  return texto;
}

function valorComFallback(chave, bancoValor) {
  return bancoValor ?? envFallback(chave) ?? defaultValue(chave) ?? '';
}

function formatar(def, bancoValor = undefined) {
  const valor = valorComFallback(def.chave, bancoValor);
  return {
    chave: def.chave,
    valor,
    tipo: def.tipo,
    categoria: def.categoria,
    descricao: def.descricao,
    obrigatorio: def.obrigatorio,
    padrao: def.valor,
    min: def.min,
    max: def.max,
    alterado: String(valor) !== String(def.valor),
  };
}

async function buscarRegistro(chave) {
  const hit = cache.get(chave);
  if (hit && hit.expiraEm > Date.now()) return hit.valor;

  const registro = await prisma.configuracao.findUnique({ where: { chave } });
  const valor = registro?.valor;
  cache.set(chave, { valor, expiraEm: Date.now() + CACHE_TTL_MS });
  return valor;
}

async function listar() {
  const registros = await prisma.configuracao.findMany();
  const mapa = new Map(registros.map(item => [item.chave, item.valor]));
  for (const item of registros) cache.set(item.chave, { valor: item.valor, expiraEm: Date.now() + CACHE_TTL_MS });
  return CONFIG_DEFINITIONS.map(def => formatar(def, mapa.get(def.chave)));
}

async function atualizar(chave, valor) {
  const def = CONFIG_MAP[chave];
  if (!def) throw new Error('Configuracao desconhecida');
  const normalizado = validarValor(chave, valor);
  const registro = await prisma.configuracao.upsert({
    where: { chave },
    create: {
      chave,
      valor: normalizado,
      tipo: def.tipo,
      categoria: def.categoria,
      descricao: def.descricao,
      obrigatorio: def.obrigatorio,
    },
    update: {
      valor: normalizado,
      tipo: def.tipo,
      categoria: def.categoria,
      descricao: def.descricao,
      obrigatorio: def.obrigatorio,
    },
  });
  cache.set(chave, { valor: registro.valor, expiraEm: Date.now() + CACHE_TTL_MS });
  return formatar(def, registro.valor);
}

async function resetar(chave) {
  const def = CONFIG_MAP[chave];
  if (!def) throw new Error('Configuracao desconhecida');
  await prisma.configuracao.deleteMany({ where: { chave } });
  cache.delete(chave);
  return formatar(def);
}

async function resetarTodos() {
  await prisma.configuracao.deleteMany({});
  cache.clear();
  return listar();
}

async function getConfig(chave) {
  if (!CONFIG_MAP[chave]) return process.env[chave];
  const valorBanco = await buscarRegistro(chave);
  return valorComFallback(chave, valorBanco);
}

async function getConfigNumber(chave) {
  return Number(await getConfig(chave));
}

async function getConfigBoolean(chave) {
  return normalizarBoolean(await getConfig(chave)) === 'true';
}

async function getConfigList(chave) {
  return String(await getConfig(chave) || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
}

module.exports = {
  listar,
  atualizar,
  resetar,
  resetarTodos,
  getConfig,
  getConfigNumber,
  getConfigBoolean,
  getConfigList,
  validarValor,
};
