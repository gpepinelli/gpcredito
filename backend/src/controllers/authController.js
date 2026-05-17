const { criarToken, senhaAdminValida } = require('../utils/auth');
const logger = require('../utils/logger');

const tentativasLogin = new Map();
const MAX_TENTATIVAS = 5;
const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;

function obterRegistro(ip) {
  const agora = Date.now();
  const registro = tentativasLogin.get(ip);

  if (!registro || registro.expiraEm <= agora) {
    const novoRegistro = { total: 0, expiraEm: agora + JANELA_TENTATIVAS_MS };
    tentativasLogin.set(ip, novoRegistro);
    return novoRegistro;
  }

  return registro;
}

class AuthController {
  async login(req, res) {
    try {
      const { senha } = req.body;
      const ip = req.ip;
      const registro = obterRegistro(ip);

      if (registro.total >= MAX_TENTATIVAS) {
        return res.status(429).json({
          sucesso: false,
          mensagem: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        });
      }

      if (!senhaAdminValida(senha)) {
        registro.total += 1;
        logger.warn('Tentativa de login admin recusada', { ip });
        return res.status(401).json({ sucesso: false, mensagem: 'Senha invalida' });
      }

      tentativasLogin.delete(ip);

      return res.json({
        sucesso: true,
        token: criarToken(),
      });
    } catch (error) {
      logger.error('Erro ao autenticar administrador', { error: error.message });
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
    }
  }
}

module.exports = new AuthController();
