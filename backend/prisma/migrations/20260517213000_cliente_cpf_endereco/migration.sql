ALTER TABLE "clientes" ADD COLUMN "cpf" TEXT;
ALTER TABLE "clientes" ADD COLUMN "endereco" TEXT;

CREATE UNIQUE INDEX "clientes_cpf_key" ON "clientes"("cpf");
