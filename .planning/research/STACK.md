# Technology Stack

**Project:** WIA-272 — Billing Links Production Refactor
**Researched:** 2026-04-16
**Migration from:** Nest 10 + TypeORM (3 separate repos) -> Nest 11 + Prisma (monorepo src/modules)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| NestJS | ^11.1.x | Node API framework | WiteTec real stack alignment. Nest 11 ships Express v5 as default (officially stable 2025), drops Node 16/18 support, adds JSON logging built-in. Minor breaking changes but migration from 10 is straightforward. |
| Node.js | 20.x LTS (minimum) | Runtime | Nest 11 hard requirement — drops Node 16 and 18. Node 20 is LTS; Node 22 is acceptable. Current package.json implies 18/20; bump to 20 explicitly. |
| TypeScript | ^5.4.x | Language | Already on 5.3.3 in PoC. Increment minor. Keep `experimentalDecorators: true` and `emitDecoratorMetadata: true` — Nest 11 still relies on reflect-metadata for its DI system; standard TC39 decorators are not yet usable with NestJS decorators. |

### Database / ORM

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Prisma | ^6.19.x | ORM | Recommended over Prisma 7 for this migration. Prisma 7 introduces a new TypeScript-emitting client generator (breaking vs 6) and has a documented performance regression on small queries in tight loops (35-40% slower than 6 on micro-benchmarks). Prisma 6.19.x is the latest stable in the v6 line — mature, well-documented NestJS integration, and aligns with what the WiteTec ecosystem already knows. Migrate to 7 when it stabilizes further. |
| `@prisma/client` | ^6.19.x | DB client | Bundled with Prisma; generated types from schema. |
| `@prisma/adapter-pg` | ^6.19.x | Driver adapter | Required for the new driver-adapter pattern in Prisma 6+. Pair with `pg`. |
| PostgreSQL | 15 (via Docker) | Database | Already in docker-compose.yml; no change. |

**Migration path — TypeORM to Prisma:**

1. Run `npx prisma db pull` against the existing database to auto-generate `schema.prisma` from live schema
2. Review generated models — apply `@map` for any snake_case column that differs from camelCase field names, and `@@map` for table names
3. Run `npx prisma migrate dev --name init_baseline` to create the first tracked migration from the introspected state
4. Create `PrismaService` extending `PrismaClient` with `OnModuleInit` / `OnModuleDestroy` lifecycle hooks
5. Replace TypeORM calls one module at a time: `repo.findOne()` -> `prisma.billingLink.findUnique()`, `repo.save()` -> `prisma.billingLink.create()` / `prisma.billingLink.update()`, `repo.find()` -> `prisma.billingLink.findMany()`
6. Remove `@nestjs/typeorm`, `typeorm`, and all entity decorator imports after all modules are ported
7. Remove `pg` direct dependency from app code (Prisma owns the pg connection via adapter)

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@nestjs/jwt` | ^11.x | JWT signing/verification | The NestJS docs now show two paths: Passport-based and pure-NestJS. For this project — seller_id must always come from JWT `sub` claim, and there is no OAuth/social login in scope — the pure `CanActivate` guard approach with `@nestjs/jwt` is simpler and has fewer dependencies. |
| `passport` + `passport-jwt` + `@nestjs/passport` | REMOVE | Legacy JWT strategy | The PoC uses `PassportStrategy(Strategy)`. This is valid but adds three extra dependencies for no gain when `JwtService.verifyAsync()` in a custom guard does the same job. Remove passport entirely. |

**Migration path — Passport to pure guard:**

The existing `jwt.strategy.ts` validates the token and returns `{ sellerId: payload.sub, email: payload.email }`. Replace with a `JwtAuthGuard implements CanActivate` that calls `this.jwtService.verifyAsync(token)` and attaches the payload to `request['user']`. The controller extraction `req.user.sellerId` stays identical.

### Caching / Idempotency / Rate Limiting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `ioredis` | ^5.3.x | Redis client | Already in PoC and working. `IdempotencyService` and `RateLimiterMiddleware` both use raw ioredis. The existing implementation is correct (SET NX pattern confirmed). Keep as-is; no need to wrap in a NestJS module for these direct usages. |
| `@nestjs/throttler` | ^5.1.x | Global rate limiting | Replace the hand-rolled `RateLimiterMiddleware` with ThrottlerModule for the authenticated routes. For the public charge endpoint (`/pay/:slug`), keep the custom Redis IP+link middleware because `@nestjs/throttler` cannot natively key on both IP and a dynamic route parameter simultaneously. |
| `@nest-lab/throttler-storage-redis` | ^0.5.x | Redis storage for throttler | Distributes rate-limit state across Node.js instances. Required in production; the default in-memory store loses counts on restart. |

**Note on ioredis vs node-redis:** The search found that Redis now recommends `node-redis` for new projects. However, the PoC's `IdempotencyService` and `RateLimiterMiddleware` use ioredis-specific APIs (`INCR`, `EXPIRE`, `SET NX`). Switching clients mid-migration adds risk for zero benefit. Keep ioredis for now; consider a separate node-redis migration after v1 ships.

### HTTP (Internal .NET Communication)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@nestjs/axios` + `HttpModule` | ^3.x | HTTP client for .NET service | Replace the raw `axios` import in `PublicChargeService` with NestJS `HttpService` from `@nestjs/axios`. Provides proper DI, testability via `HttpModule` mocking, and observable-to-promise adapters. The timeout and correlation-id header passing pattern stays the same. |

### Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `class-validator` | ^0.14.x | DTO validation | Keep as-is. Already in PoC. `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` is the correct production configuration — no change needed. |
| `class-transformer` | ^0.5.x | DTO transformation | Keep as-is. Required by class-validator and NestJS pipes. |

### Configuration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@nestjs/config` | ^4.0.x | Environment variable management | Replace the raw `process.env.*` access scattered through the PoC (found in `JwtStrategy`, `IdempotencyService`, `PublicChargeService`, `AppModule`). `ConfigService` provides DI-injectable config, `.env` loading with validation, and makes testing environment-independent. |

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Jest | ^29.7.x | Unit + integration tests (Node) | Keep as-is. Already configured with ts-jest. |
| Vitest | ^1.6.x | Frontend tests | Bump from 1.1.0 to latest 1.x. |
| xUnit | ^2.6.x | .NET tests | Keep as-is. |

### Frontend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | ^18.2.x | UI framework | Keep as-is. No migration needed. |
| Vite | ^5.x | Bundler | Keep as-is. No migration needed. |
| Tailwind CSS | ^3.4.x | Styling | Keep as-is. |
| `react-router-dom` | ^6.21.x | Routing | Keep as-is; v6 is current stable with no forced migration to v7 for this scope. |
| `msw` | ^2.0.x | API mocking in tests | Already in devDependencies. Keep. |

### .NET Service

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| ASP.NET Core | 8.0 | PSP integration service | Keep as-is per project decision. .NET service is not being rewritten. Structural change: move `dotnet-service/` directory into monorepo under a new path (e.g., `services/psp-gateway/`). |
| EF Core + Npgsql | 8.0.x | .NET DB access | Keep as-is inside the .NET service. |
| Serilog | 8.0.x | Structured logging | Keep as-is. |

---

## Monorepo Structure

The target structure for the Node API after migration:

```
src/
├── modules/
│   ├── billing-links/
│   │   ├── dto/
│   │   ├── billing-links.controller.ts
│   │   ├── billing-links.module.ts
│   │   └── billing-links.service.ts
│   ├── public-charge/
│   │   ├── dto/
│   │   ├── public-charge.controller.ts
│   │   ├── public-charge.module.ts
│   │   └── public-charge.service.ts
│   ├── transactions/           <- new: listing + dashboard aggregates
│   │   └── ...
│   └── metrics/
│       └── ...
├── shared/
│   ├── auth/
│   │   ├── jwt-auth.guard.ts   <- replaces passport strategy
│   │   └── auth.module.ts
│   ├── correlation/
│   │   └── correlation-id.middleware.ts
│   ├── idempotency/
│   │   └── idempotency.service.ts
│   ├── pii/
│   │   └── pii-sanitizer.ts
│   └── rate-limit/
│       └── rate-limiter.middleware.ts
├── prisma/
│   ├── schema.prisma
│   ├── prisma.config.ts
│   └── migrations/
├── app.module.ts
└── main.ts
```

**Key structural decisions:**
- `src/modules/` for domain feature modules — matches WiteTec real structure
- `src/shared/` for cross-cutting concerns (auth, correlation, idempotency, pii, rate-limit)
- `prisma/` at the root of the Node API (alongside `src/`), not inside it
- `.NET service` moves to `services/psp-gateway/` at monorepo root
- Old `db/migrations/` (raw SQL) is replaced by `prisma/migrations/` (Prisma-managed)

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| ORM | Prisma 6.19.x | TypeORM (stay) | TypeORM is not WiteTec real stack; technical debt compounds. TypeORM decorator-based entities also have a known bug in TypeScript strict mode. |
| ORM | Prisma 6.19.x | Prisma 7 | Prisma 7 is usable with NestJS 11 but has documented small-query performance regression (~35-40% on micro-benchmarks) and requires a different generator config. Low stability signal for a migration phase. |
| ORM | Prisma 6.19.x | Drizzle ORM | Drizzle is excellent for greenfield but TypeORM->Drizzle is a harder migration than TypeORM->Prisma (`db pull` introspection path). No advantage for this brownfield case. |
| Auth | Pure @nestjs/jwt guard | Passport-jwt | Passport adds 3 packages for a use case (stateless JWT) that @nestjs/jwt covers directly. Trilon (NestJS core team) explicitly recommends the pure guard approach for JWT-only auth. |
| Redis client | ioredis 5 | node-redis | Official Redis recommendation is now node-redis, but ioredis 5 is stable, maintained, and already wired into PoC. Switching mid-migration is a risk with no v1 benefit. |
| Rate limiting | Custom middleware (public) + ThrottlerModule (authed) | ThrottlerModule only | ThrottlerModule cannot key simultaneously on IP + dynamic route param without a custom guard. The PoC's hand-rolled Redis INCR+TTL is the correct pattern for `IP + linkId` compound limiting. |
| HTTP client | @nestjs/axios | Raw axios | Raw axios breaks DI — cannot be swapped in tests without module-level mocking. `@nestjs/axios` gives `HttpService` injection and `HttpModule` override in test modules. |

