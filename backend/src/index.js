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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve o frontend
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend', 'public');
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
  res.json({ status: 'online', versao: '1.0.0', horario: new Date().toLocaleString('pt-BR') });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'dashboard.html'));
});

app.use((error, req, res, next) => {
  logger.error('Erro não tratado', { error: error.message, stack: error.stack });
  res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor' });
});

async function iniciar() {
  try {
    if (!process.env.ADMIN_PASSWORD) {
      logger.warn('ADMIN_PASSWORD nao configurada.');
    }
    await whatsapp.initialize();
    iniciarJobs();
    app.listen(PORT, () => {
      logger.info(`🚀 Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('Erro fatal ao iniciar servidor', { error: error.message });
    process.exit(1);
  }
}

iniciar();
