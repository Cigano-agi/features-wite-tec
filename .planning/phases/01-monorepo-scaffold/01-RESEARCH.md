# Phase 1: Monorepo Scaffold - Research

**Researched:** 2026-04-17
**Domain:** NestJS 11 migration, Prisma 6.x ORM, monorepo reorganization, GitHub Actions CI/CD
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Migrate from NestJS 10 to NestJS 11 (Express v5 wildcard fix, Node 20 minimum) | Breaking changes catalogued; `forRoutes('*')` → `forRoutes('{*splat}')` confirmed |
| INFRA-02 | Replace TypeORM with Prisma 6.x (db pull from existing schema, PrismaService global module) | `prisma db pull` + baseline migration workflow fully documented; PrismaService pattern verified |
| INFRA-03 | Reorganize from 3 separate directories to monorepo src/modules structure | Current structure audited; target layout and file moves fully mapped |
| INFRA-04 | Replace Passport with pure CanActivate guard + JwtService.verifyAsync() | Guard pattern verified from Trilon official blog; exact code documented |
| INFRA-05 | Replace raw axios with @nestjs/axios HttpModule for .NET service calls | HttpModule.registerAsync pattern documented; firstValueFrom adapter confirmed |
| INFRA-06 | Replace scattered process.env with @nestjs/config ConfigService | 7 occurrences of raw process.env identified in codebase; Joi validation pattern documented |
| AVAIL-03 | Branch + PR required (no direct push to main) | GitHub branch protection rules documented |
| AVAIL-04 | Pipeline PR: .github/workflows/pull_request.yaml | PR pipeline YAML pattern (lint + test + build) documented |
| AVAIL-05 | Deploy production: .github/workflows/aws_prod.yml | ECS deploy pipeline with OIDC authentication documented |
</phase_requirements>

---

## Summary

Phase 1 is a pure infrastructure migration — no new business logic is introduced. The work decomposes into five clean tracks: (1) NestJS 10→11 upgrade with one confirmed wildcard route fix in `AppModule`, (2) TypeORM removal and Prisma 6.x installation with `db pull` introspection of the existing `billing_links` table, (3) monorepo directory restructuring from the current `node-api/` flat layout to `src/modules/` + `src/shared/`, (4) Passport removal and replacement with a pure `CanActivate` JWT guard, and (5) GitHub Actions CI/CD pipeline creation.

The existing codebase has one critical NestJS 11 breaking change: `consumer.apply(CorrelationIdMiddleware).forRoutes('*')` in `AppModule` must become `forRoutes('{*splat}')`. All other breaking changes from the NestJS 10→11 migration guide do not affect this codebase (no CacheModule, no wildcard controllers, no dynamic module duplication). The TypeORM→Prisma migration has a clear path: `prisma db pull` against the running PostgreSQL instance will introspect the existing `billing_links` table from `db/migrations/001_billing_links.sql`, then a baseline migration marks it as already applied without re-creating data.

There is no `.github/` directory in the project — both workflow files must be created from scratch. The AWS deployment target (ECS vs Lambda vs EC2) is not documented in any project file; this is flagged as an open question requiring confirmation before the AWS prod pipeline can be finalized.

**Primary recommendation:** Treat the five tracks as sequential within Phase 1 — NestJS upgrade first (npm install passes tests), then Prisma (schema introspection requires live DB), then directory restructure (moves files, updates imports), then auth guard swap (Passport removed), then CI/CD (created last, references the tested build). This order minimizes broken-state duration.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| NestJS 11 upgrade | API / Backend | — | Framework upgrade; no frontend or DB layer impact |
| TypeORM → Prisma migration | API / Backend | Database / Storage | ORM swap; Prisma owns schema introspection and migrations |
| Directory restructuring | API / Backend | — | Source organization; no runtime behavior change |
| Passport → CanActivate guard | API / Backend | — | Auth logic lives at API layer; token verification is server-side |
| @nestjs/axios replacing raw axios | API / Backend | — | HTTP client for internal service calls; API tier owns this |
| @nestjs/config replacing process.env | API / Backend | — | Configuration injection; API bootstrap concern |
| GitHub Actions PR pipeline | CDN / Static | — | CI runs on PR; triggers lint + test + build |
| GitHub Actions prod deploy | CDN / Static | API / Backend | Deploy pipeline builds Docker image, pushes to ECR, updates ECS |

---

## Standard Stack

### Core (Phase 1 changes only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/common` | `^11.1.19` | Core framework | WiteTec standard; NestJS 11 required for Express v5 + Node 20 |
| `@nestjs/core` | `^11.1.19` | Core DI container | Must match @nestjs/common |
| `@nestjs/platform-express` | `^11.1.19` | Express adapter | Express v5 default in NestJS 11 |
| `@nestjs/jwt` | `^11.0.2` | JWT sign/verify | Replaces Passport; pure CanActivate guard uses `JwtService.verifyAsync()` |
| `@nestjs/config` | `^4.0.4` | ConfigService DI | Replaces 7 `process.env.*` calls; Joi validation support built-in |
| `@nestjs/axios` | `^4.0.1` | HttpModule for .NET calls | Replaces raw `axios` import; enables DI mocking in tests |
| `@nestjs/testing` | `^11.1.19` | Test module builder | Must match NestJS version |
| `prisma` | `^6.19.3` | ORM CLI + schema | Locked at v6 per project decision; v7 has 35-40% small-query regression |
| `@prisma/client` | `^6.19.3` | Generated DB client | Must match prisma CLI version |
| `@prisma/adapter-pg` | `^6.19.3` | Driver adapter | Required for Prisma 6 driver-adapter pattern; pairs with `pg` |
| `pg` | `^8.11.3` | PostgreSQL driver | Already installed; keep for Prisma adapter |
| `joi` | `^17.x` | Config validation | Used in `ConfigModule.forRoot({ validationSchema })` |

