CREATE TYPE "StatusPixCobranca" AS ENUM ('PENDENTE', 'PAGO', 'CANCELADO', 'EXPIRADO');

CREATE TABLE "pix_cobrancas" (
    "id" TEXT NOT NULL,
    "emprestimo_id" TEXT NOT NULL,
    "parcela_id" TEXT,
    "payment_id" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "copia_cola" TEXT,
    "qr_code" TEXT,
    "status" "StatusPixCobranca" NOT NULL DEFAULT 'PENDENTE',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pago_em" TIMESTAMP(3),

    CONSTRAINT "pix_cobrancas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pix_cobrancas_payment_id_key" ON "pix_cobrancas"("payment_id");
CREATE INDEX "pix_cobrancas_emprestimo_id_idx" ON "pix_cobrancas"("emprestimo_id");
CREATE INDEX "pix_cobrancas_parcela_id_idx" ON "pix_cobrancas"("parcela_id");
CREATE INDEX "pix_cobrancas_status_idx" ON "pix_cobrancas"("status");

ALTER TABLE "pix_cobrancas" ADD CONSTRAINT "pix_cobrancas_emprestimo_id_fkey" FOREIGN KEY ("emprestimo_id") REFERENCES "emprestimos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pix_cobrancas" ADD CONSTRAINT "pix_cobrancas_parcela_id_fkey" FOREIGN KEY ("parcela_id") REFERENCES "parcelas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
