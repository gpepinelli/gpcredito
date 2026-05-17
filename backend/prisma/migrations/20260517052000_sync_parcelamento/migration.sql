-- Sincroniza bancos antigos que foram criados antes do parcelamento.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatusParcela') THEN
    CREATE TYPE "StatusParcela" AS ENUM ('pendente', 'pago', 'atrasado');
  END IF;
END $$;

ALTER TABLE "emprestimos"
  ADD COLUMN IF NOT EXISTS "total_parcelas" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "pix_qr_code" TEXT,
  ADD COLUMN IF NOT EXISTS "pix_copia_cola" TEXT,
  ADD COLUMN IF NOT EXISTS "pix_payment_id" TEXT;

CREATE TABLE IF NOT EXISTS "parcelas" (
    "id" TEXT NOT NULL,
    "emprestimo_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "data_vencimento" TIMESTAMP(3) NOT NULL,
    "status" "StatusParcela" NOT NULL DEFAULT 'pendente',
    "data_pagamento" TIMESTAMP(3),
    CONSTRAINT "parcelas_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'parcelas_emprestimo_id_fkey'
  ) THEN
    ALTER TABLE "parcelas"
      ADD CONSTRAINT "parcelas_emprestimo_id_fkey"
      FOREIGN KEY ("emprestimo_id") REFERENCES "emprestimos"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