[VERIFIED: npm registry] — versions confirmed via `npm view` on 2026-04-17.

### To Remove

| Package | Reason |
|---------|--------|
| `@nestjs/typeorm` | Replaced by Prisma |
| `typeorm` | Replaced by Prisma |
| `@nestjs/passport` | Replaced by pure CanActivate guard |
| `passport` | No longer needed |
| `passport-jwt` | No longer needed |
| `@types/passport-jwt` | No longer needed |

### Versions Confirmed

| Package | Current (PoC) | Target | Verified |
|---------|--------------|--------|---------|
| @nestjs/core | 10.0.0 | 11.1.19 | [VERIFIED: npm registry] |
| prisma | not installed | 6.19.3 | [VERIFIED: npm registry] — latest v6 |
| @nestjs/jwt | 10.0.0 | 11.0.2 | [VERIFIED: npm registry] |
| @nestjs/config | not installed | 4.0.4 | [VERIFIED: npm registry] |
| @nestjs/axios | not installed | 4.0.1 | [VERIFIED: npm registry] |
| joi | not installed | 17.x (latest) | [ASSUMED] — standard with @nestjs/config |

### Installation Commands

```bash
# Inside node-api/
# Step 1: Remove TypeORM and Passport ecosystem
npm uninstall @nestjs/typeorm typeorm @nestjs/passport passport passport-jwt @types/passport-jwt

# Step 2: Upgrade NestJS core to v11
npm install @nestjs/common@^11 @nestjs/core@^11 @nestjs/platform-express@^11 @nestjs/jwt@^11 @nestjs/testing@^11

# Step 3: Install Prisma 6.x
npm install prisma@^6.19 @prisma/client@^6.19 @prisma/adapter-pg@^6.19
npm install --save-dev prisma@^6.19

# Step 4: Install new NestJS modules
npm install @nestjs/config@^4 @nestjs/axios@^4 joi

# Step 5: Initialize Prisma
npx prisma init --datasource-provider postgresql
npx prisma db pull    # introspect existing billing_links table
```

---

## Architecture Patterns

### System Architecture Diagram

```
Source repos (before Phase 1):
  node-api/          dotnet-service/    frontend/
  [NestJS 10]        [.NET 8]           [React 18]
  [TypeORM]          [in-memory repo]   [unchanged]
  [Passport JWT]
       |                  |                  |
       v                  |                  |
After Phase 1 (monorepo at project root):
                          |                  |
  src/                    |            frontend/   (unchanged, stays at root)
  ├── modules/            |
  │   ├── billing-links/  |
  │   └── public-charge/  |
  ├── shared/             |
  │   ├── auth/           |
  │   ├── correlation/    |
  │   ├── idempotency/    |
  │   ├── rate-limit/     |
  │   └── pii/            |
  ├── app.module.ts       |
  └── main.ts             |
  prisma/                 |
  ├── schema.prisma       |
  └── migrations/         |
  services/               |
  └── dotnet-psp/  <------+   (renamed from dotnet-service/)
  .github/
  ├── workflows/
  │   ├── pull_request.yaml
  │   └── aws_prod.yml
```

Data flow is unchanged — the physical directory reorganization does not alter runtime behavior.

### Recommended Target Project Structure

