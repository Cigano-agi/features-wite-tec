---
phase: 01-monorepo-scaffold
plan: 03
subsystem: auth, config, http-client
tags: [nestjs-config, nestjs-axios, jwt-guard, passport-removal, configservice]
dependency_graph:
  requires: [01-02]
  provides: [AuthModule, PspModule, ConfigModule, pure-CanActivate-guard]
  affects: [app.module.ts, public-charge, billing-links, metrics, idempotency, rate-limiter]
tech_stack:
  added: ["@nestjs/config@^4.0.4", "@nestjs/axios@^4.0.1", "joi@^17.13.3"]
  removed: ["@nestjs/passport", "passport", "passport-jwt", "@types/passport-jwt"]
  patterns: [ConfigService-injection, HttpService-firstValueFrom, pure-CanActivate-guard, Joi-validation-schema]
key_files:
  created:
    - src/shared/auth/auth.module.ts
    - src/shared/auth/current-user.decorator.ts
    - src/shared/auth/jwt-auth.guard.spec.ts
    - src/shared/psp/psp.module.ts
  modified:
    - src/app.module.ts
    - src/main.ts
    - src/shared/auth/jwt-auth.guard.ts
    - src/billing-links/billing-links.module.ts
    - src/metrics/metrics.module.ts
    - src/public-charge/public-charge.service.ts
    - src/public-charge/public-charge.service.spec.ts
    - src/public-charge/public-charge.module.ts
    - src/shared/idempotency/idempotency.service.ts
    - src/shared/idempotency/idempotency.service.spec.ts
    - src/shared/rate-limit/rate-limiter.middleware.ts
    - src/shared/rate-limit/rate-limiter.middleware.spec.ts
    - package.json
    - package-lock.json
  deleted:
    - src/shared/auth/jwt.strategy.ts
decisions:
  - "Pure CanActivate JWT guard (no Passport): JwtAuthGuard implements CanActivate, calls JwtService.verifyAsync, normalizes payload to { sellerId, email }"
  - "AuthModule @Global(): exports JwtModule+JwtAuthGuard so no feature module needs to re-import them"
  - "PspModule wraps HttpModule.registerAsync with ConfigService-sourced baseURL — Phase 2 adds PspService on top"
  - "TypeOrmModule.forRoot still reads process.env.DATABASE_URL directly (intentional — removed in Plan 04 when TypeORM is uninstalled)"
  - "Joi validationSchema in ConfigModule.forRoot provides fast-fail at bootstrap for all 9 required/defaulted env vars"
metrics:
  duration: ~25 minutes
  completed: 2026-04-17
  tasks_completed: 3
  files_changed: 14
  tests_after: 60
---

# Phase 01 Plan 03: DI Pattern Standardization Summary

One-liner: Replaced Passport+raw-axios+process.env with pure CanActivate JWT guard, @nestjs/axios HttpService, and @nestjs/config ConfigService across all 7 identified process.env sites.

## What Was Built

### INFRA-04: Pure CanActivate JWT Guard (Passport removal)

Removed `@nestjs/passport`, `passport`, `passport-jwt`, `@types/passport-jwt` (18 packages total). Rewrote `JwtAuthGuard` as a pure `CanActivate` that calls `JwtService.verifyAsync()` directly. Created global `AuthModule` that registers `JwtModule.registerAsync()` via `ConfigService`, and `@CurrentUser()` param decorator. Deleted `jwt.strategy.ts`.

JwtAuthGuard spec: **5 tests, all passing** (RED-GREEN TDD cycle confirmed).

### INFRA-05: @nestjs/axios HttpModule (raw axios removal)

Created `src/shared/psp/psp.module.ts` wrapping `HttpModule.registerAsync()` with `ConfigService`-sourced `baseURL` (DOTNET_SERVICE_URL) and 10s timeout. `PublicChargeService` now injects `HttpService` and uses `firstValueFrom()` for the `.NET` call. `PublicChargeModule` imports `PspModule`.

### INFRA-06: @nestjs/config ConfigService (process.env removal)

Installed `@nestjs/config@^4.0.4` and `joi@^17.13.3`. `ConfigModule.forRoot({ isGlobal: true })` in `AppModule` with Joi validation schema covering all 9 env vars.

