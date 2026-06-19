# GPCredito V2

Sistema operacional para gestao de credito, clientes, documentos, contratos, cobrancas, vendas de carros, motos e celulares.

## Stack

- Backend: Node.js, Express, Prisma
- Banco: PostgreSQL
- Frontend: React + Vite
- Integracoes: WhatsApp via Baileys ou mock, Mercado Pago opcional
- Arquivos operacionais: PDFs em `storage/`, uploads e logs em pastas locais

## Estrutura

```text
backend/
  prisma/
    schema.prisma
    migrations/
  scripts/
    gerar_contrato.py
    gerar_contrato_exemplo.py
    gerar_orcamento.py
    gerar_recibo.py
  src/
    controllers/
    integrations/
    jobs/
    lib/
    routes/
    services/
    utils/
    index.js
frontend/
  src/
    App.jsx
    components/
      common.jsx
      layout.jsx
      modals.jsx
    hooks/
      useOrdenacao.js
    lib/
      api.js
      constants.js
      finance.js
      format.js
    pages/
      reports.jsx
    main.jsx
    styles.css
  index.html
  vite.config.js
contratos/
storage/
logs/
uploads/
README.md
REGRAS_DE_NEGOCIO.md
```

`frontend/public/dashboard.html` ainda existe como legado/fallback, mas a interface principal da V2 e o fluxo ativo estao em React.

## Instalacao

```bash
npm install
npm --prefix frontend install
```

Crie o `.env` na raiz usando `.env.example` como base.

Variaveis principais:

```env
DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/gpcredito?schema=public"
PORT=3000
APP_URL="http://localhost:3000"
CORS_ORIGIN="http://localhost:5173,http://localhost:3000"
ADMIN_PASSWORD="troque-esta-senha"
ADMIN_DELETE_PASSWORD="troque-esta-senha-de-exclusao"
ADMIN_TOKEN_SECRET="troque-este-segredo-longo-e-aleatorio"
WHATSAPP_ADAPTER=mock
MERCADOPAGO_ACCESS_TOKEN=""
MERCADOPAGO_ATIVO=false
PIX_AUTOMATICO_VENCIMENTO=false
MP_WEBHOOK_SECRET=""
PIX_CHAVE=""
PIX_NOME=""
```

As regras operacionais de credito, score, cobranca, vendas, Pix e sistema podem ser ajustadas na aba **Configuracoes** do painel. O `.env` continua sendo o fallback inicial e tambem guarda dados sensiveis de infraestrutura, como banco, senhas, segredo do token e credenciais externas.

Para Mercado Pago em producao, configure tambem `MP_WEBHOOK_SECRET`. Sem essa chave o webhook continua aceitando eventos para manter compatibilidade, mas com a chave configurada o backend valida o `x-signature` antes de processar pagamentos.

## Banco de dados

```bash
npm run db:migrate
npm run db:generate
```

## Desenvolvimento

Backend:

```bash
npm run dev
```

Frontend React:

```bash
npm run frontend:dev
```

Testes automatizados:

```bash
npm test
```

URLs:

```text
Backend/API: http://localhost:3000
Frontend dev: http://localhost:5173
```

Se aparecer `EADDRINUSE :3000`, ja existe outro Node usando a porta 3000. Encerre o processo antigo ou reinicie o terminal.

## Build

```bash
npm run frontend:build
npm start
```

O backend serve `frontend/dist` quando o build existe.

## Scripts

| Comando | Descricao |
|---|---|
| `npm run dev` | Inicia backend com nodemon |
| `npm start` | Inicia backend em producao |
| `npm run frontend:dev` | Inicia Vite/React |
| `npm run frontend:build` | Gera build React |
| `npm run db:migrate` | Aplica migrations Prisma |
| `npm run db:generate` | Gera Prisma Client |
| `npm run db:studio` | Abre Prisma Studio |
| `npm run contract:example` | Gera contrato PDF de exemplo |
| `npm run backup:db` | Gera backup PostgreSQL em `backups/` |

## Modulos da V2

### Clientes

- Cadastro com nome, CPF, telefone e endereco.
- CPF validado no backend.
- Documentos opcionais: RG frente, RG verso e comprovante de residencia.
- Upload de documentos valida extensao, mimetype e assinatura real do arquivo para JPG, PNG e PDF.
- Detalhe do cliente com dados, resumo financeiro, operacoes, parcelas, acordos, contratos e documentos.
- Criacao de nova operacao direto do detalhe do cliente.
- Impressao limpa do resumo do cliente.

### Credito

