CREATE TABLE IF NOT EXISTS "login_rate_limits" (
  "id" TEXT NOT NULL,
  "chave" TEXT NOT NULL,
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "bloqueado_ate" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "login_rate_limits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "login_rate_limits_chave_key" ON "login_rate_limits"("chave");
