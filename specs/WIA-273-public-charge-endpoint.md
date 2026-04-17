# WIA-273 — Implementação do Endpoint Público de Charge (Checkout)

**Tipo:** Subtarefa  
**Pai:** [WIA-272](./WIA-272-billing-links-epic.md)  
**Responsável:** Backend  
**Status:** Tarefas pendentes  
**Jira:** https://witegroup.atlassian.net/browse/WIA-273

---

## Objetivo

Conectar o fluxo público ao motor de pagamentos existente (`CreateTransactionService`), garantindo que transações originadas de links públicos sejam vinculadas ao `billingLinkId` correto.

---

## Endpoint

```
POST /v1/public/charge/{linkId}
```

**Auth:** Nenhuma (endpoint público)

### Request

```json
{
  "name": "João Silva",
  "cpf": "12345678901"
}
```

**Header obrigatório:**
```
Idempotency-Key: <uuid>
```

### Response — 201

```json
{
  "transaction_id": "...",
  "status": "pending",
  "amount": 19990,
  "billing_link_id": "..."
}
```

### Response — 409 (idempotência)

```json
{
  "transaction_id": "...",
  "status": "pending",
  "idempotent": true
}
```

---

## Fluxo de Implementação

```
1. Validar linkId existe e está ativo
2. Injetar email e phone fixos (conforme regra da API)
3. Montar payload para CreateTransactionService
4. Passar billingLinkId ao CreateTransactionService
5. Incluir billingLinkId no campo metadata
6. Verificar Idempotency-Key antes de processar
7. Retornar resultado
```

---

## Regras de Negócio

- `email` e `phone` injetados como valores fixos — **nunca coletados do pagador**.
- `billingLinkId` obrigatório no payload do `CreateTransactionService`.
- `billingLinkId` também registrado em `metadata` (padrão atual de rastreabilidade).
- Reaproveitar `CreateTransactionService` existente — sem duplicar lógica.
- `sellerId` obtido do `BillingLink`, não de contexto de autenticação.

---

## Idempotência

- Header `Idempotency-Key` (UUID) obrigatório.
- Mesma chave = retornar resultado original sem criar nova transação.
- Implementar via Redis `SETNX` com TTL de 24h.

---

## Segurança / PII

- `name` e `cpf` **nunca** aparecem em logs de erro.
- Aplicar `PiiSanitizer` em todos os `catch` blocks deste endpoint.

---

## Fora de Escopo

- Coleta de email/phone do usuário final
- Customização de layout do checkout

---

## Critérios de Aceitação

- [ ] Transações geradas com sucesso via link público
- [ ] `billingLinkId` vinculado na transação e no metadata
- [ ] Teste de carga com múltiplas requisições simultâneas + mesma `Idempotency-Key`
- [ ] CPF/nome ausentes de qualquer log de erro

---

## Dependências

- WIA-276 (entidade `BillingLink` deve existir primeiro)