- Juros de credito calculado sobre saldo devedor.
- Operacoes parceladas usam parcela fixa pelo total SAC calculado.
- O total e calculado pela amortizacao sobre saldo devedor e depois dividido em parcelas iguais.
- Numeracao de operacoes e contratos usa contador atomico no banco por ano, evitando duplicidade em criacoes simultaneas.
- Aceite manual do contrato.
- Liberacao do dinheiro apos aprovacao.
- Pagamento manual e pagamento de parcela.
- Confirmacao de pagamento gera recibo PDF em `storage/recibos/`, vincula em `pagamentos.caminho_pdf` e tenta enviar pelo WhatsApp.
- Recibos podem ser reenviados pelo detalhe do cliente.
- Promessas de pagamento podem ser registradas por operacao.
- Botao rapido para pagar proxima parcela.
- Reenvio de contrato e Pix.
- Observacao por operacao.
- Filtros por busca, status e periodo.
- Paginacao da listagem.
- Renegociacao de prazo com registro em log.
- Cobranca WhatsApp em lote para operacoes selecionadas.
- Linhas atrasadas destacadas.
- Aba "Agenda do Dia" com vencimentos, atrasos, contratos aguardando aceite e operacoes aprovadas para liberar.

### Orcamentos

- Aba propria para simular credito antes de criar operacao.
- Pode usar cliente existente ou simulacao sem cliente.
- Mostra resumo instantaneo com valor emprestado, total de juros, total a pagar e parcelas.
- Usa a mesma regra de parcelas amortizadas do credito.
- Gera PDF de orcamento com validade de 24 horas.
- Salva historico enquanto o orcamento estiver valido ou convertido.
- Permite reabrir, reenviar por WhatsApp ou converter orcamento pendente em operacao.
- Permite excluir orcamento manualmente com senha de exclusao, removendo tambem o PDF.
- Cron horario remove automaticamente orcamentos pendentes vencidos apos 24 horas, apagando tambem o PDF salvo.

### Vendas

- Cadastro separado para carros, motos e celulares.
- Campos adaptados por tipo: placa/chassi para carro e moto; IMEI/serial para celular.
- Venda com juros normal fixo de 30% sobre o valor base do item.
- Entrada opcional.
- Parcelas iguais sobre o saldo depois da entrada.
- Relatorio de vendas com base, total com juros, entrada, parcelas, valor da parcela e lucro estimado.
- Cancelamento de venda.
- Exclusao de produto sem venda concluida vinculada.

### Mobile e usabilidade

- Layout responsivo para celular e tablet.
- Menu lateral vira gaveta com botao de menu no mobile.
- Listagens principais viram cards no mobile para evitar tabela espremida.
- Ordenacao clicavel em clientes, credito e relatorio de vendas.
- Tela de configuracoes operacionais dentro do painel administrativo.
- Configuracoes agrupadas por Credito, Score, Cobranca, Vendas, Pix, WhatsApp e Sistema.
- Cada parametro tem salvamento individual, restauracao individual e destaque quando foi alterado em relacao ao padrao.
- Restaurar todos os padroes exige senha de exclusao.
- Banco, senha admin, senha de exclusao, segredo do token e adaptador WhatsApp continuam no `.env`.
- Painel financeiro possui ocultacao de valores, carteira operacional configuravel, capital aprovado para liberar e saldo restante.
- Aba Carteira concentra saldo, entradas, saidas, historico de movimentacoes e exportacao CSV.
- Ao marcar uma operacao aprovada como liberada, o principal e debitado automaticamente da carteira.
- Operacoes ja liberadas antes do modulo de carteira sao sincronizadas automaticamente como saida.
- Saidas manuais e liberacoes usam lock transacional no banco para evitar duas saidas simultaneas aprovarem o mesmo saldo.

### Configuracoes operacionais

As configuracoes sao salvas no banco na tabela `configuracoes`.

Ordem de fallback:

```text
valor salvo no banco -> .env -> padrao de fabrica hardcoded
```

O backend mantem cache em memoria com TTL de 5 minutos para reduzir consultas ao banco. Alteracoes feitas pelo painel limpam/atualizam o cache imediatamente.

Categorias disponiveis:

| Categoria | Exemplos |
|---|---|
| Credito | capital inicial da carteira, juros padrao, limites de juros/valor/parcelas, vencimento e multiplas operacoes |
| Score | score inicial, faixas de risco e pontuacoes por pagamento/atraso |
| Cobranca | horarios dos crons, dias de penalidade e renovacao |
| Vendas | juros normal de venda e valor minimo |
| Pix | chave, nome, cidade, Mercado Pago ativo e Pix automatico no vencimento |
| WhatsApp | templates de lembrete, cobranca, atraso, contrato, orcamento, Pix, confirmacao e recibo |
| Sistema | nome da empresa, expiracao do token, upload, logs e timezone |

