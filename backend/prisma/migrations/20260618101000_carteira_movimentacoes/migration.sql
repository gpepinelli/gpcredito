CREATE TYPE "TipoMovimentacaoCarteira" AS ENUM ('ENTRADA', 'SAIDA');

CREATE TABLE "carteira_movimentacoes" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentacaoCarteira" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT,
    "emprestimo_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carteira_movimentacoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "carteira_movimentacoes_tipo_idx" ON "carteira_movimentacoes"("tipo");
CREATE INDEX "carteira_movimentacoes_emprestimo_id_idx" ON "carteira_movimentacoes"("emprestimo_id");

ALTER TABLE "carteira_movimentacoes" ADD CONSTRAINT "carteira_movimentacoes_emprestimo_id_fkey" FOREIGN KEY ("emprestimo_id") REFERENCES "emprestimos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
