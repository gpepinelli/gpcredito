-- CreateEnum
CREATE TYPE "TipoProdutoVenda" AS ENUM ('CARRO', 'MOTO', 'CELULAR');

-- CreateEnum
CREATE TYPE "StatusProdutoVenda" AS ENUM ('DISPONIVEL', 'RESERVADO', 'VENDIDO', 'INATIVO');

-- CreateEnum
CREATE TYPE "StatusVendaProduto" AS ENUM ('ABERTA', 'CONCLUIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "produtos_venda" (
    "id" TEXT NOT NULL,
    "tipo" "TipoProdutoVenda" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "ano" INTEGER,
    "identificador" TEXT,
    "valor_custo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valor_venda" DOUBLE PRECISION NOT NULL,
    "status" "StatusProdutoVenda" NOT NULL DEFAULT 'DISPONIVEL',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas_produto" (
    "id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "comprador_nome" TEXT NOT NULL,
    "comprador_telefone" TEXT,
    "valor_venda" DOUBLE PRECISION NOT NULL,
    "valor_entrada" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "observacao" TEXT,
    "status" "StatusVendaProduto" NOT NULL DEFAULT 'ABERTA',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em" TIMESTAMP(3),

    CONSTRAINT "vendas_produto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "produtos_venda_identificador_key" ON "produtos_venda"("identificador");

-- CreateIndex
CREATE INDEX "produtos_venda_tipo_idx" ON "produtos_venda"("tipo");

-- CreateIndex
CREATE INDEX "produtos_venda_status_idx" ON "produtos_venda"("status");

-- CreateIndex
CREATE INDEX "vendas_produto_produto_id_idx" ON "vendas_produto"("produto_id");

-- CreateIndex
CREATE INDEX "vendas_produto_cliente_id_idx" ON "vendas_produto"("cliente_id");

-- CreateIndex
CREATE INDEX "vendas_produto_status_idx" ON "vendas_produto"("status");

-- AddForeignKey
ALTER TABLE "vendas_produto" ADD CONSTRAINT "vendas_produto_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos_venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_produto" ADD CONSTRAINT "vendas_produto_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
