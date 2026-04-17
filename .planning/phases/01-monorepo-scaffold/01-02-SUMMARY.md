---
phase: 01-monorepo-scaffold
plan: "02"
subsystem: prisma-orm
tags: [prisma, orm, nestjs, postgresql, global-module]
dependency_graph:
  requires: [01-01]
  provides: [prisma-schema, prisma-service, prisma-module]
  affects: [src/app.module.ts, prisma/]
tech_stack:
  added: [prisma@6.19.3, "@prisma/client@6.19.3"]
  patterns: [Global NestJS Module, PrismaClient extension, dual-ORM coexistence]
key_files:
  created:
    - prisma/schema.prisma
    - prisma/migrations/0_init/migration.sql
    - prisma/migrations/migration_lock.toml
    - src/shared/prisma/prisma.service.ts
    - src/shared/prisma/prisma.module.ts
    - src/shared/prisma/prisma.service.spec.ts
  modified:
    - package.json
    - package-lock.json
    - .env.example
    - src/app.module.ts
decisions:
  - "prisma CLI placed in devDependencies; @prisma/client in dependencies (Rule 2 fix)"
  - "schema.prisma written manually from 001_billing_links.sql ground truth — DB unavailable in CI"
  - "prisma db pull and migrate resolve deferred — require live PostgreSQL (Task 3 blocker)"
  - "TypeORM kept intact alongside PrismaModule per plan — dual-ORM phase transition pattern"
metrics:
  duration: "~12 minutes"
  completed: "2026-04-17"
  tasks_completed: 2
  tasks_blocked: 1
  files_created: 6
  files_modified: 4
---

# Phase 01 Plan 02: Prisma 6.19.x Installation + PrismaService Global Module Summary

Prisma 6.19.3 installed with BillingLink model manually mapped from billing_links SQL ground truth; PrismaService @Global module wired into AppModule; 3 Prisma lifecycle tests pass alongside 26 existing TypeORM tests. Task 3 (db push) deferred — PostgreSQL unreachable in executor environment.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Install Prisma, scaffold schema.prisma, baseline migration | 95c60cb | Done (no-DB path) |
| 2 | Create PrismaService + PrismaModule, wire AppModule, tests pass | 7411b67 | Done |
| 3 | [BLOCKING] npx prisma db push — confirm DB/schema parity | — | BLOCKED (no PostgreSQL) |

## Prisma Package Versions Installed

| Package | Version | Placement |
|---------|---------|-----------|
| prisma | ^6.19.3 (6.19.3 installed) | devDependencies |
| @prisma/client | ^6.19.3 (6.19.3 installed) | dependencies |

## Final schema.prisma BillingLink Model

```prisma
model BillingLink {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sellerId    String    @map("seller_id") @db.Uuid
  amount      Int
  description String    @db.VarChar(255)
  status      String    @default("active") @db.VarChar(10)
  createdAt   DateTime? @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt   DateTime? @default(now()) @map("updated_at") @db.Timestamp(6)

  @@index([sellerId], map: "idx_billing_links_seller_id")
  @@index([status], map: "idx_billing_links_status")
  @@map("billing_links")
}
```

## npx prisma generate

Ran successfully in Task 1: `Generated Prisma Client (v6.19.3) to ./node_modules/@prisma/client in 41ms`.

## Task 3 Blocker — prisma db push

Task 3 is the [BLOCKING] phase verification step. It could not run because:

- PostgreSQL was unreachable: `ECONNREFUSED` on `localhost:5432`
- Docker is not installed in the executor environment (`docker: command not found`)
- No alternative live DB was available

**Impact on acceptance criteria:**
- `npx prisma db push --accept-data-loss` — NOT run
- `migrate resolve --applied 0_init` — NOT run (requires live DB)
- `prisma db pull` introspection — NOT run; schema written manually from `db/migrations/001_billing_links.sql`
- Smoke script (`scripts/smoke-prisma.ts`) — NOT run

