ALTER TABLE "vendas_produto"
ADD COLUMN "valor_base" DOUBLE PRECISION,
ADD COLUMN "juros_percentual" DOUBLE PRECISION NOT NULL DEFAULT 30,
ADD COLUMN "valor_parcela" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "vendas_produto"
SET "valor_base" = "valor_venda"
WHERE "valor_base" IS NULL;

ALTER TABLE "vendas_produto"
ALTER COLUMN "valor_base" SET NOT NULL;
