ALTER TABLE "parcelas"
  ADD COLUMN IF NOT EXISTS "amortizacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "valor_juros" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "saldo_antes" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "saldo_depois" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "pagamentos"
  ADD COLUMN IF NOT EXISTS "parcela_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pagamentos_parcela_id_fkey'
  ) THEN
    ALTER TABLE "pagamentos"
      ADD CONSTRAINT "pagamentos_parcela_id_fkey"
      FOREIGN KEY ("parcela_id") REFERENCES "parcelas"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "parcelas" p
SET
  "amortizacao" = CASE
    WHEN e."total_parcelas" > 0 THEN ROUND((e."valor" / e."total_parcelas")::numeric, 2)::double precision
    ELSE p."valor"
  END,
  "valor_juros" = GREATEST(p."valor" - CASE
    WHEN e."total_parcelas" > 0 THEN ROUND((e."valor" / e."total_parcelas")::numeric, 2)::double precision
    ELSE p."valor"
  END, 0),
  "saldo_antes" = GREATEST(e."valor" - (
    CASE
      WHEN e."total_parcelas" > 0 THEN ROUND((e."valor" / e."total_parcelas")::numeric, 2)::double precision
      ELSE p."valor"
    END * (p."numero" - 1)
  ), 0),
  "saldo_depois" = GREATEST(e."valor" - (
    CASE
      WHEN e."total_parcelas" > 0 THEN ROUND((e."valor" / e."total_parcelas")::numeric, 2)::double precision
      ELSE p."valor"
    END * p."numero"
  ), 0)
FROM "emprestimos" e
WHERE p."emprestimo_id" = e."id"
  AND p."amortizacao" = 0
  AND p."saldo_antes" = 0;