```
witetec-billing-links-master/        # monorepo root
├── .github/
│   └── workflows/
│       ├── pull_request.yaml        # AVAIL-04: lint + test + build on PR
│       └── aws_prod.yml             # AVAIL-05: Docker build + ECR push + ECS deploy
│
├── docker-compose.yml               # unchanged
├── .env.example                     # updated with new vars
├── CLAUDE.md                        # unchanged
│
├── prisma/                          # NEW: Prisma schema at monorepo root
│   ├── schema.prisma                # introspected from existing DB
│   └── migrations/
│       └── 0_init/
│           └── migration.sql        # baseline (existing billing_links table)
│
├── src/                             # NestJS app (moved out of node-api/)
│   ├── main.ts
│   ├── app.module.ts                # Updated: no TypeORM, add ConfigModule + PrismaModule
│   │
│   ├── modules/                     # Feature modules (domain-driven)
│   │   ├── billing-links/
│   │   │   ├── billing-links.module.ts
│   │   │   ├── billing-links.controller.ts
│   │   │   ├── billing-links.service.ts
│   │   │   └── dto/
│   │   │       ├── create-billing-link.dto.ts
│   │   │       └── update-billing-link.dto.ts
│   │   │
│   │   ├── public-charge/
│   │   │   ├── public-charge.module.ts
│   │   │   ├── public-charge.controller.ts
│   │   │   ├── public-charge.service.ts    # raw axios → HttpService injection
│   │   │   └── dto/
│   │   │       └── public-charge.dto.ts
│   │   │
│   │   └── metrics/
│   │       ├── metrics.module.ts
│   │       └── metrics.controller.ts
│   │
│   └── shared/                      # Cross-cutting concerns (moved from node-api/src/shared/)
│       ├── prisma/                  # NEW: @Global() PrismaModule
│       │   ├── prisma.module.ts
│       │   └── prisma.service.ts
│       │
│       ├── auth/
│       │   ├── jwt-auth.guard.ts    # REWRITTEN: pure CanActivate (no Passport)
│       │   ├── auth.module.ts       # NEW: exports JwtModule + JwtAuthGuard
│       │   └── current-user.decorator.ts  # NEW: @CurrentUser() param decorator
│       │
│       ├── correlation/
│       │   └── correlation-id.middleware.ts  # unchanged logic
│       │
│       ├── idempotency/
│       │   ├── idempotency.service.ts        # unchanged logic
│       │   └── idempotency.service.spec.ts
│       │
│       ├── rate-limit/
│       │   ├── rate-limiter.middleware.ts    # unchanged logic
│       │   └── rate-limiter.middleware.spec.ts
│       │
│       └── pii/
│           ├── pii-sanitizer.ts             # unchanged
│           └── pii-sanitizer.spec.ts
│
├── services/
│   └── dotnet-psp/                  # RENAMED from dotnet-service/
│       └── [unchanged .NET source]
│
├── services/dotnet-psp-tests/       # RENAMED from dotnet-service-tests/
│
├── frontend/                        # unchanged
│
├── package.json                     # NEW at root (moved from node-api/)
├── tsconfig.json                    # NEW at root (moved from node-api/)
├── jest.config.js                   # NEW at root (moved from node-api/)
└── db/                              # kept for historical reference
    └── migrations/
        └── 001_billing_links.sql    # original SQL (not used by Prisma after baseline)
```

### Pattern 1: PrismaService Global Module

**What:** `@Global()` module exposing a single `PrismaClient` connection to all feature modules.
**When to use:** Always — one DB connection per process, shared via NestJS DI.

```typescript
// src/shared/prisma/prisma.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}

// src/shared/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Feature modules can inject `PrismaService` without importing `PrismaModule`:
```typescript
// src/modules/billing-links/billing-links.service.ts
@Injectable()
export class BillingLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllBySeller(sellerId: string) {
    return this.prisma.billingLink.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
```

[CITED: https://www.prisma.io/docs/guides/frameworks/nestjs]

### Pattern 2: Pure CanActivate JWT Guard (No Passport)

**What:** Custom `JwtAuthGuard` implementing `CanActivate` and calling `JwtService.verifyAsync()`.
**When to use:** All authenticated routes — replaces `@UseGuards(AuthGuard('jwt'))` everywhere.

```typescript
// src/shared/auth/jwt-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('invalid_token');
    try {
      const payload = await this.jwtService.verifyAsync(token);
      request['user'] = payload; // payload.sub = sellerId
      return true;
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
  }

  private extractToken(request: any): string | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }
}

// src/shared/auth/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);

// src/shared/auth/auth.module.ts
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt-auth.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
```

[CITED: https://trilon.io/blog/nestjs-authentication-without-passport]

### Pattern 3: @nestjs/config with Joi Validation

**What:** `ConfigModule.forRoot()` with Joi schema validates all required env vars at startup. Fails fast if any are missing.
**When to use:** Replace all 7 `process.env.*` calls identified in codebase.

```typescript
// src/app.module.ts (partial)
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().default('redis://localhost:6379'),
        JWT_SECRET: Joi.string().required(),
        DOTNET_SERVICE_URL: Joi.string().default('http://localhost:5001'),
        PUBLIC_CHARGE_DEFAULT_EMAIL: Joi.string().email().default('noreply@witetec.com'),
        PUBLIC_CHARGE_DEFAULT_PHONE: Joi.string().default('+5500000000000'),
        RATE_LIMIT_PER_MINUTE: Joi.number().integer().default(30),
        IDEMPOTENCY_TTL_SECONDS: Joi.number().integer().default(86400),
        PORT: Joi.number().integer().default(3000),
      }),
    }),
    PrismaModule,
    AuthModule,
    // feature modules...
  ],
})
export class AppModule {}
```

Inject in services with full type safety:
```typescript
constructor(private readonly config: ConfigService) {}
// Replace: process.env.DOTNET_SERVICE_URL ?? 'http://localhost:5001'
// With:
const url = this.config.get<string>('DOTNET_SERVICE_URL');
```

[ASSUMED — pattern is well-documented in @nestjs/config official docs; Joi syntax confirmed from multiple 2024 sources]

### Pattern 4: @nestjs/axios HttpModule for .NET Calls

**What:** `HttpModule.registerAsync()` creates a configured `HttpService` injectable that replaces raw `axios`.
**When to use:** All HTTP calls from NestJS to the .NET service.

```typescript
// src/shared/psp/psp.module.ts (Phase 1 stub — full PspModule is Phase 2)
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>('DOTNET_SERVICE_URL'),
        timeout: 5000,
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [HttpModule],
})
export class PspModule {}
```

In `PublicChargeService`, replace raw axios:
```typescript
// BEFORE (raw axios — removed)
import axios from 'axios';
const response = await axios.post(`${url}/internal/transactions`, payload, { timeout: 10000 });

