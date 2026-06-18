# Regras de Negocio - GPCredito V2

Este documento e a referencia funcional do sistema. Quando houver divergencia entre documentacao e codigo, esta regra deve ser atualizada junto com a implementacao.

## 1. Clientes

### Cadastro

- Cliente deve ter nome, telefone, CPF e endereco.
- Telefone deve ser unico.
- CPF e opcional no banco, mas o formulario principal da V2 exige CPF e valida no backend.
- CPF e salvo somente com numeros.
- Score inicial do cliente vem de `SCORE_INICIAL` (padrao 100).
- Documentos sao opcionais:
  - RG frente
  - RG verso
  - comprovante de residencia
- Upload aceito segue `UPLOAD_TIPOS_PERMITIDOS` e `UPLOAD_TAMANHO_MAXIMO_MB` (padrao JPG, PNG ou PDF, ate 5MB).

### Exclusao

- Excluir cliente exige `ADMIN_DELETE_PASSWORD`.
- A exclusao remove dados vinculados:
  - emprestimos
  - parcelas
  - pagamentos
  - contratos
  - documentos
  - historico de score
  - vendas vinculadas ao cliente
- Arquivos fisicos de documentos e contratos tambem devem ser removidos quando possivel.
- Operacao irreversivel.

## 2. Score de credito

### Faixas

| Score | Nivel | Regra |
|---|---|---|
| `SCORE_LIMITE_RISCO_MEDIO` ate `SCORE_MAXIMO` | Confiavel | Credito liberado |
| `SCORE_LIMITE_BLOQUEADO` ate abaixo de `SCORE_LIMITE_RISCO_MEDIO` | Risco medio | Credito liberado com alerta |
| Abaixo de `SCORE_LIMITE_BLOQUEADO` | Bloqueado | Novo credito negado |

### Alteracoes

| Evento | Alteracao |
|---|---|
| Pagamento antecipado | `SCORE_PAGAMENTO_ANTECIPADO` |
| Pagamento em dia | `SCORE_PAGAMENTO_EM_DIA` |
| Atraso ate 3 dias | `SCORE_ATRASO_ATE_3_DIAS` |
| Atraso de 4 a 7 dias | `SCORE_ATRASO_4_A_7_DIAS` |
| Atraso acima de 7 dias | `SCORE_ATRASO_ACIMA_7_DIAS` |
| Inadimplencia com atraso configurado | `SCORE_PENALIDADE_INADIMPLENCIA` |

- Score minimo vem de `SCORE_MINIMO`.
- Score maximo vem de `SCORE_MAXIMO`.
- Penalidade de inadimplencia e aplicada uma unica vez por operacao, usando flag no emprestimo.
- O painel deve exibir score com indicador visual:
  - verde/confiavel para 80+
  - amarelo/risco medio para 50 a 79
  - vermelho/bloqueado para 0 a 49
- O detalhe do cliente deve mostrar historico de alteracoes de score com motivo, data e score resultante.

## 3. Credito

### Criacao

- Valor minimo vem de `VALOR_MINIMO_EMPRESTIMO` (padrao R$ 10,00).
- Valor maximo vem de `VALOR_MAXIMO_EMPRESTIMO`.
- Juros permitido segue `JUROS_MINIMO` e `JUROS_MAXIMO` (padrao 0% a 100%).
- Juros pre-preenchido no formulario vem de `JUROS_PADRAO`.
- Numero de parcelas segue `PARCELAS_MINIMAS` e `PARCELAS_MAXIMAS` (padrao 1 a 60).
- Intervalo entre parcelas vem de `INTERVALO_PARCELAS_DIAS` (padrao 30 dias).
- Primeiro vencimento vem de `DIAS_PRIMEIRO_VENCIMENTO`.
- Por padrao, cliente nao pode ter mais de uma operacao ativa.
- `ALLOW_MULTIPLE_ACTIVE_OPERATIONS=true` permite multiplas operacoes ativas.
- Status ativos:
  - `AGUARDANDO_ACEITE`
  - `APROVADO`
  - `LIBERADO`
  - `EM_DIA`
  - `ATRASADO`
- Status finais:
  - `QUITADO`
  - `CANCELADO`
  - `RECUSADO`

### Numeracao

- Operacao: `OP-ANO-SEQUENCIAL`, exemplo `OP-2026-000001`.
- Contrato: `CT-ANO-SEQUENCIAL`.

### Contrato e aceite