Os templates de WhatsApp aceitam placeholders como `{{nome}}`, `{{valor}}`, `{{dataVencimento}}`, `{{diasAtraso}}`, `{{chavePix}}`, `{{nomePix}}` e `{{copiaCola}}`.

Observacao: alteracoes em horarios de cron entram em vigor na proxima inicializacao do backend. Parametros usados em operacoes novas, score, upload, pagamentos e mensagens passam a valer imediatamente.

`CARTEIRA_OPERACIONAL` representa o capital inicial/proprio informado pelo admin. Entradas, saidas e liberacoes de credito ficam registradas em `carteira_movimentacoes`, e o saldo atual e calculado como:

```text
CARTEIRA_OPERACIONAL + entradas - saidas - creditos liberados
```

### Organizacao do frontend

- `main.jsx` e apenas o ponto de entrada do React.
- `App.jsx` concentra a orquestracao das telas e estados principais.
- `components/common.jsx` guarda componentes pequenos compartilhados, como score, status e ordenacao.
- `components/layout.jsx` guarda shell, login, modal base, busca global, cards de estatistica e toast.
- `components/modals.jsx` guarda modais de pagamento, parcelas, exclusao, observacao, renegociacao e detalhe do cliente.
- `lib/` guarda API, formatacao, constantes e regras puras de calculo/estado.
- `pages/reports.jsx` guarda relatorios e configuracoes.

### Storage de PDFs

O sistema usa `storageService.js` para centralizar os caminhos e evitar sobrescrita. Quando um arquivo ja existe, o servico adiciona sufixo numerico automaticamente.

Estrutura padrao:

```text
storage/
  contratos/{nome-cliente}/emprestimos/{numero-operacao}/contrato.pdf
  orcamentos/{nome-cliente}/orcamento-{id}.pdf
  cobranças/{nome-cliente}/cobranca-{data}.pdf
  recibos/{nome-cliente}/recibo-{parcela-id}.pdf
```

Os PDFs gerados tambem sao registrados na tabela `arquivos_pdf`, com tipo, cliente, origem, caminho e data de criacao.
Recibos tambem atualizam o campo `pagamentos.caminho_pdf`, mantendo o pagamento ligado diretamente ao arquivo gerado.

## Regras de juros

Credito:

```text
Juros da parcela = saldo devedor atual * percentual
Total calculado = soma(amortizacao do principal + juros da parcela)
Parcela fixa = total calculado / quantidade de parcelas
```

Venda de item:

```text
Total com juros = valor base * 1,30
Valor parcelado = total com juros - entrada
Valor da parcela = valor parcelado / quantidade de parcelas
```

## API principal

Todas as rotas abaixo, exceto login, webhook e health, exigem:

```text
Authorization: Bearer <token>
```

### Autenticacao

| Metodo | Rota | Descricao |
|---|---|---|
| POST | `/api/auth/login` | Login do administrador |
| GET | `/health` | Status do servidor, banco, storage e WhatsApp |

### Clientes

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/clientes` | Lista clientes |
| POST | `/api/clientes` | Cria cliente |
| GET | `/api/clientes/:id` | Busca cliente |
| GET | `/api/clientes/:id/historico` | Historico completo |
| POST | `/api/clientes/:id/documentos` | Upload de documento |
| GET | `/api/clientes/:id/documentos` | Lista documentos |
| GET | `/api/clientes/:id/documentos/:documentoId/download` | Download de documento |
| DELETE | `/api/clientes/:id/documentos/:documentoId` | Exclui documento |
| DELETE | `/api/clientes/:id` | Exclui cliente com senha |

### Credito

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/emprestimos` | Lista operacoes com filtros e paginacao |
| POST | `/api/emprestimos` | Cria operacao |
| DELETE | `/api/emprestimos/:id` | Exclui operacao com senha |
| GET | `/api/emprestimos/alertas` | Alertas do dia |
| POST | `/api/emprestimos/:id/pagar` | Pagamento manual |
| POST | `/api/emprestimos/:id/parcelas/:parcelaId/pagar` | Paga parcela |
| POST | `/api/emprestimos/:id/aceitar` | Aceite manual |
| POST | `/api/emprestimos/:id/liberar` | Marca dinheiro como liberado |
| POST | `/api/emprestimos/:id/reenviar-contrato` | Reenvia contrato |
| POST | `/api/emprestimos/:id/reenviar-pix` | Reenvia Pix |
| POST | `/api/pagamentos/:id/reenviar-recibo` | Reenvia recibo de pagamento |
| POST | `/api/emprestimos/:id/promessas` | Registra promessa de pagamento |
| PATCH | `/api/promessas-pagamento/:id` | Atualiza status de promessa |
| POST | `/api/emprestimos/cobranca-lote` | Envia cobranca WhatsApp em lote |
| PATCH | `/api/emprestimos/:id/renegociar` | Renegocia vencimento |
| PATCH | `/api/emprestimos/:id/observacao` | Atualiza observacao |
| GET | `/api/operacoes/:numeroOperacao` | Busca operacao por numero |
| POST | `/api/operacoes/:numeroOperacao/contrato/aceitar` | Aceite via fluxo publico/controlado |
| GET | `/api/inadimplentes` | Lista inadimplentes |
| GET | `/api/lucro` | Resumo financeiro |
| GET | `/api/relatorio/mensal` | Relatorio mensal |
| GET | `/api/relatorio/export` | Dados para exportacao |

