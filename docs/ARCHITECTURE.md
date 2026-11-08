# Signal — Architecture Overview

## What is built now (Phase 1)

### Monorepo layout

```
signal/
├── apps/
│   ├── api/          # Fastify REST API (Postgres + Prisma)
│   └── web/          # React 18 + Vite SPA
├── packages/
│   ├── shared/       # Eligibility engine, types, constants
│   ├── db/           # Prisma schema + migrations
│   └── design/       # Design tokens (CSS variables only)
└── infra/
    └── docker-compose.yml   # PostgreSQL 16 container
```

### API (`apps/api`)

- **Runtime:** Node.js 20+, Fastify framework
- **Auth:** `@fastify/jwt` (JWT in httpOnly cookie), `@fastify/cookie`, argon2 for password hashing
- **ORM:** Prisma Client 5.x connected to PostgreSQL
- **Validation:** JWT_SECRET ≥ 32 chars enforced at startup; exits if missing
- **Routes implemented:**
  - `POST /api/auth/register-company` — creates company, admin user, verification token
  - `GET  /api/auth/verify-company?token=` — marks company verified (domain match check)
  - `POST /api/auth/login` — argon2 check, issues httpOnly JWT cookie
  - `POST /api/auth/logout` — clears token cookie
  - `POST /api/students/register` — self-registration → pending status
  - `POST /api/students/:id/approve` — college_officer of same college
  - `POST /api/students/:id/reject` — college_officer of same college
  - `GET  /api/tests` — eligible tests for signed-in student
  - `GET  /api/tests/:testId` — single test with eligibility gate
  - `POST /api/tests` — company_admin of verified company creates draft
  - `GET  /api/me` — student profile

- **Access control:**
  - Auth middleware extracts JWT from `token` httpOnly cookie
  - Role guard validates role claims in payload
  - Ineligible students get 404 (never 403); existence is not leaked

### Web (`apps/web`)

- **Runtime:** React 18, Vite 5, react-router-dom v6
- **Pages:** Login (signs in against `/api/auth/login`), Unauthorized
- **Layouts:** Admin sidebar (company_admin), Candidate top-tabs (student)
- **Design:** All CSS tokens from PROMPT.md §3 applied via `index.css`
- **Status:** Shell only — placeholder pages exist but no real data-fetching screens

### Shared library (`packages/shared`)

- `eligibility.ts` — pure `checkEligibility(student, test)` function; unit-tested
- Types exported for both API and future worker/room-service

## Not built yet (out of scope for Phase 1)

| Area | Status |
|------|--------|
| Proctor service (camera/mic monitoring) | Not started |
| Exam room websocket server | Not started |
| Test question editor UI | Not started |
| Interview scheduling | Not started |
| Result analytics dashboard | Not started |
| Email delivery (actual SMTP send) | Fake console.log only |
| Real video recording storage | Not started |
| Multi-tenant isolation beyond company membership | Partially implemented |

## Data model highlights

- Users table stores all roles (company_admin, interviewer, college_officer, student)
- Student, CompanyMember, CollegeOfficer are linking tables (one per user)
- VerificationToken is append-only (used flag prevents reuse)
- AuditLog is append-only (no deletes, no updates after insert)