- Ao criar uma operacao, o sistema gera contrato PDF.
- O contrato fica em `storage/contratos/{nome-cliente}/emprestimos/{numeroOperacao}/contrato.pdf`.
- Contratos antigos em `contratos/` continuam sendo reconhecidos para remocao e compatibilidade.
- Operacao nasce como `AGUARDANDO_ACEITE`.
- Aceite pode ocorrer por WhatsApp ou manualmente no painel.
- Apos aceite, status muda para `APROVADO`.
- Apos entrega do dinheiro, admin marca como `LIBERADO`.

### Calculo de juros do credito

Credito usa juros amortizado sobre saldo devedor.

```text
amortizacao = principal / parcelas
juros da parcela = saldo devedor atual * percentual
valor da parcela = amortizacao + juros da parcela
saldo devedor novo = saldo devedor atual - amortizacao
```

Exemplo com R$ 1.000,00, 30%, 3 parcelas:

```text
Parcela 1: saldo 1000,00 -> juros 300,00 -> parcela 633,33
Parcela 2: saldo 666,67 -> juros 200,00 -> parcela 533,33
Parcela 3: saldo 333,34 -> juros 100,00 -> parcela 433,34
Total: 1600,00
```

- A ultima amortizacao ajusta diferenca de centavos para zerar saldo.
- Credito nao usa juros normal sobre valor total. Essa regra e somente para vendas.

### Pagamentos

- Pagamento manual pode quitar valor parcial ou total.
- Pagamento de parcela liquida a parcela selecionada.
- Botao "Pagar prox." paga a proxima parcela pendente.
- Emprestimo so vira `pago` e operacao so vira `QUITADO` quando quitado totalmente.
- Se uma operacao atrasada receber pagamento parcial, continua `ATRASADO` ate quitar ou ser regularizada por regra futura.
- Todo pagamento confirmado gera recibo PDF em `storage/recibos/{nome-cliente}/recibo-{parcela-id-ou-pagamento-id}.pdf`.
- O recibo fica vinculado em `pagamentos.caminho_pdf`, registrado em `arquivos_pdf` com tipo `RECIBO` e pode ser enviado automaticamente pelo WhatsApp.
- Score e alterado na quitacao total, conforme atraso no vencimento final.
- Renegociacao de prazo altera o vencimento, registra log administrativo e retorna a operacao para `EM_DIA`.
- Cobranca WhatsApp em lote pode ser disparada manualmente para operacoes selecionadas.

## 4. Cobrancas e Pix

- Cron roda nos horarios configurados em `COBRANCA_HORA_MANHA` e `COBRANCA_HORA_TARDE` (padrao 09:00 e 18:00).
- Renovacoes sao verificadas em `RENOVACAO_HORA` (padrao 09:30).
- O timezone dos crons vem de `TIMEZONE` (padrao America/Sao_Paulo).
- Vence amanha: envia lembrete.
- Vence hoje: envia cobranca/Pix.
- Atrasado: envia cobranca de atraso.
- A partir de `DIAS_INADIMPLENCIA_PENALIDADE` dias de atraso, aplica penalidade de inadimplencia uma vez.
- O painel permite reenviar Pix manualmente.
- O painel exibe status do adaptador WhatsApp e mensagens na fila.
- Se `PIX_CHAVE` estiver configurada, o sistema envia Pix manual.
- Mercado Pago e opcional; webhook confirma pagamento aprovado quando configurado.
- Textos de WhatsApp ficam em parametros operacionais e usam placeholders como `{{nome}}`, `{{valor}}`, `{{dataVencimento}}`, `{{diasAtraso}}`, `{{chavePix}}`, `{{nomePix}}` e `{{copiaCola}}`.

## 5. Orcamentos

- Orcamento e simulacao, nao contrato.
- Pode ser gerado com cliente existente ou sem cliente vinculado.
- Usa a mesma funcao de calculo de parcelas do credito.
- O PDF deve conter:
  - nome da empresa
  - data de emissao
  - validade de 24 horas
  - dados do cliente quando informado
  - tabela completa de parcelas
  - aviso de que e simulacao e nao contrato
  - rodape com nome do sistema
- PDFs de orcamento ficam em `storage/orcamentos/{nome-cliente}/orcamento-{id}.pdf`.
- Status possiveis:
  - `PENDENTE`
  - `CONVERTIDO`
  - `EXPIRADO`