// AFTER (@nestjs/axios)
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

constructor(private readonly http: HttpService) {}

const { data } = await firstValueFrom(
  this.http.post('/internal/transactions', payload, {
    headers: { 'x-correlation-id': correlationId },
  })
);
```

[ASSUMED — pattern is standard @nestjs/axios usage; verified from multiple official NestJS examples]

### Pattern 5: Prisma db pull Baseline Migration

**What:** Introspect an existing PostgreSQL schema into Prisma format, then create a baseline migration so Prisma tracks it without re-applying.
**When to use:** Migrating from TypeORM with a live database that already has the `billing_links` table.

```bash
# Run against live DB (docker-compose up -d first)
npx prisma db pull

# Generates prisma/schema.prisma automatically:
# model BillingLink {
#   id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
#   seller_id   String   @db.Uuid
#   amount      Int
#   description String   @db.VarChar(255)
#   status      String   @default("active") @db.VarChar(10)
#   created_at  DateTime? @default(now()) @db.Timestamp(6)
#   updated_at  DateTime? @default(now()) @db.Timestamp(6)
# }

# Create baseline migration (marks existing table as already applied)
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql
npx prisma migrate resolve --applied 0_init

# Generate Prisma client
npx prisma generate
```

After `db pull`, apply `@map` and `@@map` for NestJS camelCase conventions:
```prisma
model BillingLink {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sellerId    String   @map("seller_id") @db.Uuid
  amount      Int
  description String   @db.VarChar(255)
  status      String   @default("active") @db.VarChar(10)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt   DateTime @default(now()) @map("updated_at") @db.Timestamp(6)

  @@map("billing_links")
}
```

[CITED: https://www.prisma.io/docs/guides/migrate-from-typeorm]

### Pattern 6: NestJS 11 Wildcard Route Fix

**What:** Express v5 (default in NestJS 11) requires named wildcards. The `*` standalone wildcard is invalid.
**When to use:** Any `forRoutes('*')` or `@Get('path/*')` usage.

```typescript
// BEFORE (NestJS 10 / Express v4 — breaks in NestJS 11)
consumer.apply(CorrelationIdMiddleware).forRoutes('*');