## process.env Replacement Table

| File | Variable(s) | Replacement |
|------|-------------|-------------|
| src/app.module.ts | DATABASE_URL (fallback only) | Joi.string().required() validates at bootstrap; TypeORM block still reads process.env.DATABASE_URL directly (removed in Plan 04) |
| src/main.ts | PORT | `app.get(ConfigService).get<number>('PORT')` |
| src/shared/auth/jwt.strategy.ts | JWT_SECRET | FILE DELETED — AuthModule.registerAsync reads JWT_SECRET via ConfigService |
| src/shared/idempotency/idempotency.service.ts | REDIS_URL, IDEMPOTENCY_TTL_SECONDS | Constructor inject ConfigService |
| src/shared/rate-limit/rate-limiter.middleware.ts | REDIS_URL, RATE_LIMIT_PER_MINUTE | Constructor inject ConfigService |
| src/public-charge/public-charge.service.ts | DOTNET_SERVICE_URL, PUBLIC_CHARGE_DEFAULT_EMAIL, PUBLIC_CHARGE_DEFAULT_PHONE | Constructor inject ConfigService (DOTNET_SERVICE_URL now in PspModule baseURL) |
| src/billing-links/billing-links.module.ts | JWT_SECRET (via JwtModule.register) | Removed JwtModule.register — global AuthModule provides JwtService |

## JwtAuthGuard Spec Results

```
PASS src/shared/auth/jwt-auth.guard.spec.ts
  JwtAuthGuard
    √ returns true and attaches user when Bearer token verifies
    √ throws UnauthorizedException when no Authorization header
    √ throws UnauthorizedException when scheme is not Bearer
    √ throws UnauthorizedException when Bearer but no token
    √ throws UnauthorizedException when verifyAsync rejects

Tests: 5 passed, 5 total
```

TDD gate compliance: RED (existing guard took 0 args, spec failed on instantiation) → GREEN (pure CanActivate, all 5 pass).

## Full Test Suite After Plan 03

```
Test Suites: 12 passed, 12 total
Tests:       60 passed, 60 total
```

Note: 12 suites includes 6 from the worktree path and 6 from the main path (Jest picks up both due to worktree layout). All 60 pass.

## Commits

| Task | Hash | Description |
|------|------|-------------|
| Task 1 | c7a7946 | feat(01-03): install @nestjs/config+axios+joi, remove passport, wire ConfigModule+PspModule |
| Task 2 | 4b340fe | feat(01-03): rewrite JwtAuthGuard as pure CanActivate, delete JwtStrategy, create AuthModule |
| Task 3 | f44ffa7 | feat(01-03): migrate PublicChargeService to HttpService, IdempotencyService+RateLimiter to ConfigService |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All data sources are wired. PspModule exports HttpModule (no stub service); Phase 2 adds PspService on top of the wired HttpModule.

## Threat Flags

No new security surface introduced beyond what the plan's threat model covers. All T-01-11 through T-01-18 mitigations implemented as specified.

## Note on TypeORM process.env.DATABASE_URL

`src/app.module.ts` still contains one `process.env.DATABASE_URL` read inside `TypeOrmModule.forRoot`. This is intentional: Joi validates DATABASE_URL as required() at bootstrap (fast-fail if missing), and TypeORM is removed entirely in Plan 04. The `?? 'postgresql://...'` fallback was removed — Joi.required() now enforces presence.

## Self-Check: PASSED

- src/shared/auth/auth.module.ts: EXISTS
- src/shared/auth/current-user.decorator.ts: EXISTS
- src/shared/auth/jwt-auth.guard.spec.ts: EXISTS
- src/shared/auth/jwt-auth.guard.ts: EXISTS (implements CanActivate)
- src/shared/auth/jwt.strategy.ts: DELETED
- src/shared/psp/psp.module.ts: EXISTS (HttpModule.registerAsync)
- Commits c7a7946, 4b340fe, f44ffa7: ALL PRESENT in git log
- npm test: 60 passed, 0 failed
- process.env outside app.module.ts+specs: ZERO matches
