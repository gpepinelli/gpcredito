// src/routes/index.js

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const multer = require('multer');
const authController = require('../controllers/authController');
const clienteController = require('../controllers/clienteController');
const emprestimoController = require('../controllers/emprestimoController');
const adminController = require('../controllers/adminController');
const operacaoController = require('../controllers/operacaoController');
const vendaProdutoController = require('../controllers/vendaProdutoController');
const configuracaoController = require('../controllers/configuracaoController');
const orcamentoController = require('../controllers/orcamentoController');
const webhookController = require('../controllers/webhookController');
const { requireAdmin, requireDeletePassword } = require('../utils/auth');
const { validarCPF } = require('../utils/calculadora');
const config = require('../services/configuracaoService');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    sucesso: false,
    mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
  },
});
const uploadDocumento = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function processarUploadDocumento(req, res, next) {
  uploadDocumento.single('arquivo')(req, res, error => {
    if (!error) return next();
    const mensagem = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'Arquivo excede o limite maximo permitido.'
      : error.message;
    return res.status(400).json({ sucesso: false, mensagem });
  });
}

async function validarUploadConfigurado(req, res, next) {
  if (!req.file) return next();
  const [maxMb, tiposPermitidos] = await Promise.all([
    config.getConfigNumber('UPLOAD_TAMANHO_MAXIMO_MB'),
    config.getConfigList('UPLOAD_TIPOS_PERMITIDOS'),
  ]);
  const ext = String(req.file.originalname || '').split('.').pop().toLowerCase();
  if (req.file.size > maxMb * 1024 * 1024) {
    return res.status(400).json({ sucesso: false, mensagem: `Arquivo excede o limite de ${maxMb}MB.` });
  }
  if (tiposPermitidos.length && !tiposPermitidos.includes(ext)) {
    return res.status(400).json({ sucesso: false, mensagem: `Formato invalido. Envie ${tiposPermitidos.join(', ')}.` });
  }
  return next();
}

router.post('/auth/login', loginLimiter, authController.login);
router.post('/webhook/mercadopago', webhookController.mercadoPago);
router.use(requireAdmin);

router.get('/admin/logs', adminController.logs);
router.get('/admin/whatsapp/status', adminController.whatsappStatus);
router.get('/admin/inadimplencia/aging', adminController.inadimplenciaAging);
router.get('/configuracoes', configuracaoController.listar);
router.put('/configuracoes/:chave', configuracaoController.atualizar);
router.post('/configuracoes/reset/todos', configuracaoController.resetarTodos);
router.post('/configuracoes/reset/:chave', configuracaoController.resetar);

// â”€â”€ CLIENTES â”€â”€
router.post('/clientes',
  [body('nome').trim().notEmpty().withMessage('Nome Ã© obrigatÃ³rio'),
   body('telefone').trim().notEmpty().withMessage('Telefone Ã© obrigatÃ³rio').matches(/^[\d\s\-\(\)\+]+$/).withMessage('Telefone invÃ¡lido'),
   body('cpf').optional({ checkFalsy: true }).trim().custom(value => validarCPF(value)).withMessage('CPF invalido'),
   body('endereco').optional({ checkFalsy: true }).trim().isLength({ max: 240 }).withMessage('Endereco muito longo')],
  clienteController.criar);
router.get('/clientes', clienteController.listar);
router.get('/clientes/:id', clienteController.buscarPorId);
router.get('/clientes/:id/historico', clienteController.historico);
router.post('/clientes/:id/documentos', processarUploadDocumento, validarUploadConfigurado, clienteController.uploadDocumento);
router.get('/clientes/:id/documentos', clienteController.listarDocumentos);
router.get('/clientes/:id/documentos/:documentoId/download', clienteController.baixarDocumento);
router.delete('/clientes/:id/documentos/:documentoId', clienteController.excluirDocumento);
router.delete('/clientes/:id', requireDeletePassword, clienteController.excluir);

// â”€â”€ EMPRÃ‰STIMOS â”€â”€
router.post('/emprestimos',
  [body('clienteId').notEmpty().withMessage('clienteId Ã© obrigatÃ³rio'),
   body('valor').isFloat({ min: 0.01 }).withMessage('Valor invalido'),
   body('juros').isFloat({ min: 0 }).withMessage('Juros invalido'),
   body('diasParaVencer').optional().isInt({ min: 1, max: 365 }),
   body('totalParcelas').optional().isInt({ min: 1 }).withMessage('Parcelas invalida')],
  emprestimoController.criar);