- Orcamentos pendentes vencidos devem ser deletados automaticamente apos 24 horas.
- Ao deletar um orcamento vencido, o sistema tambem remove o PDF e o registro correspondente em `arquivos_pdf`.
- Orcamento pendente pode ser reaberto, reenviado pelo WhatsApp ou convertido em operacao.
- Orcamento pode ser excluido manualmente com senha de exclusao; a exclusao remove o PDF e o registro em `arquivos_pdf`.
- Converter orcamento preenche a tela de nova operacao com cliente, valor, juros, parcelas e vencimento.

## 6. Renovacao

- A oferta de renovacao so pode ser enviada apos `RENOVACAO_DIAS_APOS_QUITACAO` dias da quitacao (padrao 15).
- A oferta nao e enviada se o cliente ja tiver nova operacao apos a quitacao.
- Cada operacao quitada recebe oferta no maximo uma vez.

## 7. Vendas de carros, motos e celulares

### Cadastro de produtos

Cada modulo possui cadastro proprio:

- Carros: placa ou chassi.
- Motos: placa ou chassi.
- Celulares: IMEI ou numero de serie.

Campos comuns:

- tipo
- titulo
- marca
- modelo
- ano
- identificador unico
- valor de custo
- valor base de venda
- status

### Regra de juros de venda

Vendas usam juros normal sobre o valor base. O percentual vem de `JUROS_VENDA_PADRAO` (padrao 30%).

```text
total com juros = valor base * 1,30
saldo parcelado = total com juros - entrada
valor da parcela = saldo parcelado / parcelas
```

Exemplo:

```text
Valor base: 1000,00
Juros normal: 30%
Total com juros: 1300,00
Entrada: 300,00
Parcelas: 10
Valor da parcela: 100,00
```

- Essa regra nao se aplica ao credito.
- Venda grava:
  - valor base
  - percentual de juros
  - total com juros
  - entrada
  - numero de parcelas
  - valor da parcela
  - observacao

### Cancelamento e exclusao

- Venda concluida pode ser cancelada; produto volta para `DISPONIVEL`.
- Produto so pode ser excluido se nao tiver venda concluida vinculada.
- Excluir produto exige senha de exclusao.

## 8. Relatorios

### Credito

- Resumo financeiro total.
- Relatorio mensal.
- Exportacao de emprestimos, clientes e pagamentos.
- Inadimplentes.
- Aging de inadimplencia por faixas: 1-7, 8-15, 16-30 e 30+ dias.

### Vendas

- Faturamento.
- Lucro estimado.
- Vendas concluidas.
- Ticket medio.
- Resultado por tipo: carro, moto e celular.
- Exportacao CSV.

## 9. Painel operacional

- Busca global por cliente ou operacao.
- Clientes possuem paginacao e busca server-side.
- Aba ativa e filtros de credito sao salvos no navegador.
- A interface deve ser responsiva:
  - no mobile, sidebar vira menu lateral acionado por botao
  - listagens principais viram cards com rotulos por campo
  - modais ocupam a largura util do celular
- Clientes, credito e relatorio de vendas devem permitir ordenacao clicavel por colunas principais.
- Configuracoes operacionais ficam na aba Configuracoes e sao salvas no banco.
- Ordem de fallback de qualquer chave operacional: banco -> `.env` -> padrao de fabrica.
- Configuracoes possuem tipo (`STRING`, `NUMBER`, `BOOLEAN`, `TIME`), categoria, descricao e obrigatoriedade.
- Valores numericos e horarios devem ser validados antes de salvar.
- O backend usa cache em memoria com TTL de 5 minutos para leitura de configuracoes.
- Cada parametro pode ser salvo ou restaurado individualmente.
- Restaurar todos os padroes exige senha de exclusao.
- Configuracoes sensiveis de infraestrutura continuam no `.env`:
  - banco de dados
  - senha admin
  - senha de exclusao
  - segredo do token
  - adaptador/credenciais externas do WhatsApp
- "Agenda do Dia" agrupa:
  - vencendo hoje
  - atrasados
  - aguardando aceite
  - aprovados para liberar
- O painel financeiro deve mostrar o capital aprovado e pronto para liberar, somando o principal das operacoes com `statusOperacao = APROVADO`.
- O painel pode ocultar/mostrar valores financeiros sensiveis no navegador.
- Linha atrasada e destacada.
- Pix pode ser copiado com um clique.
- Detalhe do cliente pode ser impresso.
- Relatorios exibem ultimas acoes administrativas registradas no banco.
- Acoes criticas no painel devem usar modais proprios e feedback via toast; nao usar `window.prompt`, `window.confirm` ou `window.alert` nos fluxos principais.

