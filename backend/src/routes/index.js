// src/routes/index.js

const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const authController = require('../controllers/authController');
const clienteController = require('../controllers/clienteController');
const emprestimoController = require('../controllers/emprestimoController');
const operacaoController = require('../controllers/operacaoController');
const webhookController = require('../controllers/webhookController');
const { requireAdmin, requireDeletePassword } = require('../utils/auth');

const router = express.Router();
const uploadDocumento = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const permitidos = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!permitidos.includes(file.mimetype)) {
      return cb(new Error('Formato invalido. Envie JPG, PNG ou PDF.'));
    }
    return cb(null, true);
  },
});

function processarUploadDocumento(req, res, next) {
  uploadDocumento.single('arquivo')(req, res, error => {
    if (!error) return next();
    const mensagem = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'Arquivo excede o limite de 5MB.'
      : error.message;
    return res.status(400).json({ sucesso: false, mensagem });
  });
}

router.post('/auth/login', authController.login);
router.post('/webhook/mercadopago', webhookController.mercadoPago);
router.use(requireAdmin);

// ── CLIENTES ──
router.post('/clientes',
  [body('nome').trim().notEmpty().withMessage('Nome é obrigatório'),
   body('telefone').trim().notEmpty().withMessage('Telefone é obrigatório').matches(/^[\d\s\-\(\)\+]+$/).withMessage('Telefone inválido')],
  clienteController.criar);
router.get('/clientes', clienteController.listar);
router.get('/clientes/:id', clienteController.buscarPorId);
router.get('/clientes/:id/historico', clienteController.historico);
router.post('/clientes/:id/documentos', processarUploadDocumento, clienteController.uploadDocumento);
router.get('/clientes/:id/documentos', clienteController.listarDocumentos);
router.get('/clientes/:id/documentos/:documentoId/download', clienteController.baixarDocumento);
router.delete('/clientes/:id/documentos/:documentoId', clienteController.excluirDocumento);
router.delete('/clientes/:id', requireDeletePassword, clienteController.excluir);

// ── EMPRÉSTIMOS ──
router.post('/emprestimos',
  [body('clienteId').notEmpty().withMessage('clienteId é obrigatório'),
   body('valor').isFloat({ min: 10 }).withMessage('Valor mínimo: R$ 10,00'),
   body('juros').isFloat({ min: 0, max: 100 }).withMessage('Juros deve ser entre 0% e 100%'),
   body('diasParaVencer').optional().isInt({ min: 1, max: 365 }),
   body('totalParcelas').optional().isInt({ min: 1, max: 60 }).withMessage('Máximo 60 parcelas')],
  emprestimoController.criar);
router.get('/emprestimos', emprestimoController.listar);
router.delete('/emprestimos/:id', requireDeletePassword, emprestimoController.excluir);
router.get('/inadimplentes', emprestimoController.listarInadimplentes);
router.get('/lucro', emprestimoController.lucroTotal);
router.get('/relatorio/mensal', emprestimoController.metricasMensais);
router.get('/relatorio/export', emprestimoController.exportarDados);
router.post('/emprestimos/:id/pagar',
  [body('valorPago').isFloat({ min: 0.01 }).withMessage('Valor pago inválido')],
  emprestimoController.confirmarPagamentoManual);
router.post('/emprestimos/:id/parcelas/:parcelaId/pagar', emprestimoController.confirmarPagamentoParcela);
router.post('/operacoes/:numeroOperacao/contrato/aceitar', operacaoController.aceitarContrato);
router.get('/operacoes/:numeroOperacao', operacaoController.buscarPorNumero);

module.exports = router;
