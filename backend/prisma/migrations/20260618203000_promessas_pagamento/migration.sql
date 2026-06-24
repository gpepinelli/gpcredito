CREATE TYPE "StatusPromessaPagamento" AS ENUM ('PENDENTE', 'CUMPRIDA', 'NAO_CUMPRIDA', 'CANCELADA');

CREATE TABLE "promessas_pagamento" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "emprestimo_id" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "data_prometida" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "status" "StatusPromessaPagamento" NOT NULL DEFAULT 'PENDENTE',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promessas_pagamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "promessas_pagamento_cliente_id_idx" ON "promessas_pagamento"("cliente_id");
CREATE INDEX "promessas_pagamento_emprestimo_id_idx" ON "promessas_pagamento"("emprestimo_id");
CREATE INDEX "promessas_pagamento_status_idx" ON "promessas_pagamento"("status");

ALTER TABLE "promessas_pagamento" ADD CONSTRAINT "promessas_pagamento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promessas_pagamento" ADD CONSTRAINT "promessas_pagamento_emprestimo_id_fkey" FOREIGN KEY ("emprestimo_id") REFERENCES "emprestimos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