**What WAS verified without DB:**
- `npx prisma generate` exits 0 — client types generated correctly from manual schema
- `npm run build` exits 0 — TypeScript compiles cleanly with Prisma types
- All 29 project tests pass (26 pre-existing + 3 new Prisma lifecycle tests)

**Manual steps required before Plan 03:**

```bash
# 1. Start PostgreSQL (adjust to your local setup)
docker compose up -d postgres

# 2. Wait for healthy status
docker compose ps postgres

# 3. Set DATABASE_URL (matches .env.example)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/witetec?schema=public"

# 4. Mark baseline as applied (one-time; creates _prisma_migrations table)
npx prisma migrate resolve --applied 0_init

# 5. Verify schema/DB parity (expected: "already in sync")
npx prisma db push --accept-data-loss

# 6. Optional smoke test
npx ts-node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.billingLink.count().then(n=>{console.log('row count:',n);p.\$disconnect();})"
```

## PrismaModule in AppModule

PrismaModule is registered in `src/app.module.ts` alongside `TypeOrmModule.forRoot(...)`. Both coexist — TypeORM is NOT removed in this plan (Plan 04 handles removal).

```typescript
imports: [
  TypeOrmModule.forRoot({ ... }),  // stays until Plan 04
  PrismaModule,                    // added in this plan — @Global()
  BillingLinksModule,
  PublicChargeModule,
  MetricsModule,
]
```

## Introspection Notes

Schema was written manually (no live DB for `prisma db pull`). The BillingLink model mirrors `db/migrations/001_billing_links.sql` exactly:
- CHECK constraint `status IN ('active', 'inactive')` is not representable in Prisma schema — it exists only in the DB and is NOT listed as a Prisma field validator (acceptable; Prisma does not generate constraints from CHECK clauses).
- Two indexes (`idx_billing_links_seller_id`, `idx_billing_links_status`) included via `@@index` with explicit `map:` names matching the DB.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] prisma CLI placed in wrong section by npm install**
- **Found during:** Task 1 — `npm install prisma@^6.19.3 @prisma/client@^6.19.3` placed both in `dependencies`
- **Issue:** `prisma` is a CLI devDependency; only `@prisma/client` belongs in production dependencies
- **Fix:** Manually moved `prisma` to `devDependencies` in `package.json`, ran `npm install` to regenerate lockfile
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** 95c60cb

**2. [Rule 3 - Blocker] No live PostgreSQL available in CI executor**
- **Found during:** Task 1 — `docker: command not found`; `pg.Client.connect()` → ECONNREFUSED
- **Impact:** `prisma db pull`, `migrate resolve`, `db push`, smoke script all require live DB
- **Fix:** schema.prisma written manually from `db/migrations/001_billing_links.sql` (the documented ground truth); `prisma generate` and all TypeScript/test verification succeeded offline
- **Deferred:** Task 3 (`prisma db push`) requires manual execution — documented above

## Known Stubs

None. PrismaService is fully implemented; tests stub `$connect`/`$disconnect` at the instance level (not a production stub).

## Threat Flags

No new security surface beyond what the plan's threat model covers. `DATABASE_URL` is sourced from env in `schema.prisma` (T-01-06 mitigated). `.env` is gitignored.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| prisma/schema.prisma exists | FOUND |
| @@map("billing_links") in schema | FOUND |
| sellerId @map("seller_id") in schema | FOUND |
| prisma/migrations/0_init/migration.sql exists | FOUND |
| prisma/migrations/migration_lock.toml exists | FOUND |
| src/shared/prisma/prisma.service.ts exists | FOUND |
| src/shared/prisma/prisma.module.ts exists | FOUND |
| PrismaModule in AppModule imports | FOUND |
| Commit 95c60cb (Task 1) | FOUND |
| Commit 7411b67 (Task 2) | FOUND |
| npx prisma generate exits 0 | PASSED |
| npm run build exits 0 | PASSED |
| npm test (29 tests including 3 Prisma) | PASSED |
| Task 3 prisma db push | BLOCKED — PostgreSQL unavailable in CI |
