# WIA-261 — Webhook PIX: Processamento Assíncrono e Idempotente

**Tipo:** Epic  
**Status:** Pendente  
**Depende de:** WIA-204, WIA-215  
**Jira:** https://witegroup.atlassian.net/browse/WIA-261

---

## Objetivo

Implementar o pipeline assíncrono de recebimento e processamento de confirmações de pagamento PIX enviadas pelos provedores (PSPs). O sistema deve garantir que cada confirmação seja processada **exatamente uma vez**, mesmo sob condições de falha ou retransmissão do provedor.

---

## Por que este epic é o mais sensível

Webhooks de pagamento são enviados pelo PSP sem garantia de entrega única. O mesmo evento pode chegar múltiplas vezes. Processar um webhook duplicado sem idempotência resulta em:

- Atualização dupla de status de transação
- Potencial crédito duplo em carteiras
- Inconsistências financeiras em relatórios

Por isso, **idempotência por `end2endId` é obrigatória e deve ser implementada com lock transacional**.

---

## Arquitetura do Pipeline

```
PSP externo
    │
    │  POST /webhooks/{providerCode}
    ▼
Webhook Endpoint (WIA-262)
    │
    ├── 1. Validar assinatura do provedor
    ├── 2. Persistir WebhookPaymentLog (status: RECEIVED)
    ├── 3. Enfileirar mensagem no SQS
    └── 4. Retornar HTTP 202 Accepted
         (O log é persistido ANTES do SQS para evitar perda de dados)
              │
              │  (assíncrono)
              ▼
         SQS Queue (WIA-263)
              │
              ▼
         Worker Consumer (WIA-264)
              │
              ├── 5. Verificar se end2endId já processado (ACID)
              ├── 6. Chamar TransactionStatusMachine
              ├── 7. Atualizar Transaction.status
              └── 8. Atualizar WebhookPaymentLog → PROCESSED ou FAILED
                   (em caso de falha: mensagem volta para a fila ou vai para DLQ)
```

**Por que persistir o log ANTES do SQS:**
Se o serviço falhar após persistir mas antes de enfileirar, o log fica em status `RECEIVED` e pode ser reenfileirado por um job de reconciliação. Se a ordem fosse inversa (SQS primeiro), uma falha entre enfileirar e persistir deixaria o sistema sem registro do evento recebido.

---

## `TransactionStatusMachine` — Transições Válidas

```
Pending → Approved    (webhook confirmado pelo PSP)
Pending → Denied      (webhook de recusa pelo PSP)
Approved → Refunded   (solicitação de estorno processada)
Approved → Chargeback (chargeback iniciado pelo pagador)
Any → Canceled        (ação do seller via API autenticada)
```

Qualquer transição não listada acima **lança exceção** — não há silent failure. A `TransactionStatusMachine` deve:

- Receber o status atual da transação
- Receber o novo status desejado
- Validar se a transição é permitida
- Lançar `InvalidTransitionException` com `{currentStatus, requestedStatus, transactionId, correlationId}` se inválida

---

## Subtasks

### WIA-263 — Infraestrutura SQS (Fila + DLQ)

**Deve ser executado primeiro.**

Provisionar a infraestrutura de mensageria via IaC (Terraform ou equivalente).

**Recursos a criar:**

| Recurso | Configuração |
|---------|-------------|
| SQS Queue principal | `witetec-pix-webhooks` |
| SQS Dead Letter Queue | `witetec-pix-webhooks-dlq` |
| Retention period (fila principal) | 4 dias |
| Retention period (DLQ) | 14 dias |
| Max receive count (antes de ir para DLQ) | 5 tentativas |
| Visibility timeout | 30 segundos (deve ser maior que o tempo de processamento do worker) |

**Contrato da mensagem SQS:**

```json
{
  "correlationId": "uuid-v4",
  "transactionId": "uuid-v4",
  "externalRef": "string",
  "end2endId": "string",
  "providerCode": "string",
  "providerPayload": "string (JSON serializado do payload original do PSP)",
  "receivedAt": "ISO 8601"
}
```

**Regras:**
- `providerPayload` é o payload bruto do PSP — pode conter dados sensíveis; não logar em produção
- `end2endId` é o identificador único do pagamento PIX (campo `endToEndId` do Bacen) — usado para idempotência

**Critérios de aceitação:**
- [ ] Fila e DLQ criadas via IaC (não manualmente)
- [ ] DLQ configurada com `maxReceiveCount: 5`
- [ ] Contrato da mensagem documentado e validado por schema

---

### WIA-262 — Endpoint de Recebimento do Webhook

**Depende de:** WIA-263 (fila deve existir)

Implementar o endpoint HTTP que recebe os webhooks do PSP.

**Endpoint:**

```
POST /webhooks/{providerCode}
```

**Auth:** Validação de assinatura HMAC do provedor (cada PSP tem seu mecanismo — implementar via `IWebhookSignatureValidator`)

**Fluxo de implementação:**

```
1. Extrair providerCode do path
2. Validar assinatura HMAC do payload (IWebhookSignatureValidator)
   └── 401 se inválida
3. Persistir WebhookPaymentLog com status RECEIVED
   ├── transactionId (se resolvível do payload)
   ├── end2endId
   ├── providerCode
   ├── correlationId (do header x-correlation-id ou gerado)
   └── rawPayload (payload bruto — para auditoria)
4. Publicar mensagem no SQS (contrato definido em WIA-263)
5. Retornar 202 Accepted
```

