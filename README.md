# GPCrédito — Sistema de Empréstimos

Sistema financeiro para gestão de empréstimos, clientes, parcelas, pagamentos, contratos e cobranças.

## Tecnologias

- Backend: Node.js, Express, Prisma
- Banco: PostgreSQL
- Frontend: base atual em HTML/CSS/JS, pasta preparada para migração React
- Integrações: Mercado Pago, WhatsApp
- Operação: contratos PDF, logs e uploads separados da aplicação

## Estrutura Profissional

```text
gpcredito/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── scripts/
│   │   ├── gerar_contrato.py
│   │   └── gerar_contrato_exemplo.py
│   ├── src/
│   │   ├── controllers/
│   │   ├── integrations/
│   │   ├── jobs/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── index.js
│   └── package.json
├── frontend/
│   ├── public/
│   │   └── dashboard.html
│   └── package.json
├── uploads/
│   └── .gitkeep
├── contratos/
├── logs/
├── package.json
├── package-lock.json
├── README.md
└── REGRAS_DE_NEGOCIO.md
```

## Arquivos Movidos

| Antes | Depois |
|---|---|
| `src/` | `backend/src/` |
| `prisma/` | `backend/prisma/` |
| `scripts/` | `backend/scripts/` |
| `public/dashboard.html` | `frontend/public/dashboard.html` |
| `contratos/` | `contratos/` |
| `logs/` | `logs/` |
| novo | `uploads/` |

## Instalação

```bash
npm install
```

Configure o `.env` na raiz do projeto com banco, senhas e tokens.

Variável importante para operações financeiras:

```bash
ALLOW_MULTIPLE_ACTIVE_OPERATIONS=false
```

Com `false`, o sistema bloqueia nova operação quando o cliente já possui uma operação ativa. Para liberar múltiplas operações abertas por cliente, altere para `true`.

## Banco de Dados

```bash
npm run db:migrate
npm run db:generate
```

Os scripts já apontam para `backend/prisma/schema.prisma`.

## Operações, Contratos e Documentos

- Cada novo empréstimo recebe um número interno único no formato `OP-ANO-SEQUENCIAL`, como `OP-2026-000001`.
- Cada operação pode ter contrato vinculado, salvo em `contratos/{clienteId}/{numeroOperacao}/contrato.pdf`.
- Documentos de cliente são opcionais e ficam em `uploads/clientes/{clienteId}/documentos/`.
- O banco salva apenas metadados e caminho do arquivo; documentos não são salvos em base64.
- Tipos aceitos para upload: JPG, PNG e PDF, com limite de 5MB por arquivo.
- Uploads, contratos e logs não devem ser enviados para o GitHub.

## Desenvolvimento

```bash
npm run dev
```

Acesse:

```text
http://localhost:3000
```

## Produção / VPS

```bash
npm install --omit=dev
npm run db:migrate
npm run db:generate
npm start
```

Diretórios operacionais para backup e persistência:

- `contratos/`
- `logs/`
- `uploads/`

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o backend com nodemon |
| `npm start` | Inicia o backend em modo produção |
| `npm run db:migrate` | Aplica migrations Prisma |
| `npm run db:generate` | Gera Prisma Client |
| `npm run db:studio` | Abre Prisma Studio |
| `npm run contract:example` | Gera contrato PDF de exemplo |

## API — Endpoints Principais

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/login` | Login do administrador |
| GET | `/api/clientes` | Listar clientes |
| POST | `/api/clientes` | Criar cliente |
| GET | `/api/clientes/:id/historico` | Histórico completo do cliente |
| POST | `/api/clientes/:id/documentos` | Enviar documento do cliente |
| GET | `/api/clientes/:id/documentos` | Listar documentos do cliente |
| GET | `/api/clientes/:id/documentos/:documentoId/download` | Baixar documento |
| DELETE | `/api/clientes/:id/documentos/:documentoId` | Excluir documento |
| DELETE | `/api/clientes/:id` | Excluir cliente |
| GET | `/api/emprestimos` | Listar empréstimos |
| POST | `/api/emprestimos` | Criar empréstimo |
| GET | `/api/operacoes/:numeroOperacao` | Detalhes da operação financeira |
| POST | `/api/operacoes/:numeroOperacao/contrato/aceitar` | Registrar aceite do contrato |
| POST | `/api/emprestimos/:id/pagar` | Confirmar pagamento manual |
| POST | `/api/emprestimos/:id/parcelas/:parcelaId/pagar` | Confirmar pagamento de uma parcela |
| DELETE | `/api/emprestimos/:id` | Excluir empréstimo |
| GET | `/api/inadimplentes` | Listar inadimplentes |
| GET | `/api/lucro` | Resumo financeiro |
| POST | `/api/webhook/mercadopago` | Webhook do Mercado Pago |
| GET | `/health` | Status do servidor |

Todas as rotas, exceto login e webhook, exigem:

```text
Authorization: Bearer <token>
```

## Como Testar a V1

1. Rode `npm run db:migrate` e `npm run db:generate`.
2. Inicie com `npm run dev`.
3. Crie um cliente sem documentos para confirmar que documentos não são obrigatórios.
4. Crie um empréstimo e confira o número `OP-...` na listagem, no histórico do cliente e no contrato.
5. Abra o cliente, use a aba `Documentos` e envie RG frente, RG verso ou comprovante quando desejar.
6. Abra uma operação parcelada e liquide uma parcela por vez.
7. Teste `ALLOW_MULTIPLE_ACTIVE_OPERATIONS=false` criando nova operação para cliente com operação ativa; o sistema deve bloquear.

## Observação Sobre React

A pasta `frontend/` já separa a camada visual e está pronta para receber uma aplicação React/Vite em uma próxima etapa. Nesta reorganização, o frontend atual foi preservado para não alterar comportamento nem regras de negócio.
