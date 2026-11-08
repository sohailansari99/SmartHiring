# Signal — Runbook

## Local development setup

Prerequisites: Docker Desktop (or equivalent), Node.js 20+, pnpm 9+

### 1. Start PostgreSQL

```bash
cd infra
docker compose up -d
```

Wait until healthy:
```bash
docker compose ps --filter "health=healthy"
# Expected output shows db container with status: healthy
```

### 2. Set environment variables

Copy `.env.example` into each app's `.env`:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Required values (see `.env.example` comments):
- `DATABASE_URL` — production database connection string
- `DATABASE_URL_TEST` — separate test database (tests must never touch prod)
- `JWT_SECRET` — min 32 random characters (generate with `openssl rand -hex 32`)
- `VITE_API_BASE` — URL of the API server (default `http://localhost:3001`)
- `PGPASSWORD` — PostgreSQL password matching DATABASE_URL user

### 3. Run migrations

```bash
pnpm --filter @signal/db prisma migrate deploy
pnpm --filter @signal/db prisma db seed
```

### 4. Seed test data (first run only)

```bash
pnpm --filter @signal/db prisma db seed
```

This creates: Acme Corp, Tech Institute, State University, one officer per college, two students (one eligible, one ineligible), one published test.

### 5. Start services

Terminal 1 — API:
```bash
pnpm --filter @signal/api dev
# Listens on :3001
```

Terminal 2 — Web:
```bash
pnpm --filter @signal/web dev
# Serves at http://localhost:3000
```

## Testing

Run full suite (all packages):
```bash
pnpm test
```

Per-package:
```bash
pnpm --filter @signal/api test     # unit (11) + integration (9) + phase1-routes (8)
pnpm --filter @signal/shared test  # eligibility (12)
pnpm --filter @signal/db test      # schema sanity (1)
pnpm --filter @signal/web test     # App render (2)
```

Integration tests use `DATABASE_URL_TEST` (the `signal_test` database). They clean their own rows in `beforeAll`/`afterAll`.

## Common operations

### Reset test database

```bash
pnpm --filter @signal/db prisma migrate reset --force
```

### Rotate JWT secret

Update `JWT_SECRET` in the running process's env (requires restart). Old tokens become invalid immediately.

### View audit logs

```sql
SELECT * FROM audit_log ORDER BY createdAt DESC LIMIT 50;
```

### Restart Postgres container

```bash
docker compose -f infra/docker-compose.yml restart db
```

## Rollback procedure

If a deployment breaks:
1. Identify last successful commit: `git log --oneline -n 20`
2. Revert: `git revert <commit-hash>`
3. Run migration forward: `pnpm --filter @signal/db prisma migrate deploy`
4. Restart API process
5. Run smoke tests: `pnpm test`

## Health checks

API health endpoint (auth-required):
```bash
curl http://localhost:3001/api/me \
  -H "Cookie: token=<valid-jwt>"
```

Database connectivity:
```bash
docker compose -f infra/docker-compose.yml exec db pg_isready -U signal -d signal
```

## Escalation contacts

- Infrastructure: infra@[your-domain].com
- Product/security: security@[your-domain].com
- On-call: PagerDuty channel #signal-oncall
