# WIA-275 — Dashboard de Métricas de Links de Pagamento

**Tipo:** Subtarefa  
**Pai:** [WIA-272](./WIA-272-billing-links-epic.md)  
**Responsável:** Backend  
**Status:** Tarefas pendentes  
**Jira:** https://witegroup.atlassian.net/browse/WIA-275

---

## Objetivo

Prover visibilidade ao seller sobre o desempenho dos seus links de pagamento.

---

## Endpoint

```
GET /v1/billing-links/metrics
```

**Auth:** JWT (seller autenticado)

### Response — 200

```json
{
  "total_links": 10,
  "active_links": 7,
  "total_approved": 150000,
  "total_pending": 30000
}
```

| Campo | Descrição |
|-------|-----------|
| `total_links` | Total de links do seller |
| `active_links` | Links com status = active |
| `total_approved` | Soma das transações aprovadas vinculadas aos links do seller |
| `total_pending` | Volume total de transações pendentes vinculadas |

---

## Regras de Negócio

- Retornar apenas dados do seller autenticado (via JWT).
- `total_approved` e `total_pending` calculados via `GROUP BY` na tabela `transactions` com `JOIN billing_links` — **nunca hardcoded**.
- Definir qual status do enum atual conta como "aprovado" e "pendente" antes da implementação.

---

## Performance

- Criar índices nas colunas `billing_link_id` e `status` da tabela `transactions`.
- Query de agregação não deve impactar performance do banco principal.
- Avaliar cache Redis se volume de transações for alto.

---

## Fora de Escopo

- Gráficos visuais no frontend (apenas o endpoint de dados)

---

## Critérios de Aceitação

- [ ] Endpoint retorna dados precisos para o painel do seller
- [ ] Valores batem com transações registradas no banco
- [ ] Índices criados em `billing_link_id` e `status`
- [ ] Query validada com `EXPLAIN ANALYZE`

---

## Dependências

- WIA-276 (BillingLink deve existir)
- WIA-273 (Transactions com billingLinkId devem existir)