---

## NestJS 10 -> 11 Breaking Changes Checklist

These changes from the PoC MUST be addressed during migration. All sourced from the official NestJS migration guide (HIGH confidence).

| Breaking Change | PoC Impact | Fix |
|-----------------|-----------|-----|
| Node.js 18 dropped | PoC implies 18.x in `@types/node: ^20.10.0` but no engine constraint | Add `"engines": { "node": ">=20" }` to package.json; update Docker base image |
| Express v5 default | Route wildcards changed: `*` must be named | `forRoutes('*')` in AppModule -> `forRoutes('{*splat}')`. `RateLimiterMiddleware` applied to `'v1/public/charge/:linkId'` — no wildcard; no change needed. |
| Express v5 default | `@Get('users/*')` pattern invalid | No wildcard routes found in PoC controllers; no action needed |
| CacheModule v6 | Project does not use `@nestjs/cache-manager` | Not applicable |
| Lifecycle hook execution order reversed | `IdempotencyService.onModuleDestroy()` calls `redis.quit()` — this is cleanup, not ordered | Verify no teardown dependency ordering assumed; likely no impact |
| Dynamic module deduplication removed | PoC does not import same dynamic module multiple times | Not applicable |
| ConfigService resolution order | PoC does not use ConfigService yet | Will affect after `@nestjs/config` is added; custom factory values now override `process.env` |

---

## Installation Commands

```bash
# Remove (TypeORM / Passport ecosystem)
npm uninstall @nestjs/typeorm typeorm @nestjs/passport passport passport-jwt @types/passport-jwt

# Core NestJS upgrade
npm install @nestjs/common@^11 @nestjs/core@^11 @nestjs/platform-express@^11 @nestjs/jwt@^11 @nestjs/testing@^11

# Prisma
npm install prisma@^6 @prisma/client@^6 @prisma/adapter-pg@^6
npm install -D prisma@^6

# New NestJS modules
npm install @nestjs/config@^4 @nestjs/axios@^3 @nestjs/throttler@^5
npm install @nest-lab/throttler-storage-redis

# Initialize Prisma
npx prisma init
npx prisma db pull         # introspect existing DB
npx prisma migrate dev --name init_baseline
```

```bash
# Frontend (bump Vitest)
cd frontend && npm install vitest@^1.6
```

---

## Sources

- [NestJS Migration Guide v10->v11](https://docs.nestjs.com/migration-guide) — HIGH confidence (official docs)
- [Trilon — Announcing NestJS 11](https://trilon.io/blog/announcing-nestjs-11-whats-new) — HIGH confidence (core team)
- [Trilon — NestJS Auth without Passport](https://trilon.io/blog/nestjs-authentication-without-passport) — HIGH confidence (core team)
- [Prisma NestJS Guide](https://www.prisma.io/docs/guides/frameworks/nestjs) — HIGH confidence (official docs)
- [Prisma migrate-from-typeorm](https://www.prisma.io/docs/guides/migrate-from-typeorm) — HIGH confidence (official docs)
- [Prisma 7 vs NestJS Discussion](https://github.com/prisma/prisma/discussions/29146) — MEDIUM confidence (community, maintainer confirmed)
- [@nestjs/throttler npm](https://www.npmjs.com/package/@nestjs/throttler) — HIGH confidence (npm registry, latest: 5.1.2)
- [@nestjs/config npm](https://www.npmjs.com/package/@nestjs/config) — HIGH confidence (npm registry, latest: 4.0.4)
- [@nestjs/core npm](https://www.npmjs.com/package/@nestjs/core) — HIGH confidence (npm registry, latest: 11.1.18)
- [Prisma 6.19 release](https://www.prisma.io/blog/announcing-prisma-6-19-0) — HIGH confidence (official changelog)
- [@nest-lab/throttler-storage-redis npm](https://www.npmjs.com/package/@nest-lab/throttler-storage-redis) — MEDIUM confidence (community package, actively maintained)

---

*Stack research for: WIA-272 Billing Links Production Refactor*
*Researched: 2026-04-16*