// AFTER (NestJS 11 / Express v5)
consumer.apply(CorrelationIdMiddleware).forRoutes('{*splat}');
```

This is the ONLY wildcard route change required in this codebase — confirmed by audit of `AppModule`.
`RateLimiterMiddleware` is applied to `'v1/public/charge/:linkId'` which has no wildcard — no change needed.

[CITED: https://docs.nestjs.com/migration-guide — migration guide content verified via GitHub raw file]

### Anti-Patterns to Avoid

- **TypeORM entity + Prisma schema coexistence:** Keeping `billing-link.entity.ts` while adding `schema.prisma` creates dual schema definitions and migration conflicts. Remove entity files immediately after porting each module's service to use `PrismaService`.
- **`process.env` directly in services:** After `@nestjs/config` is installed, any `process.env.*` access in tests will not be controlled by `ConfigModule`. Replace all 7 occurrences before they cause test environment issues.
- **`passport` import in `app.module.ts` or any module after removal:** NestJS 11 peer resolution will fail with Passport present if `@nestjs/passport` is uninstalled. Remove both in the same `npm uninstall` command.
- **`prisma generate` without `prisma db pull` first:** Running `generate` on an empty schema produces an empty client. The sequence is always: `init → db pull → apply @map → generate`.
- **Moving `node-api/` contents without updating `tsconfig.json` paths:** The `rootDir` in `tsconfig.json` must be updated when moving source from `node-api/src/` to `src/`. Failure to do so causes TypeScript to reject the new paths.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT token verification | Custom crypto verification | `@nestjs/jwt` `JwtService.verifyAsync()` | Handles expiry, signature algorithm, secret rotation correctly |
| Environment variable validation | Manual `if (!process.env.X) throw` | `@nestjs/config` + Joi schema | Validates all vars at startup with typed schema; fails fast with clear messages |
| HTTP client for .NET | `axios.create()` singleton | `@nestjs/axios` `HttpModule` | Enables `HttpService` injection; mock with `HttpModule` override in test modules |
| DB schema introspection | Manual Prisma model writing | `npx prisma db pull` | Auto-generates correct types from live schema; avoids naming errors |
| GitHub Actions AWS auth | Long-lived AWS_ACCESS_KEY_ID secrets | OIDC IAM role assumption | Short-lived tokens; no credentials in repository secrets |

**Key insight:** Every item in this list has caused production incidents in NestJS projects. The hand-rolled versions work locally, fail silently in edge cases, and are harder to test.

---

## Common Pitfalls

### Pitfall 1: Express v5 Query String Parsing Change
**What goes wrong:** `@nestjs/platform-express` v11 uses Express v5 which switches from `qs` to the simple query parser by default. Nested query objects like `?filter[status]=active` will not be parsed.
**Why it happens:** Express v5 breaking change — simple parser does not support nested objects or arrays.
**How to avoid:** The existing codebase uses no nested query params (confirmed by audit). Add this to the NestJS 11 upgrade test checklist.
**Warning signs:** Query params that worked in v10 return `undefined` or malformed objects.

[CITED: https://github.com/nestjs/docs.nestjs.com/blob/master/content/migration.md]

### Pitfall 2: ConfigService Resolution Order Reversal (NestJS 11)
**What goes wrong:** After adding `@nestjs/config`, `ConfigService.get('X')` returns different values than expected if the same key exists in both `process.env` and a `config factory`.
**Why it happens:** NestJS 11 changed resolution priority: internal config overrides `process.env` (reversed from v10). If a `registerAs` factory was used with a hardcoded default, it will shadow the actual env var.
**How to avoid:** For Phase 1, use `ConfigModule.forRoot({ isGlobal: true, validationSchema })` only — no `registerAs` factories until needed. Test by setting env vars in `.env` file and verifying `ConfigService.get()` returns them.
**Warning signs:** Config values are always defaults even when `.env` is set.

[CITED: https://docs.nestjs.com/migration-guide]

### Pitfall 3: Prisma v6 — `NotFoundError` Removed
**What goes wrong:** Any try/catch that catches `Prisma.NotFoundError` will silently fail to catch after upgrade to v6.
**Why it happens:** Prisma 6 removed `NotFoundError`. Methods like `findUniqueOrThrow()` now throw `PrismaClientKnownRequestError` with code `P2025`.
**How to avoid:** The existing codebase uses `findOne()` (TypeORM) and manually throws `NotFoundException`. After porting to Prisma, use `findUnique()` and check for `null`, or use `findUniqueOrThrow()` and catch `PrismaClientKnownRequestError`.
**Warning signs:** Error handling in service methods that was catching `NotFoundError` stops working.

[CITED: https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-6]

### Pitfall 4: TypeORM `synchronize: false` Leaving Ghost Connection
**What goes wrong:** After removing `TypeOrmModule.forRoot()` from `AppModule`, tests that relied on TypeORM's PostgreSQL connection pool will hang or fail with connection errors if the pool is not explicitly closed.
**Why it happens:** TypeORM registers a global connection pool; some test utilities may attempt to connect before PrismaService initializes.
**How to avoid:** Remove `TypeOrmModule` from `AppModule` as the very first step. Run `npm test` immediately after — any tests importing TypeORM entities directly (not via service mocks) will fail and must be updated.
**Warning signs:** Tests hang indefinitely or show ETIMEDOUT errors on the PostgreSQL connection.

[ASSUMED — based on TypeORM lifecycle behavior with NestJS test modules]

### Pitfall 5: Prisma `db pull` on Empty/Stopped Database
**What goes wrong:** Running `npx prisma db pull` when PostgreSQL is not running produces an empty or error schema.
**Why it happens:** `db pull` requires a live connection to the database to introspect the schema.
**How to avoid:** Always run `docker compose up -d` and verify `pg_isready` (or `docker compose ps`) before running `db pull`. Confirm the `billing_links` table exists before introspecting.
**Warning signs:** `schema.prisma` is generated with no models, or `db pull` exits with a connection error.

[ASSUMED — based on Prisma CLI behavior]

### Pitfall 6: `@map` Not Applied After `db pull` — camelCase Mismatch
**What goes wrong:** Generated Prisma schema uses `seller_id`, `created_at` etc. (snake_case from PostgreSQL). Without `@map`, the Prisma client API exposes `prisma.billingLink.findMany({ where: { seller_id: '...' } })` — breaking the NestJS camelCase convention.
**Why it happens:** `db pull` generates field names from the database columns, not from camelCase conventions.
**How to avoid:** After `db pull`, immediately apply `@map` for all snake_case columns and `@@map` for the table name. The required mappings for `billing_links` table:
  - `seller_id` → `sellerId @map("seller_id")`
  - `created_at` → `createdAt @map("created_at")`
  - `updated_at` → `updatedAt @map("updated_at")`
  - model name `BillingLinks` → `BillingLink` (Prisma uses singular)
  - add `@@map("billing_links")` to the model
**Warning signs:** TypeScript type errors when trying to use `prisma.billingLink.findMany({ where: { sellerId: '...' } })`.

[CITED: https://www.prisma.io/docs/guides/migrate-from-typeorm]

### Pitfall 7: Directory Move Breaks Relative Imports
**What goes wrong:** Moving source files from `node-api/src/` to `src/` at the monorepo root without updating relative import paths causes TypeScript compile errors.
**Why it happens:** Relative paths like `../billing-links/billing-links.service` are valid from `node-api/src/public-charge/` but invalid from `src/modules/public-charge/` because the directory depth changes.
**How to avoid:** Use a find-and-replace strategy for import paths after the move. Verify with `npm run build` (not just `npm test`) because TypeScript compilation catches path issues. Update `tsconfig.json` to set `rootDir: "./src"` (from `"./src"` in the old `node-api/tsconfig.json`).
**Warning signs:** `Cannot find module` errors during TypeScript compilation.

[ASSUMED — standard TypeScript monorepo restructuring risk]

---

## Code Examples

### Current AppModule (Before — Annotated with Changes Needed)

```typescript
// node-api/src/app.module.ts — CURRENT STATE
@Module({
  imports: [
    TypeOrmModule.forRoot({            // REMOVE: replace with PrismaModule
      type: 'postgres',
      url: process.env.DATABASE_URL,  // REMOVE: use ConfigService
      entities: [BillingLink],
      synchronize: false,
    }),
    BillingLinksModule,
    PublicChargeModule,
    MetricsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');          // FIX: '{*splat}'
    consumer.apply(RateLimiterMiddleware).forRoutes('v1/public/charge/:linkId');  // OK
  }
}
```

### Target AppModule (After)

```typescript
// src/app.module.ts — TARGET STATE
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './shared/auth/auth.module';
import { BillingLinksModule } from './modules/billing-links/billing-links.module';
import { PublicChargeModule } from './modules/public-charge/public-charge.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { CorrelationIdMiddleware } from './shared/correlation/correlation-id.middleware';
import { RateLimiterMiddleware } from './shared/rate-limit/rate-limiter.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().default('redis://localhost:6379'),
        JWT_SECRET: Joi.string().required(),
        DOTNET_SERVICE_URL: Joi.string().default('http://localhost:5001'),
        PUBLIC_CHARGE_DEFAULT_EMAIL: Joi.string().email().default('noreply@witetec.com'),
        PUBLIC_CHARGE_DEFAULT_PHONE: Joi.string().default('+5500000000000'),
        RATE_LIMIT_PER_MINUTE: Joi.number().integer().default(30),
        IDEMPOTENCY_TTL_SECONDS: Joi.number().integer().default(86400),
        PORT: Joi.number().integer().default(3000),
      }),
    }),
    PrismaModule,
    AuthModule,
    BillingLinksModule,
    PublicChargeModule,
    MetricsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*splat}');   // FIXED
    consumer.apply(RateLimiterMiddleware).forRoutes('v1/public/charge/:linkId');
  }
}
```

### GitHub Actions PR Pipeline

```yaml
# .github/workflows/pull_request.yaml
name: Pull Request

