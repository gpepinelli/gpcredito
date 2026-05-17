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

## Banco de Dados

```bash
npm run db:migrate
npm run db:generate
```

Os scripts já apontam para `backend/prisma/schema.prisma`.

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
| DELETE | `/api/clientes/:id` | Excluir cliente |
| GET | `/api/emprestimos` | Listar empréstimos |
| POST | `/api/emprestimos` | Criar empréstimo |
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

## Observação Sobre React

A pasta `frontend/` já separa a camada visual e está pronta para receber uma aplicação React/Vite em uma próxima etapa. Nesta reorganização, o frontend atual foi preservado para não alterar comportamento nem regras de negócio.
