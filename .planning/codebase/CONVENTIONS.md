# Coding Conventions

**Analysis Date:** 2026-04-16

## Naming Patterns

**Files:**
- Service files: `[feature].service.ts` (e.g., `billing-links.service.ts`)
- Controller files: `[feature].controller.ts` (e.g., `billing-links.controller.ts`)
- Test files: `[feature].spec.ts` (e.g., `billing-links.service.spec.ts`)
- Entity files: `[feature].entity.ts` (e.g., `billing-link.entity.ts`)
- DTO files: `[feature].dto.ts` placed in `dto/` subdirectory (e.g., `dto/create-billing-link.dto.ts`)
- Module files: `[feature].module.ts` (e.g., `billing-links.module.ts`)
- Guard files: `[feature].guard.ts` (e.g., `jwt-auth.guard.ts`)
- Middleware files: `[feature].middleware.ts` (e.g., `correlation-id.middleware.ts`)

**Functions:**
- camelCase for function and method names (e.g., `findAllBySeller()`, `handleCreate()`, `getMetrics()`)
- Async function names use same camelCase convention as sync functions (e.g., `async create()`, `async charge()`)
- Test suite names use `describe()` with human-readable strings, test cases use `it()` with descriptive text

**Variables:**
- camelCase for local variables and constants (e.g., `sellerId`, `linkId`, `mockRepo`)
- snake_case for database column names and API response fields (e.g., `seller_id`, `created_at`, `total_approved`)
- UPPERCASE_SNAKE_CASE for constants (e.g., `CORRELATION_ID_HEADER`, `RATE_LIMIT_PER_MINUTE`)

**Types and Interfaces:**
- PascalCase for type and interface names (e.g., `BillingLink`, `BillingLinkStatus`, `CreateBillingLinkDto`, `ChargeResult`)
- Type unions for status fields: `export type BillingLinkStatus = 'active' | 'inactive'` (in `src/billing-links/billing-link.entity.ts`)

## Code Style

**Formatting:**
- No explicit formatter configured (ESLint available via `npm run lint`)
- 2-space indentation (observed throughout codebase)
- No semicolons at end of statements (observed as pattern, though not enforced)
- Long lines wrapped for readability (e.g., grid template definitions in React components)

**Linting:**
- ESLint configured in `node-api/package.json` with script: `eslint "src/**/*.ts" "test/**/*.ts"`
- Frontend lint script: `eslint src --ext ts,tsx --report-unused-disable-directives --max-warnings 0`
- No `.eslintrc` file found; rules use default ESLint configuration

## Import Organization

**Order:**
1. NestJS and Express imports (`@nestjs/common`, `@nestjs/core`, etc.)
2. TypeORM imports (`typeorm`, `@nestjs/typeorm`)
3. Local service/module imports (same directory)
4. Relative imports from shared utilities (e.g., `../shared/auth/jwt-auth.guard`)
5. External packages (e.g., `axios`, `uuid`, `class-validator`)

**Path Aliases:**
- Not detected. Imports use relative paths (e.g., `../billing-links/billing-links.service`)
- Absolute imports from `src/` not used

## Error Handling

**Patterns:**
- NestJS HttpException for HTTP-level errors: `throw new HttpException({ error: 'payment_processor_unavailable', correlationId }, HttpStatus.SERVICE_UNAVAILABLE)` (in `src/public-charge/public-charge.service.ts`)
- NestJS NotFoundException for 404 errors: `throw new NotFoundException('billing_link_not_found')` (in `src/billing-links/billing-links.service.ts`)
- UnauthorizedException for auth failures: `throw new UnauthorizedException('invalid_token')` (in `src/shared/auth/jwt-auth.guard.ts`)
- Error responses include string error codes (not just messages): `{ error: 'rate_limit_exceeded', retry_after: 60 }`
- HTTP status codes set explicitly: `@HttpCode(200)` for DELETE endpoints that return data (in `src/billing-links/billing-links.controller.ts`)

**Error Logging:**
- Errors involving PII must use PiiSanitizer before logging: `const safeBody = PiiSanitizer.safeBody(payload as any)` (in `src/public-charge/public-charge.service.ts`)
- No explicit error logging middleware detected; errors thrown to NestJS exception filters

## Logging

**Framework:** console (no external logger configured)