on:
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Lint, Test, Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/witetec_test
          JWT_SECRET: test-secret-ci
          REDIS_URL: redis://localhost:6379

      - name: Build
        run: npm run build

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: witetec_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
```

[ASSUMED — standard GitHub Actions NestJS CI pattern; adapt env vars to project needs]

### GitHub Actions AWS Production Deploy Pipeline (ECS Pattern)

```yaml
# .github/workflows/aws_prod.yml
name: Deploy Production

on:
  push:
    branches: [main]

env:
  AWS_REGION: us-east-1        # CONFIGURE: your region
  ECR_REPOSITORY: witetec-api  # CONFIGURE: your ECR repo name
  ECS_SERVICE: witetec-api-svc # CONFIGURE: your ECS service name
  ECS_CLUSTER: witetec-cluster # CONFIGURE: your ECS cluster name
  CONTAINER_NAME: witetec-api  # CONFIGURE: container name in task definition

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # Required for OIDC
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-deploy
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag, and push image to ECR
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: Download task definition
        run: |
          aws ecs describe-task-definition --task-definition witetec-api \
            --query taskDefinition > task-definition.json

      - name: Update ECS task definition with new image
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-definition.json
          container-name: ${{ env.CONTAINER_NAME }}
          image: ${{ steps.build-image.outputs.image }}

      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true
