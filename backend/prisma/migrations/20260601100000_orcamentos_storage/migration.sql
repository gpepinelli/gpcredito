CREATE TYPE "StatusOrcamento" AS ENUM ('PENDENTE', 'CONVERTIDO', 'EXPIRADO');
CREATE TYPE "TipoArquivoPdf" AS ENUM ('CONTRATO', 'ORCAMENTO', 'COBRANCA', 'RECIBO');

ALTER TABLE "pagamentos" ADD COLUMN "caminho_pdf" TEXT;

CREATE TABLE "orcamentos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "juros" DOUBLE PRECISION NOT NULL,
    "parcelas" INTEGER NOT NULL,
    "primeiro_vencimento" TIMESTAMP(3) NOT NULL,
    "caminho_pdf" TEXT,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'PENDENTE',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expirado_em" TIMESTAMP(3),

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "arquivos_pdf" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "tipo" "TipoArquivoPdf" NOT NULL,
    "origem_tipo" TEXT,
    "origem_id" TEXT,
    "caminho_pdf" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivos_pdf_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "orcamentos_cliente_id_idx" ON "orcamentos"("cliente_id");
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");
CREATE INDEX "arquivos_pdf_cliente_id_idx" ON "arquivos_pdf"("cliente_id");
CREATE INDEX "arquivos_pdf_tipo_idx" ON "arquivos_pdf"("tipo");
CREATE INDEX "arquivos_pdf_origem_tipo_origem_id_idx" ON "arquivos_pdf"("origem_tipo", "origem_id");

ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "arquivos_pdf" ADD CONSTRAINT "arquivos_pdf_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
