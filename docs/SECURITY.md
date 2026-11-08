# Signal — Security Model

## Authentication

- Passwords hashed with argon2id (configured in Prisma/seeds)
- JWT issued on login with expiry embedded in payload
- Token stored in httpOnly, secure (production), sameSite=lax cookie — never in JavaScript-accessible localStorage for auth
- Logout clears the cookie server-side
- `JWT_SECRET` read from environment; process refuses to start if < 32 characters

## Authorization (RBAC)

Four roles enforced at route level:
- `company_admin` — create/manage tests for own company only
- `interviewer` — (route guarded; no endpoints exposed in Phase 1)
- `college_officer` — approve/reject only students within their assigned college
- `student` — view tests they are eligible for; no write access

Middleware chain order: auth first, then role guard, then business logic.

## Access rule: 404 on ineligibility

When a student is ineligible for a test (any reason: unverified, wrong batch, wrong CGPA, closed window, failed previous round), the endpoint returns **404** (empty body), never 403. This prevents enumeration of test IDs or company names through error differentiation.

The eligibility decision lives in a single pure function (`packages/shared/src/eligibility.ts`) that every protected endpoint calls before returning data.

## Domain matching on company verification

A company is verified only when the contact email domain exactly matches the company's registered domain (e.g. `ceo@acme.com` for company `acme.com`). A mismatch leaves the company in `pending` status — this is a soft guard, not a proof of ownership.

## Audit trail

All sensitive actions (company verified, student approved/rejected, test created) write an immutable row to `audit_log`. Rows cannot be updated or deleted. The `actor_type` column records who performed the action.

## Docker security (current config)

- PostgreSQL bound to `127.0.0.1:5433:5432` — no external network exposure
- No `POSTGRES_HOST_AUTH_METHOD trust`; password required
- Database named `signal` (separate test DB `signal_test` used only by integration tests via `DATABASE_URL_TEST`)

## Known gaps

| Gap | Risk | Priority |
|-----|------|----------|
| CORS set to `origin: true` (wildcard) | Any origin can make authenticated requests | Medium — lock down to known origins |
| No rate limiting on login | Brute-force possible without lockout | High |
| No CSRF protection beyond sameSite=lax cookie | Cross-site request forgery on POST routes | Medium |
| Error responses leak internal details in dev logger | Information disclosure | Low (dev only) |
| JWT secret rotation not supported | Must restart to rotate | Low |