**Patterns:**
- Bootstrap startup message: `console.log('Node API running on port ${port}')` (in `src/main.ts`)
- **CRITICAL:** Never log PII fields (name, cpf, payerName, payerCpf). Use PiiSanitizer utilities.
- PiiSanitizer methods: `PiiSanitizer.sanitize(object)` returns sanitized copy, `PiiSanitizer.safeBody(object)` returns safe JSON string

## Comments

**When to Comment:**
- Technical debt markers: `// TODO: TECH_LEAD_REVIEW — [explanation]` (in `src/billing-links/billing-links.service.ts`)
- Complex business logic requiring explanation
- Not used for obvious code

**JSDoc/TSDoc:**
- Not consistently used throughout codebase
- Type information expressed via TypeScript types rather than comments

## Function Design

**Size:** 
- Service methods typically 5-20 lines
- Async operations follow try-catch pattern for external service calls
- Methods extract concerns into separate functions (e.g., `findByIdAndSeller()` reused by `update()` and `inactivate()`)

**Parameters:**
- Functions accept DTOs for request payloads: `async create(sellerId: string, dto: CreateBillingLinkDto): Promise<BillingLink>`
- seller_id always required as first or dedicated parameter, extracted from JWT token in controllers
- Optional/configuration parameters passed as objects: `{ timeout: 10000, headers: { 'x-correlation-id': correlationId } }`

**Return Values:**
- Async functions return Promises: `Promise<BillingLink>`, `Promise<BillingLink[]>`, `Promise<ChargeResult>`
- Null for "not found" results in service layer (checked by controller): `async findActiveById(id: string): Promise<BillingLink | null>`
- Exceptions thrown instead of error return values

## Module Design

**Exports:**
- NestJS modules export one controller and one service: `BillingLinksController`, `BillingLinksService`
- Module registers in `@Module()` decorator: `imports: [TypeOrmModule.forFeature([BillingLink])]`
- Services injected via constructor: `constructor(private readonly service: BillingLinksService)`

**Barrel Files:**
- Not used in this codebase
- All imports explicit to target files

## Entity/DTO Patterns

**Database Entities:**
- TypeORM entities use decorators: `@Entity('table_name')`, `@PrimaryGeneratedColumn('uuid')`, `@Column()`
- Column names explicitly mapped: `@Column({ name: 'seller_id', type: 'uuid' })`
- Timestamps: `@CreateDateColumn()`, `@UpdateDateColumn()` with snake_case names (`created_at`, `updated_at`)

**DTOs (Data Transfer Objects):**
- class-validator decorators for validation: `@IsInt()`, `@Min(1)`, `@MaxLength(255)`, `@IsString()`
- Located in `dto/` subdirectories within feature modules
- Separate create and update DTOs: `CreateBillingLinkDto`, `UpdateBillingLinkDto`

## Middleware and Guards

**Auth Guards:**
- JwtAuthGuard extends `AuthGuard('jwt')` from passport, validates JWT tokens
- Returns UnauthorizedException on invalid token
- seller_id extracted from JWT payload and accessible via `req.user.sellerId`

**Middleware:**
- CorrelationIdMiddleware: generates or propagates correlation ID across requests/responses
- RateLimiterMiddleware: enforces rate limits per IP address, returns 429 status code on limit exceeded

**Dependency Injection:**
- All services use NestJS @Injectable() decorator
- Services injected in controller constructors
- Mock services created in tests using `Test.createTestingModule()` with value providers

## React/Frontend Patterns

**Component Structure:**
- Functional components with hooks (React 18)
- useState for local state management
- useEffect for side effects (data loading)
- Inline status check functions: `function StatusBadge({ status }: { status: 'active' | 'inactive' })`

**Naming:**
- Component files use PascalCase: `BillingLinksPage`, `BillingLinksList`
- Event handlers prefixed with `handle`: `handleCreate()`, `handleInactivate()`, `handleCopy()`
- Async operations flag with `creating`, `loading` state for UI feedback

**API Calls:**
- Centralized axios instance in `src/services/api.ts`
- Token injected via axios interceptor: `config.headers.Authorization = Bearer ${token}`
- API calls wrapped in try-catch with user-facing error messages

**Type Safety:**
- TypeScript strict mode enabled in `tsconfig.json`
- Custom types defined in `src/lib/types.ts`
- Component props typed with interfaces

---

*Convention analysis: 2026-04-16*
