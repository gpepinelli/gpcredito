const { criarTokenAsync, senhaAdminValida } = require('../utils/auth');
const logger = require('../utils/logger');
const loginRateLimit = require('../services/loginRateLimitService');

function chaveRateLimit(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'desconhecido';
}

class AuthController {
  async login(req, res) {
    try {
      const { senha } = req.body;
      const ip = chaveRateLimit(req);
      const bloqueio = await loginRateLimit.verificar(ip);

      if (bloqueio.bloqueado) {
        return res.status(429).json({
          sucesso: false,
          mensagem: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        });
      }

      if (!senhaAdminValida(senha)) {
        await loginRateLimit.registrarFalha(ip);
        logger.warn('Tentativa de login admin recusada', { ip });
        return res.status(401).json({ sucesso: false, mensagem: 'Senha invalida' });
      }

      await loginRateLimit.registrarSucesso(ip);

      return res.json({
        sucesso: true,
        token: await criarTokenAsync(),
      });
    } catch (error) {
      logger.error('Erro ao autenticar administrador', { error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }
}

module.exports = new AuthController();
