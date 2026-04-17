---
phase: 01-monorepo-scaffold
plan: "04"
subsystem: orm-migration, ci-cd
tags: [prisma, typeorm-removal, github-actions, docker, ecs]
dependency_graph:
  requires: [01-03]
  provides: [TypeORM-free Prisma ORM, PR CI pipeline, prod deploy pipeline, Dockerfile]
  affects: [package.json, src/billing-links/*, src/app.module.ts, .github/workflows/*, Dockerfile]
tech_stack:
  added: []
  removed: ["@nestjs/typeorm@11.0.0", "typeorm@0.3.17"]
  patterns: ["PrismaService injection", "multi-stage Docker build", "GitHub Actions OIDC", "jest testPathIgnorePatterns"]
key_files:
  created:
    - .github/workflows/pull_request.yaml
    - .github/workflows/aws_prod.yml
    - Dockerfile
    - .dockerignore
  modified:
    - src/billing-links/billing-links.service.ts
    - src/billing-links/billing-links.service.spec.ts
    - src/billing-links/billing-links.module.ts
    - src/app.module.ts
    - src/public-charge/public-charge.service.spec.ts
    - jest.config.js
  deleted:
    - src/billing-links/billing-link.entity.ts
decisions:
  - "TypeORM uninstalled after full code port + green tests confirmed (safety-first ordering)"
  - "jest testPathIgnorePatterns added for .claude/ to prevent worktree spec bleed"
  - "ECR/ECS names assumed per research A1 (witetec-api, witetec-cluster, witetec-api-svc)"
  - "Docker build not run locally (Docker not available on executor); CI will verify on first PR"
metrics:
  duration: "4 minutes"
  completed: "2026-04-17T09:25:24Z"
  tasks_completed: 3
  files_changed: 10
---

# Phase 01 Plan 04: TypeORM Removal + CI/CD Pipelines Summary

TypeORM fully removed, BillingLinksService migrated to PrismaService, GitHub Actions PR+prod pipelines and multi-stage Dockerfile created — Prisma is now the sole ORM and phase 01 CI/CD infrastructure is complete.

## What Was Built

### Task 1: BillingLinksService migrated to PrismaService (TDD)

**RED phase:** Rewrote `billing-links.service.spec.ts` to mock `PrismaService` instead of `getRepositoryToken(BillingLink)`. Updated `public-charge.service.spec.ts` `makeLink()` helper to use a plain object (`as BillingLink`) instead of `Object.assign(new BillingLink(), ...)`.

**GREEN phase:**
- `src/billing-links/billing-links.service.ts` — Constructor injects `PrismaService`; all methods use `this.prisma.billingLink.*` (create, findMany, findFirst, update, count)
- `src/billing-links/billing-links.module.ts` — Removed `TypeOrmModule.forFeature([BillingLink])` import; PrismaModule is `@Global()` so no explicit import needed
- `src/app.module.ts` — Removed `TypeOrmModule.forRoot(...)` block and `BillingLink` entity import
- `src/billing-links/billing-link.entity.ts` — DELETED; replaced by `import type { BillingLink } from '@prisma/client'`

### Task 2: TypeORM uninstalled

- `npm uninstall @nestjs/typeorm typeorm` — 46 packages removed
- Zero `from 'typeorm'` or `from '@nestjs/typeorm'` references remain in `src/`
- `npx prisma generate` exits 0 (INFRA-02 fully met: Prisma 6.19.3 without TypeORM present)
- `npm run build` exits 0
- All 7 unit specs pass (34 tests)

**Deviation (Rule 2 — auto-fix):** Added `testPathIgnorePatterns: ['/node_modules/', '/\\.claude/']` to `jest.config.js`. Without it, Jest picked up spec files from parallel agent worktrees under `.claude/worktrees/` that still referenced the deleted TypeORM entity, causing 2 suite failures. This is a correctness fix — the project's 7 canonical specs all live under `src/`.

### Task 3: GitHub Actions CI/CD + Dockerfile

**`.github/workflows/pull_request.yaml`:**
- Trigger: `pull_request` to `main`
- Services: `postgres:15-alpine` (port 5432, health-checked) + `redis:7-alpine` (port 6379, health-checked)
- Steps: checkout → setup-node@v4 (Node 20, npm cache) → npm ci → prisma generate → lint → test → build
- Test-only env vars (JWT_SECRET is explicitly `test-secret-ci-do-not-use-in-production`)

**`.github/workflows/aws_prod.yml`:**
- Trigger: `push` to `main`
- Auth: OIDC via `aws-actions/configure-aws-credentials@v4` (`id-token: write` permission scoped to deploy job, no long-lived AWS keys)
- Steps: ECR login → docker build + push → download ECS task definition → render new image → deploy to ECS with `wait-for-service-stability: true`
- ECR/ECS names per research A1: `witetec-api` (ECR repo + container), `witetec-cluster` (ECS cluster), `witetec-api-svc` (ECS service)

**`Dockerfile`** (multi-stage, Node 20 alpine):
- Builder stage: `npm ci` → `npx prisma generate` → `npm run build`
- Production stage: `npm ci --omit=dev`, copies `dist/`, `prisma/`, `.prisma/`, `@prisma/` from builder
- Exposes port 3000, CMD `node dist/main.js`

**`.dockerignore`:** Excludes `node_modules`, `dist`, `.git`, `.github`, `.planning`, `.env*`, `*.log`, `coverage`, `dotnet-service*`, `frontend`, `specs`, `db`, `README.md`, `CLAUDE.md`

## Final Package State

Dependencies removed from `package.json`:
- `@nestjs/typeorm` — removed
- `typeorm` — removed

Dependencies retained: `@nestjs/axios`, `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/jwt`, `@nestjs/platform-express`, `@prisma/client`, `axios`, `class-transformer`, `class-validator`, `ioredis`, `joi`, `pg`, `reflect-metadata`, `rxjs`, `uuid`

## Test Results (Post TypeORM Removal)

All 7 spec files pass with Prisma as sole ORM:

| Spec File | Tests | Result |
|-----------|-------|--------|
| billing-links.service.spec.ts | 7 | PASS |
| public-charge.service.spec.ts | 4 | PASS |
| jwt-auth.guard.spec.ts | 4 | PASS |
| prisma.service.spec.ts | 3 | PASS |
| rate-limiter.middleware.spec.ts | 6 | PASS |
| idempotency.service.spec.ts | 5 | PASS |
| pii-sanitizer.spec.ts | 5 | PASS |
| **Total** | **34** | **PASS** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Fix] Added jest testPathIgnorePatterns for .claude/ worktree**
- **Found during:** Task 2 (after npm uninstall typeorm)
- **Issue:** `jest.config.js` `testRegex: '.*\.spec\.ts$'` with `rootDir: '.'` caused Jest to discover spec files inside `.claude/worktrees/agent-*/` (parallel agent worktrees). After TypeORM uninstall, those stale specs failed to compile (still imported deleted `billing-link.entity.ts`), producing 2 suite failures.
- **Fix:** Added `testPathIgnorePatterns: ['/node_modules/', '/\\.claude/']` to `jest.config.js`
- **Files modified:** `jest.config.js`
- **Commit:** ddb0c19

## Known Stubs

None — BillingLinksService is fully wired to PrismaService. `total_approved: 0` and `total_pending: 0` in `getMetrics()` are intentional placeholders documented in the original code with a TODO comment (requires join with transactions table, out of billing_links schema scope for this phase).

## Threat Flags

No new security-relevant surface introduced. The GitHub Actions workflows use OIDC (no long-lived secrets), and the Dockerfile uses official Node 20 alpine with lockfile-pinned npm ci. Threat register T-01-19 through T-01-26 all addressed as designed.

## Developer Follow-up Actions Required (Not Code Changes)

These are AWS/GitHub configuration steps that must be completed before the first successful run of `aws_prod.yml`:

1. **Enable GitHub branch protection on `main`:** Require PR, require 1 approval, require passing status checks (`pull_request.yaml` / `ci` job). This satisfies AVAIL-03 at the repository settings level.

2. **Provision AWS infrastructure:**
   - Create ECR repository: `witetec-api`
   - Create ECS cluster: `witetec-cluster`
   - Create ECS task definition: `witetec-api` with container name `witetec-api`
   - Create ECS service: `witetec-api-svc` on cluster `witetec-cluster`
   - Create IAM role: `github-actions-deploy` trusted by GitHub OIDC provider (`token.actions.githubusercontent.com`) with permissions for ECR push and ECS deploy
   - Add GitHub repository secret: `AWS_ACCOUNT_ID` (your 12-digit AWS account number)

3. **Docker build verification:** `docker build -t witetec-api:test .` was not run locally (Docker not available on executor). The Dockerfile will be verified by the `aws_prod.yml` pipeline on the first push to `main` after AWS infra is provisioned.

## Self-Check: PASSED

- `src/billing-links/billing-link.entity.ts` deleted: confirmed
- `src/billing-links/billing-links.service.ts` uses PrismaService: confirmed
- `.github/workflows/pull_request.yaml` exists: confirmed
- `.github/workflows/aws_prod.yml` exists: confirmed
- `Dockerfile` exists: confirmed
- `.dockerignore` exists: confirmed
- `@nestjs/typeorm` absent from package.json: confirmed
- `typeorm` absent from package.json: confirmed
- `npx prisma generate` exits 0: confirmed (Generated Prisma Client v6.19.3 in 45ms)
- All 7 test suites pass (34 tests): confirmed
- Commits: 3411bf3, ddb0c19, 4d8b88f
