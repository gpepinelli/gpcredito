const prisma = require('../lib/prisma');

async function registrar(tipo, mensagem, dados = {}) {
  try {
    return await prisma.log.create({ data: { tipo, mensagem, dados } });
  } catch (error) {
    return null;
  }
}

async function listar({ page = 1, limit = 50 } = {}) {
  const pagina = Math.max(1, Number(page) || 1);
  const limite = Math.min(100, Math.max(1, Number(limit) || 50));
  const [total, logs] = await Promise.all([
    prisma.log.count(),
    prisma.log.findMany({
      orderBy: { criadoEm: 'desc' },
      skip: (pagina - 1) * limite,
      take: limite,
    }),
  ]);
  return { logs, total, page: pagina, limit: limite, totalPages: Math.max(1, Math.ceil(total / limite)) };
}

module.exports = { listar, registrar };
