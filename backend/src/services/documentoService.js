const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const prisma = new PrismaClient();
const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

const TIPOS_VALIDOS = new Set(['RG_FRENTE', 'RG_VERSO', 'COMPROVANTE_ENDERECO']);
const MIMES_VALIDOS = new Set(['image/jpeg', 'image/png', 'application/pdf']);

function extensaoPorMime(mimeType, nomeOriginal = '') {
  const ext = path.extname(nomeOriginal).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.pdf'].includes(ext)) return ext;
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  return '.pdf';
}

class DocumentoService {
  async salvarDocumento(clienteId, tipoDocumento, arquivo, observacao = '') {
    if (!TIPOS_VALIDOS.has(tipoDocumento)) throw new Error('Tipo de documento invalido');
    if (!arquivo) throw new Error('Arquivo obrigatorio');
    if (!MIMES_VALIDOS.has(arquivo.mimetype)) throw new Error('Formato invalido. Envie JPG, PNG ou PDF.');

    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new Error('Cliente nao encontrado');

    const dir = path.join(UPLOADS_DIR, 'clientes', clienteId, 'documentos');
    fs.mkdirSync(dir, { recursive: true });

    const ext = extensaoPorMime(arquivo.mimetype, arquivo.originalname);
    const nomeArquivo = `${tipoDocumento.toLowerCase()}_${Date.now()}${ext}`;
    const caminhoArquivo = path.join(dir, nomeArquivo);
    fs.writeFileSync(caminhoArquivo, arquivo.buffer);

    const relativo = path.relative(ROOT_DIR, caminhoArquivo).replace(/\\/g, '/');
    const documento = await prisma.documentoCliente.create({
      data: {
        clienteId,
        tipoDocumento,
        nomeOriginal: arquivo.originalname,
        nomeArquivo,
        caminhoArquivo: relativo,
        mimeType: arquivo.mimetype,
        tamanhoBytes: arquivo.size,
        observacao: observacao || null,
      },
    });

    logger.info('Documento de cliente enviado', {
      clienteId,
      documentoId: documento.id,
      tipoDocumento,
      caminhoArquivo: relativo,
    });

    return documento;
  }

  listar(clienteId) {
    return prisma.documentoCliente.findMany({
      where: { clienteId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async buscar(clienteId, documentoId) {
    const documento = await prisma.documentoCliente.findFirst({
      where: { id: documentoId, clienteId },
    });
    if (!documento) throw new Error('Documento nao encontrado');
    return documento;
  }

  async excluir(clienteId, documentoId) {
    const documento = await this.buscar(clienteId, documentoId);
    const caminhoAbsoluto = path.join(ROOT_DIR, documento.caminhoArquivo);

    await prisma.documentoCliente.delete({ where: { id: documento.id } });
    this.removerArquivoFisico(caminhoAbsoluto);

    logger.warn('Documento de cliente excluido', {
      clienteId,
      documentoId,
      tipoDocumento: documento.tipoDocumento,
      caminhoArquivo: documento.caminhoArquivo,
    });

    return documento;
  }

  removerArquivoFisico(caminhoArquivo) {
    try {
      const caminhoAbsoluto = path.isAbsolute(caminhoArquivo)
        ? caminhoArquivo
        : path.join(ROOT_DIR, caminhoArquivo);
      const pastaUploads = path.resolve(UPLOADS_DIR);
      const destino = path.resolve(caminhoAbsoluto);

      if (!destino.startsWith(pastaUploads + path.sep)) {
        logger.warn('Remocao de documento ignorada fora da pasta uploads', { caminhoArquivo });
        return;
      }

      if (fs.existsSync(destino)) fs.unlinkSync(destino);

      let dir = path.dirname(destino);
      while (dir.startsWith(pastaUploads + path.sep) && dir !== pastaUploads) {
        if (!fs.existsSync(dir) || fs.readdirSync(dir).length > 0) break;
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      }
    } catch (error) {
      logger.warn('Nao foi possivel remover documento fisico', { caminhoArquivo, error: error.message });
    }
  }

  caminhoAbsoluto(documento) {
    return path.join(ROOT_DIR, documento.caminhoArquivo);
  }
}

module.exports = new DocumentoService();
