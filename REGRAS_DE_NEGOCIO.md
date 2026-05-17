# Regras de Negócio — GPCrédito

Este documento descreve todas as regras de negócio do sistema de empréstimos.

---

## 1. CLIENTES

### 1.1 Cadastro
- Cada cliente é identificado pelo **telefone**, que deve ser único no sistema.
- O telefone deve conter apenas dígitos, espaços, hífens, parênteses ou `+`.
- Todo cliente começa com **score de crédito 100**.
- Não há limite de clientes cadastrados.

### 1.2 Exclusão
- A exclusão de um cliente remove **todos os seus dados** vinculados: empréstimos, parcelas, pagamentos e histórico de score.
- Requer a **senha de exclusão** (`ADMIN_DELETE_PASSWORD`) para ser executada.
- Operação irreversível.

---

## 2. SCORE DE CRÉDITO

### 2.1 Escala
| Faixa | Status | Efeito |
|-------|--------|--------|
| 80 – 200 | ✅ Confiável | Crédito liberado |
| 50 – 79  | ⚠️ Risco médio | Crédito liberado com cautela |
| 0 – 49   | 🚫 Bloqueado | Não pode tomar novo empréstimo |

- Score máximo: **200**
- Score mínimo: **0** (não vai abaixo de zero)
- Score inicial de todo cliente: **100**

### 2.2 Alterações automáticas
| Evento | Alteração |
|--------|-----------|
| Pagamento antecipado (antes do vencimento) | **+15 pontos** |
| Pagamento em dia | **+10 pontos** |
| Atraso de até 3 dias | **−10 pontos** |
| Atraso de 4 a 7 dias | **−15 pontos** |
| Atraso acima de 7 dias | **−25 pontos** |
| Inadimplência confirmada (8+ dias em atraso) | **−50 pontos** |

> A penalidade de inadimplência (−50) é aplicada **uma única vez**, no 8º dia de atraso, pelo cron job.

### 2.3 Regras de concessão
- Cliente com score **< 50** não pode receber novo empréstimo, mesmo que quite a dívida anterior.
- O score só melhora com pagamentos. Para sair do bloqueio, o cliente precisa pagar dívidas ativas e acumular pontos até atingir 50+.

---

## 3. EMPRÉSTIMOS

### 3.1 Criação
- Um cliente só pode ter **um empréstimo ativo** por vez (status `pendente` ou `atrasado`).
- Valor mínimo: **R$ 10,00**.
- Juros: de **0% a 100% ao mês** (compostos mensalmente).
- Prazo padrão: **30 dias** (para empréstimo de parcela única).
- O Pix **não é gerado no momento da criação** — é gerado pelo cron job no dia do vencimento.

### 3.2 Cálculo do valor total
```
Valor Total = Valor Principal × (1 + Juros%) ^ Meses
Exemplo: R$ 1.000 com 5% ao mês por 3 meses = R$ 1.157,63
```

### 3.3 Status possíveis
| Status | Significado |
|--------|-------------|
| `pendente` | Empréstimo ativo, dentro do prazo |
| `pago` | Totalmente quitado |
| `atrasado` | Passou da data de vencimento sem pagamento |

### 3.4 Pagamento
- O pagamento pode ser registrado **manualmente** pelo painel (campo "Valor pago").
- Ou **automaticamente** via webhook do Mercado Pago após confirmação do Pix.
- Ao confirmar o pagamento, o score do cliente é atualizado automaticamente.
- Após o pagamento total, o sistema aguarda **5 minutos** e envia uma mensagem de renovação via WhatsApp.

---

## 4. EMPRÉSTIMOS PARCELADOS

### 4.1 Como funciona
- O administrador escolhe o número de parcelas (1 a 60) ao criar o empréstimo.
- Intervalo fixo de **30 dias** entre parcelas.
- O valor total (principal + juros) é dividido igualmente entre as parcelas.
- Diferenças de centavos são ajustadas na **última parcela**.

### 4.2 Exemplo
```
Empréstimo: R$ 1.000 | Juros: 10% | 3 parcelas
Valor total: R$ 1.100
Parcela 1: R$ 366,67 — vence em 30 dias
Parcela 2: R$ 366,67 — vence em 60 dias
Parcela 3: R$ 366,66 — vence em 90 dias
```

### 4.3 Status das parcelas
| Status | Significado |
|--------|-------------|
| `pendente` | Aguardando pagamento |
| `pago` | Parcela quitada |
| `atrasado` | Passou do vencimento |

### 4.4 Regras de pagamento parcelado
- Ao registrar um pagamento, o sistema marca a **próxima parcela pendente** como paga.
- O empréstimo só muda para `pago` quando **todas as parcelas** forem quitadas.
- Enquanto houver parcelas pendentes, o status do empréstimo permanece `pendente`.
- Score é atualizado apenas na **quitação total** do empréstimo.

---

## 5. COBRANÇAS AUTOMÁTICAS (CRON JOB)

O sistema executa verificações automáticas **todos os dias às 09h00 e 18h00** (horário de Brasília).

