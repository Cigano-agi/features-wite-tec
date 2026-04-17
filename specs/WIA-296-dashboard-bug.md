# WIA-296 — [BUG] Dashboard não exibe dados de vendas

**Tipo:** Bug  
**Status:** Pendente  
**Jira:** https://witegroup.atlassian.net/browse/WIA-296

---

## Descrição do Problema

O dashboard do seller não exibe dados de vendas. Os campos de métricas aparecem zerados ou vazios, apesar de transações estarem sendo registradas corretamente no banco.

---

## Fatos Confirmados

- Transações são gravadas corretamente na tabela `transactions`
- O problema não é cache do browser (confirmado via hard refresh e incógnito)
- O dashboard carrega sem erros de rede visíveis (sem 4xx/5xx no console)
- Outros sellers não foram testados — pode ser específico para o seller que reportou

---

## Prováveis Causas Raiz

### Causa 1 — Escopo de `sellerId` incorreto na query de métricas

**Probabilidade: Alta**

Se a query do endpoint de métricas usa o modelo legado (`JOIN sellers s ON s.user_id = :userId`) em vez de filtrar diretamente por `sellerId` do JWT, e o campo `Seller.userId` foi alterado ou removido parcialmente como parte de WIA-297, a query pode retornar zero linhas sem lançar erro.

**Como verificar:**

```sql
-- Verificar se a query de métricas está usando user_id ou seller_id
EXPLAIN ANALYZE
SELECT COUNT(*), SUM(amount)
FROM transactions t
JOIN billing_links bl ON bl.id = t.billing_link_id
JOIN sellers s ON s.id = bl.seller_id
WHERE s.user_id = :userId;  -- <-- suspeito: deveria ser seller_id = :sellerId
```

Se a query usa `user_id` e WIA-299 removeu a constraint unique ou WIA-297 está parcialmente migrado, a query pode não estar encontrando o seller correto.

---

### Causa 2 — Campos de agregação retornando zero (WIA-275 incompleto)

**Probabilidade: Alta**

O endpoint `GET /v1/billing-links/metrics` pode estar retornando `total_approved: 0` e `total_pending: 0` como valores hardcoded ou placeholder, caso WIA-275 não tenha sido implementado ainda ou tenha sido implementado com a query de `GROUP BY` incorreta.

**Como verificar:**

```bash
# Chamar o endpoint diretamente com o token do seller afetado
curl -H "Authorization: Bearer <token>" \
  https://api.witetec.com/v1/billing-links/metrics
```

Se a resposta retornar zeros mas o banco tiver transações, a query de agregação está errada.

**Query esperada (correta):**

```sql
SELECT
  COUNT(DISTINCT bl.id)                                          AS total_links,
  COUNT(DISTINCT bl.id) FILTER (WHERE bl.status = 'active')     AS active_links,
  COALESCE(SUM(t.amount) FILTER (WHERE t.status IN (2, 7)), 0)  AS total_approved,
  COALESCE(SUM(t.amount) FILTER (WHERE t.status = 1), 0)        AS total_pending
FROM billing_links bl
LEFT JOIN transactions t ON t.billing_link_id = bl.id
WHERE bl.seller_id = :sellerId;
```

---

### Causa 3 — Mismatch de contrato entre API e frontend

**Probabilidade: Média**

O backend pode estar retornando os campos corretos, mas com nomes diferentes dos que o frontend espera.

**Como verificar:**

```bash
# Inspecionar o response real
curl -H "Authorization: Bearer <token>" \
  https://api.witetec.com/v1/billing-links/metrics | jq
```

Comparar os campos retornados com o que o componente React espera. Procurar por:
- `totalApproved` (camelCase) vs `total_approved` (snake_case)
- `data.metrics.*` vs `data.*` (aninhamento diferente)

---

## Passos de Investigação

```
1. Executar query de métricas diretamente no banco com o sellerId do seller afetado
   └── Se retorna dados: o problema está no endpoint ou no contrato
   └── Se retorna zeros: o problema está no modelo de dados ou na query

2. Chamar GET /v1/billing-links/metrics via curl com o token do seller
   └── Se retorna dados corretos: o problema está no frontend
   └── Se retorna zeros: o problema está no backend

3. Verificar se o JWT do seller contém sellerId válido
   └── Decodificar em jwt.io ou console.log(req.user) no middleware

4. Verificar se a query usa seller_id ou user_id para filtrar
   └── grep -n "user_id\|userId" src/billing-links/billing-links.service.ts

5. Verificar se WIA-275 foi implementado com a query de GROUP BY completa
   └── Ou se total_approved e total_pending são placeholders hardcoded
```

---

## Critérios de Aceitação

- [ ] Dashboard exibe `total_links`, `active_links`, `total_approved`, `total_pending` com valores reais
- [ ] Valores exibidos batem com os registros da tabela `transactions` no banco
- [ ] Testado com pelo menos dois sellers distintos que tenham transações
- [ ] `EXPLAIN ANALYZE` da query de métricas não apresenta Seq Scan em `transactions` sem índice

---

## Relação com Outras Tarefas

| Tarefa | Relação |
|--------|---------|
| WIA-275 | A query de métricas é definida aqui — se não implementada corretamente, este bug não fecha |
| WIA-297 | Se o sellerId no JWT ainda usa o modelo 1:1 legado, a query de filtro pode estar errada |
| WIA-306 | Após WIA-297, o `@SellerId()` decorator garante que o sellerId vem sempre do JWT |

---

## Nota de Risco

Este bug pode ter duas naturezas distintas com complexidades muito diferentes:

- **Fix rápido (horas)**: se for apenas mismatch de nome de campo ou query com JOIN errado
- **Fix bloqueado (dias)**: se a causa raiz for o modelo 1:1 de WIA-297, o fix real depende de WIA-275 estar completo e WIA-297 estar ao menos parcialmente entregue (WIA-303 + WIA-305)

Recomendação: executar os passos de investigação antes de estimar o esforço.
