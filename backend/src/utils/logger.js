// src/utils/logger.js
// Sistema de logs - salva no console E em arquivo

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Cria pasta de logs se não existir
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Salva TODOS os logs em arquivo
    new winston.transports.File({
      filename: path.join(logDir, 'sistema.log'),
      maxsize: 5 * 1024 * 1024, // 5MB máximo por arquivo
      maxFiles: 5,              // Guarda os últimos 5 arquivos
    }),
    // Salva apenas erros em arquivo separado
    new winston.transports.File({
      filename: path.join(logDir, 'erros.log'),
      level: 'error',
    }),
  ],
});

// No ambiente de desenvolvimento, também mostra logs no console com cores
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const extra = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `[${timestamp}] ${level}: ${message} ${extra}`;
      })
    ),
  }));
}

module.exports = logger;