### 5.1 Fluxo de cobranças
| Situação | Ação |
|----------|------|
| Vence amanhã | Envia lembrete via WhatsApp |
| Vence hoje | Gera Pix + envia código copia e cola |
| Atrasado (qualquer dia) | Envia cobrança firme via WhatsApp |
| 8+ dias atrasado | Aplica −50 no score (inadimplência) |
| Passou de `pendente` p/ atraso | Atualiza status para `atrasado` |

### 5.2 Envio do Pix
- O Pix é gerado **no dia do vencimento**, não antes.
- São enviadas **duas mensagens** no WhatsApp:
  1. Aviso de vencimento com instruções.
  2. Apenas o código copia e cola (para facilitar a cópia).
- Intervalo de 3 segundos entre as mensagens.
- O Pix não é gerado novamente se já existir `pixPaymentId`.

---

## 6. INTEGRAÇÃO MERCADO PAGO

- O Pix é gerado via API do Mercado Pago.
- O webhook em `/api/webhook/mercadopago` recebe notificações de pagamento aprovado.
- O sistema confirma o pagamento automaticamente ao receber o webhook com `status: approved`.
- Em modo simulado (sem token configurado), o Pix é gerado localmente com dados fictícios.
- Pagamentos duplicados (mesmo `pixPaymentId`) são ignorados.

---

## 7. INTEGRAÇÃO WHATSAPP

- Utiliza a biblioteca **Baileys** (conexão via QR code, sem custo de API).
- Modo padrão: **mock** (mensagens aparecem no terminal — útil para desenvolvimento).
- Para ativar o WhatsApp real: `WHATSAPP_ADAPTER=baileys` no `.env`.
- Mensagens que chegam enquanto o WhatsApp está desconectado são enfileiradas e enviadas na reconexão.

### 7.1 Templates de mensagens
| Gatilho | Mensagem |
|---------|----------|
| Vence amanhã | Lembrete de pagamento |
| Vence hoje | Aviso + código Pix (2 msgs) |
| Atrasado | Cobrança urgente com dias de atraso |
| Pagamento confirmado | Confirmação + agradecimento |
| Renovação (5 min após pagamento) | Oferta de novo empréstimo |

---

## 8. RELATÓRIOS

### 8.1 Relatório mensal
- Agrupa empréstimos por **mês de criação**.
- Exibe por mês: quantidade criada, valor total emprestado, valor recebido em pagamentos e lucro.

### 8.2 Exportação Excel
- Gera planilha com 3 abas:
  - **Empréstimos**: todos os registros com cliente, valor, juros, status, parcelas.
  - **Clientes**: cadastro completo com score e quantidade de empréstimos.
  - **Pagamentos**: histórico de pagamentos confirmados.

---

## 9. AUTENTICAÇÃO E SEGURANÇA

### 9.1 Login
- Acesso via senha única de administrador (`ADMIN_PASSWORD`).
- Proteção contra força bruta: bloqueio após **5 tentativas** erradas em 15 minutos.
- Token de sessão válido por **8 horas**.
- Token usa HMAC-SHA256 com o `ADMIN_TOKEN_SECRET` como chave.

### 9.2 Senhas
- `ADMIN_PASSWORD` — acesso ao painel.
- `ADMIN_DELETE_PASSWORD` — necessária para excluir clientes ou empréstimos (pode ser diferente da senha principal).
- `ADMIN_TOKEN_SECRET` — segredo para assinar tokens JWT internos.
- Todas as comparações de senha usam `timingSafeEqual` para evitar timing attacks.

### 9.3 Dados sensíveis
- Senhas e tokens são **redactados** (`[REDACTED]`) nos logs automaticamente.
- O webhook do Mercado Pago é público (sem autenticação), pois precisa ser acessível externamente.

---

## 10. LOGS

- Todos os eventos relevantes são registrados em `logs/sistema.log`.
- Erros críticos em `logs/erros.log`.
- Dados sensíveis (senhas, tokens) são removidos antes de logar.
- Formato: JSON estruturado com timestamp, nível e dados do evento.

---

## 11. GERAÇÃO DE CONTRATOS (PDF)

- Requer **Python 3 + ReportLab** instalados no servidor.
- O PDF é gerado pelo script `backend/scripts/gerar_contrato.py`.
- Após gerado, o PDF é enviado ao cliente via WhatsApp.
- Arquivos PDF temporários ficam em `contratos/` e podem ser removidos após envio.

---

## 12. FLUXO COMPLETO — DO CADASTRO AO PAGAMENTO

```
1. Admin cadastra o cliente (nome + telefone)
2. Sistema atribui score inicial: 100
3. Admin cria empréstimo (valor, juros, parcelas, prazo)
4. Sistema valida: score OK? empréstimo ativo? valor mínimo?
5. Empréstimo criado com status "pendente"
6. Cron job: vence amanhã → envia lembrete WhatsApp
7. Cron job: vence hoje → gera Pix + envia via WhatsApp
8. Cliente paga via Pix → webhook MP confirma
   OU admin registra pagamento manual no painel
9. Sistema marca parcela como "paga" (se parcelado)
10. Se todas as parcelas pagas → empréstimo = "pago"
11. Score do cliente é atualizado conforme pontualidade
12. Sistema aguarda 5 min e envia oferta de renovação
```

---

*Documento gerado automaticamente — GPCrédito v1.0*
