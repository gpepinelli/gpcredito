-- CreateEnum
CREATE TYPE "StatusEmprestimo" AS ENUM ('pendente', 'pago', 'atrasado');
CREATE TYPE "StatusPagamento" AS ENUM ('confirmado', 'pendente');
CREATE TYPE "StatusParcela" AS ENUM ('pendente', 'pago', 'atrasado');

-- CreateTable clientes
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 100,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clientes_telefone_key" ON "clientes"("telefone");

-- CreateTable emprestimos
CREATE TABLE "emprestimos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "juros" DOUBLE PRECISION NOT NULL,
    "valor_total" DOUBLE PRECISION NOT NULL,
    "data_emprestimo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_vencimento" TIMESTAMP(3) NOT NULL,
    "status" "StatusEmprestimo" NOT NULL DEFAULT 'pendente',
    "total_parcelas" INTEGER NOT NULL DEFAULT 1,
    "pix_qr_code" TEXT,
    "pix_copia_cola" TEXT,
    "pix_payment_id" TEXT,
    CONSTRAINT "emprestimos_pkey" PRIMARY KEY ("id")
);

-- CreateTable parcelas
CREATE TABLE "parcelas" (
    "id" TEXT NOT NULL,
    "emprestimo_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "data_vencimento" TIMESTAMP(3) NOT NULL,
    "status" "StatusParcela" NOT NULL DEFAULT 'pendente',
    "data_pagamento" TIMESTAMP(3),
    CONSTRAINT "parcelas_pkey" PRIMARY KEY ("id")
);

-- CreateTable pagamentos
CREATE TABLE "pagamentos" (
    "id" TEXT NOT NULL,
    "emprestimo_id" TEXT NOT NULL,
    "valor_pago" DOUBLE PRECISION NOT NULL,
    "data_pagamento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusPagamento" NOT NULL DEFAULT 'pendente',
    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable historico_score
CREATE TABLE "historico_score" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "alteracao" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "historico_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable logs
CREATE TABLE "logs" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "dados" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "emprestimos" ADD CONSTRAINT "emprestimos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_emprestimo_id_fkey" FOREIGN KEY ("emprestimo_id") REFERENCES "emprestimos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_emprestimo_id_fkey" FOREIGN KEY ("emprestimo_id") REFERENCES "emprestimos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "historico_score" ADD CONSTRAINT "historico_score_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
