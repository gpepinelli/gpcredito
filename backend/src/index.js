// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const routes = require('./routes');
const { iniciarJobs } = require('./jobs/cobrancaJob');
const whatsapp = require('./integrations/whatsapp');
const logger = require('./utils/logger');
const prisma = require('./lib/prisma');

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.set('trust proxy', 1);

function sanitizarBody(body) {
  if (!body || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => {
      const chave = key.toLowerCase();
      if (chave.includes('senha') || chave.includes('password') || chave.includes('token')) {
        return [key, '[REDACTED]'];
      }
      return [key, value];
    })
  );
}

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve o frontend React quando compilado; usa o painel legado como fallback local.
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
const FRONTEND_PUBLIC = path.join(__dirname, '..', '..', 'frontend', 'public');
const FRONTEND_DIR = fs.existsSync(path.join(FRONTEND_DIST, 'index.html')) ? FRONTEND_DIST : FRONTEND_PUBLIC;
app.use(express.static(FRONTEND_DIR));

app.use('/api', (req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    body: req.method !== 'GET' ? sanitizarBody(req.body) : undefined,
  });
  next();
});

app.use('/api', routes);

app.use('/api', (req, res) => {
  res.status(404).json({ sucesso: false, mensagem: 'Rota API nao encontrada' });
});

app.get('/health', async (req, res) => {
  const checks = {
    database: 'unknown',
    whatsapp: whatsapp.status ? whatsapp.status() : { connected: false, adapter: 'unknown' },
    storage: fs.existsSync(path.join(__dirname, '..', '..', 'storage')) ? 'ok' : 'missing',
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (error) {
    checks.database = 'error';
    checks.databaseError = error.message;
  }

  const saudavel = checks.database === 'ok';
  res.status(saudavel ? 200 : 503).json({
    status: saudavel ? 'online' : 'degradado',
    versao: '2.0.0',
    horario: new Date().toISOString(),
    checks,
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, FRONTEND_DIR === FRONTEND_DIST ? 'index.html' : 'dashboard.html'));
});

app.use((error, req, res, next) => {
  logger.error('Erro não tratado', { error: error.message, stack: error.stack });
  res.status(error.statusCode || 500).json({ sucesso: false, mensagem: error.message || 'Erro interno do servidor' });
});

async function iniciar() {
  try {
    if (!process.env.ADMIN_PASSWORD) {
      logger.warn('ADMIN_PASSWORD nao configurada.');
    }
    await whatsapp.initialize();
    await iniciarJobs();
    app.listen(PORT, () => {
      logger.info(`🚀 Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('Erro fatal ao iniciar servidor', { error: error.message });
    process.exit(1);
  }
}

iniciar();
