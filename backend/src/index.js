// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const { iniciarJobs } = require('./jobs/cobrancaJob');
const whatsapp = require('./integrations/whatsapp');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

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

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve o frontend React quando compilado; usa o painel legado como fallback local.
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
const FRONTEND_PUBLIC = path.join(__dirname, '..', '..', 'frontend', 'public');
const FRONTEND_DIR = require('fs').existsSync(path.join(FRONTEND_DIST, 'index.html')) ? FRONTEND_DIST : FRONTEND_PUBLIC;
app.use(express.static(FRONTEND_DIR));

app.use('/api', (req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    body: req.method !== 'GET' ? sanitizarBody(req.body) : undefined,
  });
  next();
});

app.use('/api', routes);

app.get('/health', (req, res) => {
  res.json({ status: 'online', versao: '2.0.0', horario: new Date().toLocaleString('pt-BR') });
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
