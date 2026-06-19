const prisma = require('../lib/prisma');

const MAX_TENTATIVAS = 5;
const JANELA_MS = 15 * 60 * 1000;
const BLOQUEIO_MS = 15 * 60 * 1000;
const RETENCAO_MS = 30 * 24 * 60 * 60 * 1000;

function normalizarChave(chave = '') {
  return String(chave || 'desconhecido').slice(0, 180);
}

function expirouJanela(registro, agora) {
  if (!registro?.atualizadoEm) return true;
  return agora.getTime() - new Date(registro.atualizadoEm).getTime() > JANELA_MS;
}

class LoginRateLimitService {
  async verificar(chaveBruta) {
    const chave = normalizarChave(chaveBruta);
    const registro = await prisma.loginRateLimit.findUnique({ where: { chave } });
    const agora = new Date();

    if (!registro) return { bloqueado: false };

    if (registro.bloqueadoAte && new Date(registro.bloqueadoAte) > agora) {
      return { bloqueado: true, bloqueadoAte: registro.bloqueadoAte };
    }

    if (expirouJanela(registro, agora) || registro.bloqueadoAte) {
      await prisma.loginRateLimit.update({
        where: { chave },
        data: { tentativas: 0, bloqueadoAte: null },
      });
    }

    return { bloqueado: false };
  }

  async registrarFalha(chaveBruta) {
    const chave = normalizarChave(chaveBruta);
    const agora = new Date();
    const registro = await prisma.loginRateLimit.findUnique({ where: { chave } });
    const tentativasAtuais = registro && !expirouJanela(registro, agora) ? registro.tentativas : 0;
    const tentativas = tentativasAtuais + 1;
    const bloqueadoAte = tentativas >= MAX_TENTATIVAS
      ? new Date(agora.getTime() + BLOQUEIO_MS)
      : null;

    await prisma.loginRateLimit.upsert({
      where: { chave },
      update: { tentativas, bloqueadoAte },
      create: { chave, tentativas, bloqueadoAte },
    });

    return { tentativas, bloqueadoAte };
  }

  async registrarSucesso(chaveBruta) {
    const chave = normalizarChave(chaveBruta);
    await prisma.loginRateLimit.deleteMany({ where: { chave } });
  }

  async limparAntigos(agora = new Date()) {
    const limite = new Date(agora.getTime() - RETENCAO_MS);
    return prisma.loginRateLimit.deleteMany({
      where: {
        atualizadoEm: { lt: limite },
      },
    });
  }
}

module.exports = Object.assign(new LoginRateLimitService(), {
  normalizarChave,
  expirouJanela,
  MAX_TENTATIVAS,
  JANELA_MS,
  BLOQUEIO_MS,
  RETENCAO_MS,
});