**Entidade `WebhookPaymentLog`:**

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | |
| `transactionId` | UUID | nullable — nem sempre resolvível sincronamente |
| `end2endId` | string | identificador único PIX do Bacen |
| `providerCode` | string | ex: "celcoin", "asaas" |
| `status` | enum | RECEIVED / PROCESSED / FAILED |
| `rawPayload` | text | payload bruto do PSP — nunca logar em produção |
| `correlationId` | string | |
| `receivedAt` | timestamp | |
| `processedAt` | timestamp | nullable |

**Regras:**
- Persistir o log **antes** de publicar no SQS
- Retornar 202 mesmo se o PSP enviar payload malformado mas com assinatura válida — logar o erro, não rejeitar
- `rawPayload` não deve aparecer em logs de aplicação — apenas no banco para auditoria

**Critérios de aceitação:**
- [ ] Assinatura inválida retorna 401
- [ ] Log persistido antes do enfileiramento
- [ ] 202 retornado em até 500ms (processamento assíncrono)
- [ ] `correlationId` presente em todos os logs

---

### WIA-264 — Worker SQS: Consumo e Atualização de Status

**Depende de:** WIA-262 (mensagens na fila), WIA-263 (fila existe)

Implementar o worker que consome a fila SQS e executa a atualização de status das transações.

**Fluxo do worker:**

```
1. Receber mensagem da fila SQS
2. Iniciar transação de banco de dados (ACID)
3. Verificar se end2endId já foi processado
   ├── SELECT WebhookPaymentLog WHERE end2endId = ? AND status IN (PROCESSED, FAILED)
   └── Se já processado: deletar mensagem da fila e retornar (idempotência)
4. Resolver transactionId (via externalRef se não vier na mensagem)
5. Chamar TransactionStatusMachine.Transition(currentStatus, newStatus)
   └── Se transição inválida: logar, atualizar log para FAILED, deletar mensagem
6. Atualizar Transaction.status no banco
7. Atualizar WebhookPaymentLog.status = PROCESSED
8. Commit da transação
9. Deletar mensagem da fila SQS
```

**Em caso de erro:**

```
Erro recuperável (ex: timeout de banco):
  └── NÃO deletar mensagem → volta para a fila após visibility timeout
      → retry automático até maxReceiveCount
      → após maxReceiveCount: mensagem vai para DLQ

Erro não recuperável (ex: transição inválida):
  └── Atualizar log para FAILED
  └── Deletar mensagem (não reprocessar)
  └── Alertar time (SNS notification ou equivalente)
```

**Critérios de aceitação:**
- [ ] Mesmo `end2endId` processado duas vezes resulta em exatamente uma atualização de transação
- [ ] Transições inválidas logadas com `{currentStatus, requestedStatus, transactionId, correlationId}`
- [ ] Mensagens reenfileiradas em erros recuperáveis; deletadas em não recuperáveis
- [ ] `WebhookPaymentLog.processedAt` preenchido em PROCESSED e FAILED

---

### WIA-265 — Testes de Carga e Duplicidade

**Depende de:** WIA-262, WIA-264 (pipeline completo)

**Deve ser executado em ambiente de staging** — não em produção.

**Cenários de teste obrigatórios:**

| Cenário | Asserção |
|---------|---------|
| Enviar mesmo payload 10x simultaneamente | Exatamente 1 atualização de transação no banco |
| Enviar 100 webhooks distintos em sequência | 100 transações atualizadas, 0 duplicatas |
| Worker reiniciado durante processamento | Mensagem reprocessada sem duplicação |
| PSP envia payload com `end2endId` já na DLQ | Log criado como FAILED, sem atualização de transação |

**Cobertura de logs obrigatória:**

```
Para cada webhook processado, os seguintes campos devem estar presentes nos logs:
- correlationId
- transactionId
- end2endId
- providerCode
- status (RECEIVED → PROCESSED ou FAILED)
- processedAt
```

Validação: script de auditoria que inspeciona os logs e confirma 100% de presença dos campos obrigatórios.

**Critérios de aceitação:**
- [ ] Zero transações duplicadas no cenário de envio simultâneo
- [ ] 100% dos logs com `correlationId`, `transactionId`, `end2endId`
- [ ] Relatório de teste salvo em `tests/load/results/`

---

## Relação com WIA-272 (Billing Links)

Transações criadas via billing links (`POST /v1/public/charge/{linkId}`) são processadas como qualquer outra transação. O campo `billingLinkId` é persistido na transação no momento da criação.

Quando o PSP confirma o pagamento PIX, o webhook segue este pipeline:

```
PSP → POST /webhooks/pix
    → WebhookPaymentLog.transactionId = <id da transação do billing link>
    → TransactionStatusMachine: Pending → Approved
    → Transaction.status = Approved
    → WIA-275 (métricas): total_approved incrementa
```

O `billingLinkId` não precisa estar no payload do webhook — a relação já está persistida na transação.

---

## Dependências

- WIA-204: `TransactionStatus` enum (define as transições válidas da state machine)
- WIA-215: `IPaymentProvider` (cada implementação conhece o formato de assinatura do seu PSP)

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Webhook duplicado gera crédito duplo | Idempotência por `end2endId` com lock transacional (WIA-264) |
| PSP para de enviar webhooks sem aviso | Job de reconciliação periódico (fora deste escopo — registrar como dívida técnica) |
| DLQ lotada sem monitoramento | Alarme CloudWatch/equivalente na DLQ com threshold de mensagens |
| rawPayload com PII em logs | rawPayload nunca logado — apenas persistido no banco |
