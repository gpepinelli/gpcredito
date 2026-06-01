CREATE TYPE "TipoConfiguracao" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'TIME');
CREATE TYPE "CategoriaConfiguracao" AS ENUM ('CREDITO', 'SCORE', 'COBRANCA', 'VENDAS', 'PIX', 'SISTEMA');

CREATE TABLE "configuracoes" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "tipo" "TipoConfiguracao" NOT NULL,
    "categoria" "CategoriaConfiguracao" NOT NULL,
    "descricao" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuracoes_chave_key" ON "configuracoes"("chave");
CREATE INDEX "configuracoes_categoria_idx" ON "configuracoes"("categoria");