```

[CITED: https://docs.github.com/en/actions/deployment/deploying-to-your-cloud-provider/deploying-to-amazon-elastic-container-service]
[ASSUMED: AWS deployment target is ECS — not confirmed in project files. See Open Questions.]

---

## Codebase Audit: process.env Usage to Replace

Seven locations of raw `process.env` access confirmed by code review — all must be replaced with `ConfigService.get()` in Phase 1:

| File | Variable | Replacement |
|------|----------|------------|
| `src/app.module.ts` | `DATABASE_URL` | `ConfigModule` validates at startup; Prisma reads from env directly |
| `src/shared/auth/jwt.strategy.ts` | `JWT_SECRET` | `ConfigService.get('JWT_SECRET')` in `AuthModule` factory |
| `src/shared/idempotency/idempotency.service.ts` | `REDIS_URL`, `IDEMPOTENCY_TTL_SECONDS` | `ConfigService.get()` in constructor (inject ConfigService) |
| `src/public-charge/public-charge.service.ts` | `DOTNET_SERVICE_URL`, `PUBLIC_CHARGE_DEFAULT_EMAIL`, `PUBLIC_CHARGE_DEFAULT_PHONE` | `ConfigService.get()` in constructor |
| `src/main.ts` | `PORT` (implicit default 3000) | `ConfigService.get('PORT')` at bootstrap |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NestJS 10 + Passport JWT | NestJS 11 + pure CanActivate guard | NestJS 11 (2025) | Eliminates 3 packages; simpler code path |
| TypeORM entities + decorators | Prisma schema file + `db pull` | Prisma 6.x (2024) | Schema-first; no decorator duplication; baseline migration for existing DB |
| `forRoutes('*')` (Express v4) | `forRoutes('{*splat}')` (Express v5) | NestJS 11 (2025) | Breaking change — one line in AppModule |
| Long-lived AWS credentials in secrets | OIDC IAM role assumption | GitHub Actions OIDC (2023) | No stored credentials; short-lived tokens per job |
| `process.env.*` inline | `@nestjs/config` ConfigService | @nestjs/config v1+ | DI-injectable; env validation at startup; testable |

**Deprecated/outdated:**
- `passport` + `passport-jwt` + `@nestjs/passport`: Not needed for JWT-only auth. Trilon (NestJS core team) explicitly recommends removal for stateless JWT flows.
- `TypeOrmModule.forRoot()` with `synchronize: false`: TypeORM entity definitions diverge from Prisma schema. Having both creates two sources of truth.
- `Buffer` from Node.js for Prisma `Bytes` fields: Prisma 6 changed `Bytes` type to `Uint8Array`. Not applicable to this project (no `Bytes` fields) but relevant for future schema additions.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | AWS deployment target is ECS (not Lambda or EC2) | GitHub Actions prod deploy pattern | Wrong pipeline type; need different actions and workflow structure |
| A2 | `@nestjs/axios` v4 is a drop-in for `@nestjs/axios` v3 for the HTTP call pattern shown | Standard Stack / Pattern 4 | May require different import or firstValueFrom usage |
| A3 | `@nestjs/config` Joi `validationSchema` pattern is unchanged in v4 | Pattern 3 | Config validation setup may need different API |
| A4 | `IdempotencyService` and `RateLimiterMiddleware` test specs use full NestJS test module (not unit-only) and will require DB/Redis mocks after restructure | Common Pitfalls | Tests may break differently than expected after the move |
| A5 | No Dockerfile exists in the project (not found in root scan) | GitHub Actions prod deploy | If no Dockerfile exists, the `docker build` step fails; must create Dockerfile as part of Phase 1 |

---

## Open Questions (RESOLVED)

1. **What is the AWS deployment target?**
   - RESOLVED: Plans assume ECS (documented in 01-04 Plan, Task 3). Developer must confirm and create ECR/ECS resources as a follow-up before first deploy.

2. **Does a Dockerfile exist?**
   - RESOLVED: No Dockerfile exists. Plan 01-04 Task 3 creates a multi-stage Dockerfile at the monorepo root.

3. **Where does `node-api/package.json` move in the monorepo?**
   - RESOLVED: Plan 01-01 Task 1 moves `package.json` to the monorepo root. `node-api/` directory disappears entirely. `frontend/` and `dotnet-service/` remain as sibling directories.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | NestJS 11 (min Node 20) | ✓ | v24.13.0 | — |
| npm | Package management | ✓ | 11.6.2 | — |
| git | Version control | ✓ | 2.47.1 | — |
| Docker / Docker Compose | PostgreSQL + Redis for Prisma db pull and tests | [ASSUMED] | — | Start DB manually |
| PostgreSQL 15 | `prisma db pull` introspection | [ASSUMED via docker-compose.yml] | 15-alpine | docker compose up -d |
| Redis 7 | Idempotency tests | [ASSUMED via docker-compose.yml] | 7-alpine | docker compose up -d |
| AWS CLI | `aws_prod.yml` development/testing | ✗ (not verified) | — | Not needed locally; only in CI |
| ECR repository | Production deploy pipeline | ✗ (not verified) | — | Must exist before first deployment |

**Missing dependencies with no fallback:**
- ECR repository and ECS cluster must exist before `aws_prod.yml` can succeed. Phase 1 creates the pipeline YAML but cannot run a full production deploy without AWS infrastructure already provisioned.

**Missing dependencies with fallback:**
- Docker / PostgreSQL / Redis: Required for `prisma db pull`. Use `docker compose up -d` per project CLAUDE.md. If Docker is unavailable, `db pull` cannot run — schema must be written manually.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with ts-jest 29.1.1 |
| Config file | `jest.config.js` (at `node-api/`, moves to root in this phase) |
| Quick run command | `npm test -- --testPathPattern=src/shared` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | NestJS 11 installs without peer dep errors | smoke | `npm install && npm run build` | ✅ (package.json exists) |
| INFRA-01 | `npm test` passes after NestJS 11 upgrade | unit | `npm test` | ✅ (existing specs) |
| INFRA-02 | `prisma generate` runs without TypeORM present | smoke | `npx prisma generate` | ❌ Wave 0 |
| INFRA-02 | `PrismaService.$connect()` succeeds in test module | integration | `npm test -- --testPathPattern=prisma` | ❌ Wave 0 |
| INFRA-03 | `npm run build` succeeds after directory restructure | smoke | `npm run build` | ✅ (tsconfig exists) |
| INFRA-04 | `JwtAuthGuard.canActivate()` returns true for valid token | unit | `npm test -- --testPathPattern=jwt-auth` | ❌ Wave 0 |
| INFRA-04 | `JwtAuthGuard.canActivate()` throws UnauthorizedException for missing/invalid token | unit | `npm test -- --testPathPattern=jwt-auth` | ❌ Wave 0 |
| INFRA-05 | `PublicChargeService` uses `HttpService` (not axios import) | unit | `npm test -- --testPathPattern=public-charge` | ✅ (existing spec, needs update) |
| INFRA-06 | `ConfigService.get('JWT_SECRET')` returns correct value in test module | unit | `npm test -- --testPathPattern=app` | ❌ Wave 0 |
| AVAIL-04 | PR pipeline YAML is valid GitHub Actions syntax | manual | `act pull_request` (optional) | ❌ Wave 0 |
| AVAIL-05 | Production deploy YAML is valid GitHub Actions syntax | manual | — | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- --runInBand --forceExit`
- **Per wave merge:** `npm test && npm run build`
- **Phase gate:** Full suite green (`npm test`) + `npx prisma generate` runs without error + `npm run build` compiles cleanly

