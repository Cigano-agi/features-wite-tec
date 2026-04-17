---
phase: 01-monorepo-scaffold
plan: "01"
subsystem: api-backend
tags: [nestjs, upgrade, monorepo, scaffold]
dependency_graph:
  requires: []
  provides: [nestjs-11-root, monorepo-src-layout]
  affects: [all-subsequent-plans]
tech_stack:
  added:
    - "@nestjs/common ^11.1.19"
    - "@nestjs/core ^11.1.19"
    - "@nestjs/platform-express ^11.1.19"
    - "@nestjs/jwt ^11.0.2"
    - "@nestjs/passport ^11.0.5"
    - "@nestjs/typeorm ^11.0.0"
    - "@nestjs/testing ^11.1.19"
    - "typescript ^5.7.3"
    - "reflect-metadata ^0.2.2"
    - "@types/node ^20.17.10"
  patterns:
    - monorepo-root-layout
    - express-v5-wildcard-splat
key_files:
  created:
    - package.json (moved from node-api/)
    - package-lock.json (moved from node-api/)
    - tsconfig.json (moved + include/exclude added)
    - jest.config.js (moved from node-api/)
    - src/** (moved from node-api/src/**)
  modified:
    - src/app.module.ts (forRoutes wildcard fix)
    - src/public-charge/public-charge.service.ts (export ChargeResult)
decisions:
  - TypeORM and Passport retained intentionally — removed in Plans 02/03
  - tsconfig include/exclude scoped to src/ to prevent frontend/ tsx pickup
  - ChargeResult interface exported to satisfy TS declaration emit with declaration:true
metrics:
  duration_minutes: ~15
  completed_date: "2026-04-17"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 34
---

# Phase 01 Plan 01: Monorepo Scaffold + NestJS 11 Upgrade Summary

**One-liner:** NestJS 10 upgraded to 11.1.19 with Express v5 wildcard fix; node-api/ collapsed to monorepo root src/ layout; all 26 tests green.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Move node-api/ to monorepo root | 18b606a | package.json, tsconfig.json, jest.config.js, src/** |
| 2 | Upgrade NestJS to v11 + fix wildcard + install + test | cbf48f0 | package.json, package-lock.json, tsconfig.json, src/app.module.ts |

## Final Package Versions (NestJS 11 snapshot)

| Package | Version |
|---------|---------|
| @nestjs/common | ^11.1.19 |
| @nestjs/core | ^11.1.19 |
| @nestjs/platform-express | ^11.1.19 |
| @nestjs/jwt | ^11.0.2 |
| @nestjs/passport | ^11.0.5 (retained for Plan 03) |
| @nestjs/typeorm | ^11.0.0 (retained for Plan 02) |
| @nestjs/testing | ^11.1.19 |
| typescript | ^5.7.3 |
| reflect-metadata | ^0.2.2 |
| @types/node | ^20.17.10 |

## Directory Layout Result

- `node-api/` directory: **deleted** (does not exist)
- `src/` at monorepo root: **exists** with all 25 source files
- `package.json` at monorepo root: **exists**, `@nestjs/core: "^11.1.19"`
- `tsconfig.json` at monorepo root: **exists**, `include: ["src/**/*"]`
- `jest.config.js` at monorepo root: **exists**, `testRegex: '.*\.spec\.ts$'`
- `dotnet-service/`, `frontend/`, `db/`, `docker-compose.yml`: **unchanged**

## NestJS 10→11 Runtime Notes

1. **Wildcard route fix** (expected): `forRoutes('*')` → `forRoutes('{*splat}')` in `AppModule`. Express v5 requires named wildcards.
2. **tsconfig scope** (deviation — Rule 3 blocking fix): The NestJS `tsconfig.json` at root was picking up `frontend/src/*.tsx` files after the move. Added `"include": ["src/**/*"]` and `"exclude": ["frontend", "dotnet-service", ...]` to scope compilation to NestJS source only.
3. **ChargeResult export** (deviation — Rule 1 bug): TypeScript 5.7 with `declaration: true` requires return types of public methods to be exported. `ChargeResult` interface in `public-charge.service.ts` was not exported; fixed by adding `export`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsconfig.json scoped to src/ only**
- **Found during:** Task 2 (`npm run build`)
- **Issue:** Moving to monorepo root caused `tsc` to pick up `frontend/src/*.tsx` files (React/Vite types not installed), producing 30+ errors.
- **Fix:** Added `"include": ["src/**/*"]` and `"exclude"` list to `tsconfig.json`.
- **Files modified:** `tsconfig.json`
- **Commit:** cbf48f0

**2. [Rule 1 - Bug] ChargeResult interface exported**
- **Found during:** Task 2 (`npm run build`) after tsconfig fix
- **Issue:** TS4053 error — `ChargeResult` used as public method return type but not exported; `declaration: true` requires exportability.
- **Fix:** Added `export` keyword to `interface ChargeResult` in `public-charge.service.ts`.
- **Files modified:** `src/public-charge/public-charge.service.ts`
- **Commit:** cbf48f0

## Stray node-api/ References in Docs

The following doc files still reference `node-api/` paths — these are documentation references, not code references, and do not affect runtime:
- `README.md` — may reference `node-api/` in setup instructions
- `CLAUDE.md` (project root) — may reference old directory structure

These are flagged for Plan 04 follow-up as doc updates only.

## Known Stubs

None — no placeholder data, hardcoded empty values, or TODO stubs introduced in this plan. TypeORM and Passport are intentionally retained (not stubs) per plan design.

## Self-Check

### Files created/modified exist:
- `package.json` at root: FOUND
- `tsconfig.json` at root: FOUND
- `jest.config.js` at root: FOUND
- `src/app.module.ts`: FOUND
- `src/public-charge/public-charge.service.ts`: FOUND
- `node-api/`: DELETED (correct)

### Commits exist:
- 18b606a: chore(01-01): move node-api/ contents to monorepo root — FOUND
- cbf48f0: feat(01-01): upgrade NestJS 10 to 11 — FOUND

## Self-Check: PASSED
