# WIA-276 — Modelagem de Dados e CRUD de BillingLink

**Tipo:** Subtarefa  
**Pai:** [WIA-272](./WIA-272-billing-links-epic.md)  
**Responsável:** Backend  
**Status:** Tarefas pendentes  
**Jira:** https://witegroup.atlassian.net/browse/WIA-276

---

## Objetivo

Estabelecer a estrutura de persistência e os endpoints de gestão de `BillingLink`, permitindo que sellers criem e gerenciem seus links de pagamento.

---

## Entidade `BillingLink`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | Gerado automaticamente; serve como slug público |
| `seller_id` | UUID | Extraído do JWT — nunca do body |
| `amount` | integer (centavos) | Null se link de valor aberto |
| `description` | string | Título/descrição do link |
| `status` | enum `active` / `inactive` | Default: `active` |
| `created_at` | timestamp | Auto |

---

## Endpoints

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/v1/billing-links` | JWT | Criar link |
| `GET` | `/v1/billing-links` | JWT | Listar links do seller |
| `PATCH` | `/v1/billing-links/:id` | JWT | Atualizar link |
| `DELETE` | `/v1/billing-links/:id` | JWT | Inativar link |

---

## Regras de Negócio

- `seller_id` **sempre** extraído do contexto JWT — nunca aceito no request body.
- UUID do `id` é o slug usado no checkout público `/pay/:linkId`.
- DELETE é **inativação lógica** (status → inactive), não exclusão física.
- Listagem retorna apenas links do seller autenticado (`WHERE seller_id = :sellerId`).

---

## Fora de Escopo

- Interface visual (UI) para o seller
- Processamento de pagamentos

---

## Critérios de Aceitação

- [ ] CRUD funcional operando via API
- [ ] `seller_id` sempre vinculado ao link (sem cross-account leak)
- [ ] Testes unitários: criação, listagem, inativação
- [ ] Integridade referencial no banco verificada

---

## Riscos

- **Acesso cruzado entre sellers**: Garantir `WHERE seller_id = :sellerId` em todas as queries de leitura e escrita.