### Wave 0 Gaps

- [ ] `src/shared/prisma/prisma.service.spec.ts` — covers INFRA-02 (PrismaService connect)
- [ ] `src/shared/auth/jwt-auth.guard.spec.ts` — covers INFRA-04 (CanActivate happy/sad paths)
- [ ] `src/app.spec.ts` or ConfigModule integration — covers INFRA-06 (ConfigService injection)
- [ ] `prisma/schema.prisma` — must exist before any Prisma spec can run (created via `db pull`)
- [ ] `.github/workflows/pull_request.yaml` — covers AVAIL-04 (created as deliverable)
- [ ] `.github/workflows/aws_prod.yml` — covers AVAIL-05 (created as deliverable)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (scaffold only) | `@nestjs/jwt` JwtService.verifyAsync — full implementation is Phase 3 |
| V3 Session Management | no | Stateless JWT; no server-side session |
| V4 Access Control | no | Scaffold phase; guards wired in Phase 3 |
| V5 Input Validation | yes (scaffold) | `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` already in main.ts |
| V6 Cryptography | no | JWT secret loaded via ConfigService; key rotation is Phase 7 |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secrets in GitHub Actions logs | Information Disclosure | Never `echo $SECRET`; use `${{ secrets.X }}` interpolation only |
| Long-lived AWS credentials in repository secrets | Elevation of Privilege | OIDC role assumption — no stored ACCESS_KEY_ID/SECRET_ACCESS_KEY |
| `JWT_SECRET` exposed via ConfigService debug logs | Information Disclosure | Joi marks it `.required()` but NestJS never logs secret values from ConfigService |

---

## Sources

### Primary (HIGH confidence)
- [NestJS Migration Guide v10→v11](https://github.com/nestjs/docs.nestjs.com/blob/master/content/migration.md) — wildcard route changes, ConfigService resolution order, lifecycle hook reversal, Node 20 requirement
- [Trilon — NestJS Auth without Passport](https://trilon.io/blog/nestjs-authentication-without-passport) — pure CanActivate guard pattern
- [Prisma upgrade to v6 guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-6) — NotFoundError removal, Uint8Array change, baseline migration
- [Prisma migrate from TypeORM](https://www.prisma.io/docs/guides/migrate-from-typeorm) — db pull workflow, baseline migration, @map/@@@map syntax
- [GitHub Docs — Deploying to Amazon ECS](https://docs.github.com/en/actions/deployment/deploying-to-your-cloud-provider/deploying-to-amazon-elastic-container-service) — ECS pipeline actions and versions
- npm registry (2026-04-17): `@nestjs/core@11.1.19`, `prisma@6.19.3`, `@nestjs/config@4.0.4`, `@nestjs/axios@4.0.1`, `@nestjs/jwt@11.0.2`
- Codebase audit: `node-api/src/app.module.ts`, `billing-link.entity.ts`, `jwt.strategy.ts`, `public-charge.service.ts`, `billing-links.service.ts`, `idempotency.service.ts` — all read directly

### Secondary (MEDIUM confidence)
- [NestJS 11 GitHub issue — wildcard route fix](https://github.com/nestjs/nest/issues/16095) — confirms `{*splat}` syntax
- [Trilon — Announcing NestJS 11](https://trilon.io/blog/announcing-nestjs-11-whats-new) — Express v5 integration, performance improvements
- [Prisma v7 breaking changes](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7) — confirms driver adapters mandatory, ESM required (validates v6 choice)
- Multiple WebSearch results (2024-2025) for @nestjs/config Joi validation, @nestjs/axios HttpModule patterns, GitHub Actions ECS deploy

### Tertiary (LOW confidence — validate during implementation)
- AWS deployment target assumed to be ECS — not confirmed in project files
- Dockerfile existence not confirmed — assumed absent based on root directory audit

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry on 2026-04-17
- Architecture: HIGH — target structure directly derived from existing codebase audit + prior research
- NestJS 11 breaking changes: HIGH — cited from official migration guide and Trilon blog
- Prisma 6.x migration: HIGH — cited from official Prisma guides
- GitHub Actions patterns: MEDIUM — AWS-specific parts assume ECS target (A1 assumption)
- Pitfalls: HIGH (code-based) / MEDIUM (behavioral, marked ASSUMED)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable ecosystem; NestJS and Prisma release cadence is monthly)
