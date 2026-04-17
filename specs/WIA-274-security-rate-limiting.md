# WIA-274 — Segurança e Rate Limiting no Checkout

**Tipo:** Subtarefa  
**Pai:** [WIA-272](./WIA-272-billing-links-epic.md)  
**Responsável:** Tech Lead / Backend  
**Status:** Tarefas pendentes  
**Jira:** https://witegroup.atlassian.net/browse/WIA-274

---

## Objetivo

Proteger o endpoint público `POST /v1/public/charge/{linkId}` contra abusos e ataques de força bruta.

---

## Escopo

Configurar Rate Limiter por **IP** e por **linkId** no middleware da aplicação.

---

## Especificação do Rate Limiter

| Dimensão | Chave Redis | Limite | Janela |
|----------|-------------|--------|--------|
| Por IP | `rate:ip:<ip>` | configurável | 1 minuto |
| Por IP+Link | `rate:ip:<ip>:link:<linkId>` | configurável | 1 minuto |

- Retornar **HTTP 429** ao estourar limite.
- Incluir header `Retry-After: <segundos>` na resposta 429.
- Limites documentados no README do projeto.

### Response — 429

```json
{
  "error": "rate_limit_exceeded",
  "retry_after": 60
}
```

---

## Fora de Escopo

- WAF complexo ou firewalls de rede externos

---

## Critérios de Aceitação

- [ ] Endpoint retorna 429 ao estourar limite
- [ ] Limite suficientemente alto para não bloquear picos legítimos
- [ ] Simulação via Postman/JMeter confirmando comportamento
- [ ] Limites documentados no README

---

## Riscos

- **Falso positivo**: Limite muito baixo bloqueia transações legítimas em pico. Calibrar antes de produção.

---

## Dependências

- WIA-273 (endpoint público deve existir)
