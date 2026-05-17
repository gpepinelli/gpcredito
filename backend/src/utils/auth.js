const crypto = require('crypto');

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || '';
}

function getDeletePassword() {
  return process.env.ADMIN_DELETE_PASSWORD || process.env.ADMIN_PASSWORD || '';
}

function getSecret() {
  return process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD || '';
}

function safeCompare(a = '', b = '') {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload) {
  return crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');
}

function criarToken() {
  const payload = JSON.stringify({
    sub: 'admin',
    exp: Date.now() + TOKEN_TTL_MS,
  });
  const encodedPayload = base64url(payload);
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function verificarToken(token = '') {
  if (!getAdminPassword()) return false;

  const [encodedPayload, signature] = String(token).split('.');
  if (!encodedPayload || !signature) return false;

  const expectedSignature = sign(encodedPayload);
  if (!safeCompare(signature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return payload.sub === 'admin' && payload.exp > Date.now();
  } catch (error) {
    return false;
  }
}

function senhaAdminValida(senha) {
  const configuredPassword = getAdminPassword();
  return Boolean(configuredPassword) && safeCompare(senha, configuredPassword);
}

function senhaExclusaoValida(senha) {
  const configuredPassword = getDeletePassword();
  return Boolean(configuredPassword) && safeCompare(senha, configuredPassword);
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!verificarToken(token)) {
    return res.status(401).json({ sucesso: false, mensagem: 'Login de administrador obrigatorio' });
  }

  return next();
}

function requireDeletePassword(req, res, next) {
  const { senha } = req.body || {};

  if (!senhaExclusaoValida(senha)) {
    return res.status(403).json({ sucesso: false, mensagem: 'Senha de exclusao invalida' });
  }

  return next();
}

module.exports = {
  criarToken,
  requireAdmin,
  requireDeletePassword,
  senhaAdminValida,
};
