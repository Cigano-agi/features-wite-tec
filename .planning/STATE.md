# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** Seller cria billing link, cliente acessa /pay/:slug, paga via PIX ou cartao, seller ve resultado no dashboard
**Current focus:** Phase 1 — Monorepo Scaffold

## Current Position

Phase: 1 of 8 (Monorepo Scaffold)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-04-16 — Roadmap created, all 68 requirements mapped across 8 phases

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: Prisma 6.19.x (not 7) — 35-40% small-query regression in Prisma 7 documented
- Init: @nestjs/jwt pure CanActivate guard (no Passport) — Trilon-recommended, eliminates 3 packages
- Init: AWS SQS + DLQ for webhooks (not EventEmitter or Bull) — production async requirement
- Init: Dual-table ownership — NestJS owns billing_links/transactions via Prisma; .NET owns psp_transactions via EF Core
- Init: Redis noeviction policy required for idempotency instance — allkeys-lru causes silent double charges

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 (research flag): PSP sandbox API contracts vary per provider — confirm which PSP is in use before Phase 4 planning
- Phase 4 (research flag): Redis noeviction may require instance-level access on managed providers — verify before Phase 4
- Phase 6 (research flag): Per-link vs per-seller webhook URL model not yet decided — decide before Phase 6 planning

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-04-16
Stopped at: Roadmap created and files written — ready to run /gsd-plan-phase 1
Resume file: None