router.get('/emprestimos', emprestimoController.listar);
router.delete('/emprestimos/:id', requireDeletePassword, emprestimoController.excluir);
router.get('/inadimplentes', emprestimoController.listarInadimplentes);
router.get('/lucro', emprestimoController.lucroTotal);
router.get('/painel/financeiro', emprestimoController.painelFinanceiro);
router.get('/emprestimos/alertas', emprestimoController.alertas);
router.get('/relatorio/mensal', emprestimoController.metricasMensais);
router.get('/relatorio/export', emprestimoController.exportarDados);
router.post('/emprestimos/:id/pagar',
  [body('valorPago').isFloat({ min: 0.01 }).withMessage('Valor pago invÃ¡lido')],
  emprestimoController.confirmarPagamentoManual);
router.post('/emprestimos/:id/parcelas/:parcelaId/pagar', emprestimoController.confirmarPagamentoParcela);
router.post('/emprestimos/:id/aceitar', emprestimoController.aceitarManual);
router.post('/emprestimos/:id/liberar', emprestimoController.liberarDinheiro);
router.post('/emprestimos/:id/reenviar-contrato', emprestimoController.reenviarContrato);
router.post('/emprestimos/:id/reenviar-pix', emprestimoController.reenviarPix);
router.post('/emprestimos/cobranca-lote', emprestimoController.cobrancaLote);
router.patch('/emprestimos/:id/renegociar', emprestimoController.renegociarPrazo);
router.patch('/emprestimos/:id/observacao', emprestimoController.atualizarObservacao);
router.post('/operacoes/:numeroOperacao/contrato/aceitar', operacaoController.aceitarContrato);
router.get('/operacoes/:numeroOperacao', operacaoController.buscarPorNumero);

// ORCAMENTOS
router.get('/orcamentos', orcamentoController.listar);
router.post('/orcamentos',
  [body('clienteId').optional({ checkFalsy: true }).isString(),
   body('valor').isFloat({ min: 0.01 }).withMessage('Valor invalido'),
   body('juros').isFloat({ min: 0 }).withMessage('Juros invalido'),
   body('parcelas').isInt({ min: 1, max: 120 }).withMessage('Parcelas invalida'),
   body('primeiroVencimento').isISO8601().withMessage('Primeiro vencimento invalido')],
  orcamentoController.criar);
router.get('/orcamentos/:id', orcamentoController.buscar);
router.post('/orcamentos/:id/enviar', orcamentoController.enviar);
router.post('/orcamentos/:id/converter', orcamentoController.converter);
router.delete('/orcamentos/:id', requireDeletePassword, orcamentoController.excluir);

// â”€â”€ VENDAS: CARROS, MOTOS E CELULARES â”€â”€
router.get('/vendas/resumo', vendaProdutoController.resumo);
router.post('/produtos-venda',
  [body('tipo').isIn(['CARRO', 'MOTO', 'CELULAR']).withMessage('Tipo deve ser CARRO, MOTO ou CELULAR'),
   body('titulo').trim().notEmpty().withMessage('Titulo e obrigatorio'),
   body('valorVenda').isFloat({ min: 0.01 }).withMessage('Valor de venda invalido'),
   body('valorCusto').optional().isFloat({ min: 0 }).withMessage('Valor de custo invalido'),
   body('ano').optional().isInt({ min: 1900, max: 2100 }).withMessage('Ano invalido')],
  vendaProdutoController.criarProduto);
router.get('/produtos-venda', vendaProdutoController.listarProdutos);
router.patch('/produtos-venda/:id', vendaProdutoController.atualizarProduto);
router.delete('/produtos-venda/:id', requireDeletePassword, vendaProdutoController.excluirProduto);
router.post('/vendas-produto',
  [body('produtoId').notEmpty().withMessage('produtoId e obrigatorio'),
   body('compradorNome').trim().notEmpty().withMessage('Nome do comprador e obrigatorio'),
   body('valorVenda').optional().isFloat({ min: 0.01 }).withMessage('Valor de venda invalido'),
   body('valorEntrada').optional().isFloat({ min: 0 }).withMessage('Entrada invalida'),
   body('parcelas').optional().isInt({ min: 1, max: 120 }).withMessage('Parcelas deve ser entre 1 e 120')],
  vendaProdutoController.registrarVenda);
router.get('/vendas-produto', vendaProdutoController.listarVendas);
router.post('/vendas-produto/:id/cancelar', vendaProdutoController.cancelarVenda);

module.exports = router;

