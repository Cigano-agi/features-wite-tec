# WIA-272 — Implementar Links de Pagamento (Billing Links) na API WiteTec

**Tipo:** Epic  
**Status:** Tarefas pendentes  
**Relator:** Caio Porto  
**Jira:** https://witegroup.atlassian.net/browse/WIA-272

---

## Objetivo

Implementar na API WiteTec a funcionalidade de Links de Pagamento (Links de Cobrança), permitindo que o seller crie, gerencie e acompanhe links avulsos e reutilizáveis para cobrança simples.

---

## Conceito Central

O BillingLink é um **molde persistido** — não uma cobrança única. Cada vez que o link for acessado e o cliente final iniciar o pagamento, o sistema cria uma nova `Transaction` vinculada ao link, garantindo rastreabilidade e auditoria.

---

## Checkout Público

Hospedado na própria WiteTec. O cliente final preenche apenas:

| Campo | Obrigatoriedade |
|-------|----------------|
| Nome completo | Obrigatório |
| CPF | Obrigatório |
| Valor | Apenas quando link for "valor aberto" |

---

## Regras Técnicas Obrigatórias

1. **Email/Phone fixos**: A API exige `Customer.email` e `Customer.phone`. O fluxo público deve injetar valores fixos automáticos, mantendo `name` e `document` reais do pagador.
2. **Sem duplicação de lógica**: O endpoint público deve montar o payload e reutilizar o `CreateTransactionService` existente, passando `sellerId` do `BillingLink`.
3. **Vínculo persistido**: `Transaction.billingLinkId` nullable no resto do sistema, obrigatório quando originada de link.
4. **Rastreabilidade via metadata**: Seguir padrão atual de metadata serializada.
5. **Métricas via status real**: Definir qual status conta como "pago" e "pendente" conforme enum atual.

---

## Escopo

- [ ] Entidade `BillingLink` persistida
- [ ] CRUD seller autenticado para links
- [ ] Endpoints públicos: carregar config do link + gerar `Transaction`
- [ ] Vínculo `BillingLink → Transaction` para auditoria e métricas
- [ ] Summary de métricas no painel
- [ ] Idempotência e rate limit no endpoint público
- [ ] Logs sem PII

---

## Subtasks

| ID | Título | Status |
|----|--------|--------|
| [WIA-276](./WIA-276-billing-link-crud.md) | Modelagem de Dados e CRUD de BillingLink | Pendente |
| [WIA-273](./WIA-273-public-charge-endpoint.md) | Implementação do Endpoint Público de Charge | Pendente |
| [WIA-274](./WIA-274-security-rate-limiting.md) | Segurança e Rate Limiting no Checkout | Pendente |
| [WIA-275](./WIA-275-metrics-dashboard.md) | Dashboard de Métricas de Links de Pagamento | Pendente |

---

## Ordem de Implementação Sugerida

```
WIA-276 (dados/CRUD) → WIA-273 (charge público) → WIA-274 (segurança) → WIA-275 (métricas)
```
