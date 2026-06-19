CREATE TABLE IF NOT EXISTS "numeracoes_sequenciais" (
  "id" TEXT NOT NULL,
  "chave" TEXT NOT NULL,
  "valor" INTEGER NOT NULL DEFAULT 0,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "numeracoes_sequenciais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "numeracoes_sequenciais_chave_key" ON "numeracoes_sequenciais"("chave");

WITH operacoes AS (
  SELECT
    'OP-' || substring("numero_operacao" from '^OP-([0-9]{4})-[0-9]+$') AS chave,
    MAX((substring("numero_operacao" from '^OP-[0-9]{4}-([0-9]+)$'))::INTEGER) AS valor
  FROM "emprestimos"
  WHERE "numero_operacao" ~ '^OP-[0-9]{4}-[0-9]+$'
  GROUP BY 1
)
INSERT INTO "numeracoes_sequenciais" ("id", "chave", "valor", "criado_em", "atualizado_em")
SELECT chave, chave, valor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM operacoes
WHERE chave IS NOT NULL
ON CONFLICT ("chave") DO UPDATE
SET "valor" = GREATEST("numeracoes_sequenciais"."valor", EXCLUDED."valor"),
    "atualizado_em" = CURRENT_TIMESTAMP;

WITH contratos AS (
  SELECT
    'CT-' || substring("numero_contrato" from '^CT-([0-9]{4})-[0-9]+$') AS chave,
    MAX((substring("numero_contrato" from '^CT-[0-9]{4}-([0-9]+)$'))::INTEGER) AS valor
  FROM "emprestimos"
  WHERE "numero_contrato" ~ '^CT-[0-9]{4}-[0-9]+$'
  GROUP BY 1
)
INSERT INTO "numeracoes_sequenciais" ("id", "chave", "valor", "criado_em", "atualizado_em")
SELECT chave, chave, valor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM contratos
WHERE chave IS NOT NULL
ON CONFLICT ("chave") DO UPDATE
SET "valor" = GREATEST("numeracoes_sequenciais"."valor", EXCLUDED."valor"),
    "atualizado_em" = CURRENT_TIMESTAMP;
