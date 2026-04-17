# WIA-272: Billing Links — Production Refactor

## What This Is

Refatorar o PoC de Billing Links para production-ready. O PoC atual demonstra o fluxo completo (seller cria link, cliente paga via endpoint publico, transacao processada pelo servico .NET), mas usa stack desatualizada (Nest 10 + TypeORM), estrutura fragmentada (3 repositorios separados), e tem gaps criticos de funcionalidade. O objetivo e migrar para a stack real da WiteTec (Nest 11 + Prisma), reorganizar em monorepo src/modules, e completar todos os fluxos para producao.

## Core Value

Seller cria um billing link e compartilha; cliente acessa `/pay/:slug`, paga via PIX ou cartao, e o seller ve o resultado no dashboard em tempo real.

## Requirements

### Validated

<!-- Patterns e fluxos provados pelo PoC que serao portados -->

- Correlation ID end-to-end (request tracing entre Node e .NET) — existing
- Rate limiting por IP+link com Redis INCR+TTL — existing
- Seller isolation via JWT (seller_id do token `sub`, WHERE seller_id filter) — existing
- Transaction state machine no .NET (Pending -> Approved/Failed com guards) — existing
- ValidationPipe com whitelist + forbidNonWhitelisted — existing
- Docker Compose para infra local (PostgreSQL 15, Redis 7) — existing

### Active

<!-- Escopo v1 — tudo que precisa ser construido/reconstruido -->

- [ ] Migrar de Nest 10 + TypeORM para Nest 11 + Prisma
- [ ] Reorganizar de 3 repos separados para monorepo src/modules
- [ ] BillingLink model completo (name, slug, FIXED/OPEN, allowPix/allowCard, expiresAt, etc — spec do usuario)
- [ ] Endpoint publico `/pay/:slug` (substituir `/pay/:linkId`)
- [ ] PIX completo (QR code + copia e cola) no charge response
- [ ] Cartao de credito como metodo de pagamento
- [ ] Idempotencia atomica com Redis SET NX (substituir exists + save)
- [ ] PiiSanitizer construido do zero (name/cpf NUNCA em logs)
- [ ] seller_id sempre extraido do JWT (nunca do body/query)
- [ ] Dashboard do seller (total cobrado, pago, pendente por link)
- [ ] Webhook de status (notificacao quando pagamento muda de status)
- [ ] Listagem de transacoes por link para o seller
- [ ] Metricas reais (substituir stubs/valores hardcoded)
- [ ] Portar servico .NET para estrutura monorepo
- [ ] Refatorar frontend React (manter base, corrigir e completar)

### Out of Scope

- Boleto como metodo de pagamento — v1 foca em PIX + cartao
- OAuth/magic link login — email/password suficiente para v1
- App mobile — web-first
- Real-time chat/notificacoes push — complexidade desnecessaria para v1
- Migrar .NET para Node — .NET mantido como servico de integracao com PSP

## Context

- **Origem:** PoC interno (WIA-272) que provou o fluxo de billing links mas precisa de refatoracao significativa para producao
- **Stack real WiteTec:** Nest 11 + Prisma (monorepo com src/modules) — este projeto precisa alinhar
- **Servico .NET:** Ja faz integracao com o PSP (gateway de pagamento) — Node orquestra, .NET executa o pagamento
- **Gaps do PoC identificados pelo usuario:**
  - BillingLink model simplificado demais (faltam campos do produto)
  - Endpoint publico por linkId em vez de /pay/:slug
  - Charge nao retorna PIX completo (QR/copia e cola)
  - Idempotencia com risco de concorrencia (exists + save ao inves de operacao atomica)
  - Metricas stubadas/duplicadas (endpoint repetido, totals hardcoded 0)
  - PiiSanitizer e JWT seller_id precisam ser construidos do zero
- **Valor de referencia do PoC:** Patterns de rate limit, idempotencia, correlationId sao validos e serao portados

## Constraints

- **Stack:** Nest 11 + Prisma (alinhamento com WiteTec real) — migrar de Nest 10 + TypeORM
- **Seguranca:** name/cpf NUNCA em logs — PiiSanitizer obrigatorio em todos os paths de erro
- **Autenticacao:** seller_id SEMPRE do JWT token (claim `sub`), nunca do body/query
- **Idempotencia:** Idempotency-Key obrigatorio no endpoint publico, implementacao atomica com SET NX
- **Infraestrutura:** PostgreSQL 15 + Redis 7 (ja existem via Docker Compose)
- **Integracao:** .NET service mantido como PSP gateway — comunicacao via HTTP interno

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Migrar para Nest 11 + Prisma | Alinhar com stack real WiteTec, evitar divida tecnica | — Pending |
| Reorganizar em monorepo src/modules | Consistencia com estrutura WiteTec, facilita manutencao | — Pending |
| Manter servico .NET | Ja tem integracao com PSP, nao faz sentido reescrever | — Pending |
| SET NX atomico para idempotencia | Corrige race condition do PoC (exists + save) | — Pending |
| /pay/:slug em vez de /pay/:linkId | Alinhamento com WiteTec real, URLs mais amigaveis | — Pending |
| PIX + Cartao no v1 | Metodos de pagamento mais usados no Brasil, boleto fica para v2 | — Pending |
| Refatorar frontend (nao reescrever) | Base React existente e funcional, so precisa de correcoes | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-16 after initialization*
