# Technology Stack

**Analysis Date:** 2026-04-16

## Languages

**Primary:**
- TypeScript 5.3.3 - Node.js API (`node-api/`) and Frontend
- C# 8.0 - .NET service (`dotnet-service/`)
- JavaScript/JSX - React components

**Secondary:**
- SQL - PostgreSQL schema and migrations

## Runtime

**Environment:**
- Node.js (inferred 18.x or 20.x from package.json constraints)
- .NET 8.0 runtime

**Package Manager:**
- npm (Node.js projects)
- NuGet (dotnet dependencies)
- Lockfile: `node-api/package-lock.json` and `frontend/package-lock.json` (standard npm lockfiles)

## Frameworks

**Core:**
- NestJS 10.0.0 - Node.js backend API framework (`node-api/`)
- React 18.2.0 - Frontend UI library (`frontend/`)
- ASP.NET Core 8.0 - .NET Web API framework (`dotnet-service/`)

**Testing:**
- Jest 29.7.0 - Node.js unit and integration tests (config: `node-api/jest.config.js`)
- Vitest 1.1.0 - Frontend unit tests (config: `frontend/vite.config.ts`)
- xUnit 2.6.2 - .NET unit tests (config: `dotnet-service-tests/WitetecBillingService.Tests.csproj`)

**Build/Dev:**
- Vite 5.0.8 - Frontend bundler and dev server (`frontend/`)
- TypeScript 5.3.3 - TypeScript compiler for both Node and frontend
- ts-jest 29.1.1 - Jest transformer for TypeScript
- ts-node-dev 2.0.0 - Development server for Node API

## Key Dependencies

**Backend (Node.js):**
- `@nestjs/core` 10.0.0 - NestJS core framework
- `@nestjs/jwt` 10.0.0 - JWT token handling
- `@nestjs/passport` 10.0.0 - Authentication middleware
- `@nestjs/typeorm` 10.0.0 - ORM integration
- `typeorm` 0.3.17 - SQL ORM with TypeScript support
- `pg` 8.11.3 - PostgreSQL driver
- `ioredis` 5.3.2 - Redis client library
- `axios` 1.6.0 - HTTP client for .NET service communication
- `passport-jwt` 4.0.1 - JWT strategy for Passport
- `class-validator` 0.14.0 - DTO validation
- `class-transformer` 0.5.1 - DTO transformation
- `uuid` 9.0.0 - UUID generation
- `rxjs` 7.8.1 - Reactive programming

**Frontend:**
- `react-router-dom` 6.21.0 - Client-side routing
- `axios` 1.6.0 - HTTP client for API calls
- `uuid` 9.0.0 - UUID generation
- `clsx` 2.0.0 - Conditional className builder
- `tailwindcss` 3.4.0 - Utility-first CSS framework
- `autoprefixer` 10.4.16 - PostCSS plugin for vendor prefixes

**.NET Service:**
- `Microsoft.EntityFrameworkCore.Design` 8.0.0 - EF Core design-time tools
- `Npgsql.EntityFrameworkCore.PostgreSQL` 8.0.0 - PostgreSQL provider for EF Core
- `Microsoft.AspNetCore.Authentication.JwtBearer` 8.0.0 - JWT authentication
- `Serilog.AspNetCore` 8.0.0 - Structured logging
- `Serilog.Sinks.Console` 5.0.0 - Serilog console output

## Configuration

**Environment:**
- Environment variables via `.env` file (see `.env.example` for template)
- Key configs:
  - `DATABASE_URL` - PostgreSQL connection string
  - `REDIS_URL` - Redis connection URL
  - `DOTNET_SERVICE_URL` - Internal .NET service URL
  - `JWT_SECRET` - Secret for JWT signing
  - `PUBLIC_CHARGE_DEFAULT_EMAIL` - Default email for public charges
  - `PUBLIC_CHARGE_DEFAULT_PHONE` - Default phone for public charges
  - `RATE_LIMIT_PER_MINUTE` - Rate limiting threshold
  - `IDEMPOTENCY_TTL_SECONDS` - Idempotency key expiration

**Build:**
- Node.js: `node-api/tsconfig.json` - TypeScript compilation settings
- Frontend: `frontend/tsconfig.json`, `frontend/vite.config.ts` - Build and TypeScript config
- .NET: `dotnet-service/WitetecBillingService.csproj` - Project definition

## Platform Requirements

**Development:**
- Node.js 18.x or higher (implied by package.json)
- .NET SDK 8.0
- PostgreSQL 15 (via Docker)
- Redis 7 (via Docker)
- Docker and Docker Compose

**Production:**
- Containerized deployment (Docker Compose available)
- PostgreSQL 15 instance
- Redis 7 instance
- Node.js runtime for API
- .NET 8.0 runtime for service

**Database:**
- PostgreSQL 15-alpine (from `docker-compose.yml`)
- Connection via `pg` driver (Node) and `Npgsql` (.NET)
- Migrations in `db/migrations/` applied on container startup

**Caching:**
- Redis 7-alpine (from `docker-compose.yml`)
- Client: `ioredis` 5.3.2 on Node.js

---

*Stack analysis: 2026-04-16*
