# SAHANA

Employee welfare society platform. Milestone 0 is the foundation: one API, a responsive web shell, and an online-first mobile shell. Welfare, finance, and ESG formulas are not implemented.

Read `AGENTS.md` before changing code.

## Local setup

Requirements: Node.js 22 or newer, pnpm 9.15, and PostgreSQL 16. The API tests can start an ephemeral PostgreSQL when `DATABASE_URL` is unset.

```bash
pnpm install
cp .env.example .env
```

Set `DATABASE_URL` and a `SESSION_SECRET` of at least 32 characters in `.env`. For a localhost-only database:

```bash
pnpm db:up
```

That process stays running. In another terminal, point `.env` at `postgresql://postgres:postgres@127.0.0.1:54329/sahana`. The password is only for this local process. Then:

```bash
pnpm db:migrate
pnpm --filter @sahana/api exec prisma generate
```

Demo data, only outside production:

```bash
# SEED_DEMO=true and SEED_DEMO_PASSWORD (12+ characters) must be in the environment, not in git
pnpm db:seed
pnpm dev:api
pnpm dev:web
```

The web app is at `http://127.0.0.1:5173`. The API is at `http://127.0.0.1:4000`.

## Checks

```bash
pnpm i18n:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

`pnpm test:e2e` needs `SEED_DEMO_PASSWORD` and a seeded database. It does not embed that password in the repository.