## 10. Autenticacao e seguranca

- Login por senha unica de administrador.
- Token de sessao com HMAC-SHA256.
- Token valido pelo valor de `TOKEN_EXPIRACAO_HORAS` (padrao 8 horas).
- Login possui rate limit.
- Exclusoes exigem senha separada ou fallback para senha admin.
- Senhas e tokens sao mascarados nos logs.

## 11. Arquivos e persistencia

- PDFs operacionais: `storage/`.
- Contratos novos: `storage/contratos/`.
- Orcamentos: `storage/orcamentos/`.
- Cobrancas: `storage/cobranças/`.
- Recibos: `storage/recibos/`.
- Uploads: `uploads/`.
- Logs: `logs/`.
- Essas pastas devem entrar no backup, mas nao no GitHub.
- Backup manual/agendavel do PostgreSQL usa `npm run backup:db`, gerando dumps em `backups/`.
- A tabela `arquivos_pdf` registra cada PDF gerado com tipo, origem, cliente, caminho e data.
- Pagamentos com recibo tambem devem preencher `pagamentos.caminho_pdf`.
- O sistema nunca deve sobrescrever PDF existente; quando necessario, adiciona sufixo numerico.

## 12. Configuracoes operacionais

### Credito

- `JUROS_PADRAO`
- `JUROS_MINIMO`
- `JUROS_MAXIMO`
- `VALOR_MINIMO_EMPRESTIMO`
- `VALOR_MAXIMO_EMPRESTIMO`
- `PARCELAS_MINIMAS`
- `PARCELAS_MAXIMAS`
- `INTERVALO_PARCELAS_DIAS`
- `ALLOW_MULTIPLE_ACTIVE_OPERATIONS`
- `DIAS_PRIMEIRO_VENCIMENTO`

### Score

- `SCORE_INICIAL`
- `SCORE_MINIMO`
- `SCORE_MAXIMO`
- `SCORE_LIMITE_BLOQUEADO`
- `SCORE_LIMITE_RISCO_MEDIO`
- `SCORE_PAGAMENTO_ANTECIPADO`
- `SCORE_PAGAMENTO_EM_DIA`
- `SCORE_ATRASO_ATE_3_DIAS`
- `SCORE_ATRASO_4_A_7_DIAS`
- `SCORE_ATRASO_ACIMA_7_DIAS`
- `SCORE_PENALIDADE_INADIMPLENCIA`

### Cobranca

- `COBRANCA_HORA_MANHA`
- `COBRANCA_HORA_TARDE`
- `RENOVACAO_HORA`
- `DIAS_INADIMPLENCIA_PENALIDADE`
- `RENOVACAO_DIAS_APOS_QUITACAO`

### Vendas

- `JUROS_VENDA_PADRAO`
- `VALOR_MINIMO_VENDA`

### Pix e pagamento

- `PIX_CHAVE`
- `PIX_NOME`
- `PIX_CIDADE`
- `MERCADOPAGO_ATIVO`

### WhatsApp

- `WHATSAPP_TEMPLATE_LEMBRETE`
- `WHATSAPP_TEMPLATE_VENCIMENTO_HOJE`
- `WHATSAPP_TEMPLATE_PIX_MANUAL`
- `WHATSAPP_TEMPLATE_ATRASO`
- `WHATSAPP_TEMPLATE_CONFIRMACAO`
- `WHATSAPP_TEMPLATE_RECIBO`
- `WHATSAPP_TEMPLATE_RENOVACAO`
- `WHATSAPP_TEMPLATE_PIX_GERADO`
- `WHATSAPP_TEMPLATE_CONTRATO_AVISO`
- `WHATSAPP_TEMPLATE_CONTRATO`
- `WHATSAPP_TEMPLATE_ORCAMENTO`

### Sistema

- `NOME_EMPRESA`
- `TOKEN_EXPIRACAO_HORAS`
- `UPLOAD_TAMANHO_MAXIMO_MB`
- `UPLOAD_TIPOS_PERMITIDOS`
- `LOG_NIVEL`
- `TIMEZONE`

## 13. Pendencias recomendadas

- Multiusuario com permissoes.
- Ampliar cobertura de testes automatizados para services e controllers.
- Adicionar auditoria detalhada para alteracoes feitas em configuracoes.
- Separar as paginas restantes de `App.jsx` em arquivos dedicados.