### Carteira

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/carteira` | Resumo e ultimas movimentacoes da carteira |
| GET | `/api/carteira/export` | Exporta movimentacoes em CSV |
| POST | `/api/carteira/movimentacoes` | Registra entrada ou saida manual |
| GET | `/api/fluxo-caixa` | Resumo de fluxo de caixa |

### Orcamentos

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/orcamentos` | Lista os ultimos orcamentos |
| POST | `/api/orcamentos` | Gera simulacao, salva PDF e registra historico |
| GET | `/api/orcamentos/:id` | Reabre orcamento e recalcula parcelas |
| POST | `/api/orcamentos/:id/enviar` | Envia PDF pelo WhatsApp |
| POST | `/api/orcamentos/:id/converter` | Marca orcamento como convertido |
| DELETE | `/api/orcamentos/:id` | Exclui orcamento com senha e remove PDF |

### Vendas

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/produtos-venda` | Lista produtos |
| POST | `/api/produtos-venda` | Cria produto |
| PATCH | `/api/produtos-venda/:id` | Atualiza produto |
| DELETE | `/api/produtos-venda/:id` | Exclui produto com senha |
| GET | `/api/vendas-produto` | Lista vendas |
| POST | `/api/vendas-produto` | Registra venda |
| POST | `/api/vendas-produto/:id/cancelar` | Cancela venda |
| GET | `/api/vendas/resumo` | Resumo de vendas |

### Webhook

| Metodo | Rota | Descricao |
|---|---|---|
| POST | `/api/webhook/mercadopago` | Confirmacao Mercado Pago; valida assinatura quando `MP_WEBHOOK_SECRET` estiver configurado |

Rotas inexistentes dentro de `/api` retornam JSON 404. Isso evita que um endpoint digitado errado caia no HTML do painel.

### Admin

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/admin/logs` | Ultimas acoes administrativas |
| GET | `/api/admin/whatsapp/status` | Status do WhatsApp |
| GET | `/api/admin/inadimplencia/aging` | Inadimplencia por faixa de atraso |

### Configuracoes

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/configuracoes` | Lista parametros com valor efetivo, padrao, tipo e categoria |
| PUT | `/api/configuracoes/:chave` | Atualiza uma configuracao com validacao por tipo |
| POST | `/api/configuracoes/reset/:chave` | Remove valor salvo e restaura fallback/padrao |
| POST | `/api/configuracoes/reset/todos` | Restaura todas as configuracoes usando senha de exclusao |

## Seguranca e operacao

- Login possui protecao em duas camadas: limite rapido por IP na rota e bloqueio persistido no banco em `login_rate_limits`.
- Webhook Mercado Pago pode validar `x-signature` usando `MP_WEBHOOK_SECRET`.
- Configuracoes desconhecidas nao usam fallback automatico para variaveis de ambiente sensiveis.
- O backend usa Helmet com politica conservadora para headers HTTP sem bloquear assets do painel.
- Os crons de cobranca, renovacao e expiracao de orcamentos possuem lock em memoria para impedir execucoes sobrepostas.
- Geradores Python recebem os dados por arquivo temporario, evitando JSON grande ou sensivel exposto como argumento de processo.
- `/health` retorna 503 quando o banco falha e mostra checks de database, storage e WhatsApp.

## Validacao feita nesta revisao

- `node --check` em todos os arquivos JS do backend.
- `npm test` para regras financeiras criticas.
- `npm run frontend:build`.
- `npx.cmd prisma validate --schema backend/prisma/schema.prisma`.
- `npm run db:generate`.
- `npm run db:migrate`.
- `npm run backup:db` disponivel para rotina manual ou agendada.

## Melhorias recomendadas

- Autenticacao multiusuario com permissoes.
- Separar as paginas restantes de `App.jsx` em arquivos dedicados.
- Adicionar auditoria detalhada para alteracoes feitas em configuracoes.
