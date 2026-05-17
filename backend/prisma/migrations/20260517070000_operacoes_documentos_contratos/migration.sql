CREATE TYPE "StatusOperacao" AS ENUM (
  'AGUARDANDO_ACEITE',
  'APROVADO',
  'LIBERADO',
  'EM_DIA',
  'ATRASADO',
  'QUITADO',
  'CANCELADO',
  'RECUSADO'
);

CREATE TYPE "StatusContrato" AS ENUM (
  'GERADO',
  'ENVIADO',
  'ACEITO',
  'CANCELADO'
);

CREATE TYPE "TipoDocumentoCliente" AS ENUM (
  'RG_FRENTE',
  'RG_VERSO',
  'COMPROVANTE_ENDERECO'
);

CREATE TYPE "StatusValidacaoDocumento" AS ENUM (
  'PENDENTE',
  'APROVADO',
  'RECUSADO'
);

ALTER TABLE "emprestimos"
  ADD COLUMN "numero_operacao" TEXT,
  ADD COLUMN "numero_contrato" TEXT,
  ADD COLUMN "status_operacao" "StatusOperacao" NOT NULL DEFAULT 'EM_DIA';

WITH numerados AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "data_emprestimo", "id") AS seq,
    EXTRACT(YEAR FROM "data_emprestimo")::int AS ano,
    "status"
  FROM "emprestimos"
)
UPDATE "emprestimos" e
SET
  "numero_operacao" = 'OP-' || n.ano || '-' || LPAD(n.seq::text, 6, '0'),
  "numero_contrato" = 'CT-' || n.ano || '-' || LPAD(n.seq::text, 6, '0'),
  "status_operacao" = CASE
    WHEN n."status" = 'pago' THEN 'QUITADO'::"StatusOperacao"
    WHEN n."status" = 'atrasado' THEN 'ATRASADO'::"StatusOperacao"
    ELSE 'EM_DIA'::"StatusOperacao"
  END
FROM numerados n
WHERE e."id" = n."id";

ALTER TABLE "emprestimos"
  ALTER COLUMN "numero_operacao" SET NOT NULL;

CREATE UNIQUE INDEX "emprestimos_numero_operacao_key" ON "emprestimos"("numero_operacao");
CREATE UNIQUE INDEX "emprestimos_numero_contrato_key" ON "emprestimos"("numero_contrato");

CREATE TABLE "documentos_cliente" (
  "id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "tipo_documento" "TipoDocumentoCliente" NOT NULL,
  "nome_original" TEXT NOT NULL,
  "nome_arquivo" TEXT NOT NULL,
  "caminho_arquivo" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "tamanho_bytes" INTEGER NOT NULL,
  "status_validacao" "StatusValidacaoDocumento" NOT NULL DEFAULT 'PENDENTE',
  "observacao" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "documentos_cliente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contratos_operacao" (
  "id" TEXT NOT NULL,
  "numero_contrato" TEXT NOT NULL,
  "numero_operacao" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "emprestimo_id" TEXT,
  "caminho_arquivo" TEXT NOT NULL,
  "hash_sha256" TEXT NOT NULL DEFAULT '',
  "status_contrato" "StatusContrato" NOT NULL DEFAULT 'GERADO',
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aceito_em" TIMESTAMP(3),
  CONSTRAINT "contratos_operacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contratos_operacao_numero_contrato_key" ON "contratos_operacao"("numero_contrato");
CREATE INDEX "contratos_operacao_cliente_id_idx" ON "contratos_operacao"("cliente_id");
CREATE INDEX "contratos_operacao_numero_operacao_idx" ON "contratos_operacao"("numero_operacao");

ALTER TABLE "documentos_cliente"
  ADD CONSTRAINT "documentos_cliente_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contratos_operacao"
  ADD CONSTRAINT "contratos_operacao_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contratos_operacao"
  ADD CONSTRAINT "contratos_operacao_emprestimo_id_fkey"
  FOREIGN KEY ("emprestimo_id") REFERENCES "emprestimos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "contratos_operacao" (
  "id",
  "numero_contrato",
  "numero_operacao",
  "cliente_id",
  "emprestimo_id",
  "caminho_arquivo",
  "hash_sha256",
  "status_contrato",
  "criado_em"
)
SELECT
  'contrato-' || "id",
  "numero_contrato",
  "numero_operacao",
  "cliente_id",
  "id",
  'contratos/' || "cliente_id" || '/' || "numero_operacao" || '/contrato.pdf',
  '',
  'GERADO'::"StatusContrato",
  "data_emprestimo"
FROM "emprestimos"
WHERE "numero_contrato" IS NOT NULL;
