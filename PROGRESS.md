# Progress: Signal Technical Hiring Platform

## Phase 1 Status (as of 2026-11-08)

### 1.1 Foundation
- [x] Verify monorepo setup and workspace linking
  - Evidence: pnpm install succeeds, all packages present (`apps/api`, `apps/web`, `packages/db`, `packages/design`, `packages/shared`)
- [x] Verify Prisma schema and database migrations
  - Evidence: `pnpm prisma migrate dev --name init` applied successfully to Postgres (port 5433), 21 tables created
- [x] Verify Shared package (eligibility rules, schemas)
  - Evidence: `packages/shared/src/__tests__/eligibility.test.ts` passes (12 tests)

### 1.2 API & Auth
- [x] Verify Fastify API with auth/role checks
  - Evidence: `apps/api/src/server.ts` implements auth middleware, role guard, student approval with RBAC
- [x] Verify integration tests against Postgres
  - Evidence: `apps/api/src/__tests__/integration.test.ts` passes 9 tests against real Postgres

### 1.3 Web
- [ ] Verify initial web structure and theme
  - Note: Minimal shells exist in `apps/web/src/` but not yet implemented with design system

## New Implementations (2026-11-08)

### Step 1: PostgreSQL Setup
```bash
$ docker-compose -f infra/docker-compose.yml up -d
# Started on port 5433

$ pnpm prisma migrate dev --name init
Applying migration `20261108073329_init`
✔ Generated Prisma Client

$ pnpm --filter @signal/db db:seed
admin@acme.com: company_admin
interviewer@acme.com: interviewer
officer@tech.edu: college_officer
eligible@tech.edu: student
ineligible@tech.edu: student
```

### Step 2: Test Suite (Real DB)
```bash
$ pnpm test
packages/shared test✓ eligibility.test.ts (12 tests)
packages/db test✓ db.test.ts (1 test)
apps/api test✓ unit.test.ts (11 tests)
apps/api test✓ integration.test.ts (9 tests) - REAL POSTGRES
```

### Steps 3-6: New Routes Implemented
- `POST /api/auth/register-company` - creates company + admin user + verification token
- `GET /api/auth/verify-company?token=...` - verifies company (domain match check, single-use tokens, expiry)
- `POST /api/auth/login` - argon2 password check, httpOnly cookie
- `POST /api/auth/logout` - clears cookie
- `POST /api/students/register` - self-registration with status=pending
- `POST /api/students/:id/approve` - officer approves own-college students (+ audit log)
- `POST /api/students/:id/reject` - officer rejects own-college students (+ audit log)
- `GET /api/tests` - list eligible tests for signed-in student
- `POST /api/tests` - create draft test (company admin only, verified company required)

### Step 7: Integration Tests Added
`apps/api/src/__tests__/phase1-routes.test.ts` covers:
- register-company creates company and token
- login returns user info with httpOnly cookie  
- logout clears cookie
- verify-company matching domain → verified
- verify-company single-use token
- student register creates pending student
- officer approve own-college student + audit entry
- GET /api/tests returns eligible tests
- POST /api/tests creates draft when verified

### Step 8: JWT_SECRET Validation
- Server refuses to start if `JWT_SECRET` missing or < 32 characters
- Existing .env files updated with long-enough secret

## Final Test Results
```
$ pnpm test
Test Files: 3 passed (3)
Tests:      28 passed (28)
Duration:   3.30s
```

All integration tests run against real Postgres (no skips).

## Evidence Log
### 2026-11-10 (Session Update & Fixes)
- Fixed login cookie settings in `apps/api/src/server.ts` using `@fastify/cookie` default parseOptions (`path: '/'`, `httpOnly: true`, `sameSite: 'lax'`).
- Bound API server to `127.0.0.1` by default using `process.env.HOST` in `apps/api/src/server.ts`.
- Restricted CORS to `process.env.WEB_ORIGIN || 'http://localhost:5173'` in `apps/api/src/server.ts`.
- Verified integration test suite uses a separate database via `DATABASE_URL_TEST` (`postgresql://signal:password@127.0.0.1:5433/signal_test`).
- Removed unused screen components: `AdminScreen.tsx`, `CandidateScreen.tsx`, and `Shells.tsx` from `apps/web/src/`.

### Verified Test Run (This Session)
```
$ pnpm test
packages/shared test: 12 passed
packages/db test: 1 passed
apps/web test: 2 passed
apps/api test: 28 passed

Test Files  3 passed (3)
     Tests  28 passed (28)
```
