# Run the demo on Windows

This uses the seeded Demo Society A. It is local data only. Do not point it at a shared or production database.

## Install

1. Install Node.js 22 or newer from https://nodejs.org.
2. In PowerShell:

```powershell
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

3. Install PostgreSQL 16 and create an empty database named `sahana`. The embedded database started by `pnpm db:up` is for the machine that has that package's binary. On Windows, use PostgreSQL you installed yourself.

## Configure

From the repository root:

```powershell
Copy-Item .env.example .env
```

Edit `.env`:

```text
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/sahana
SESSION_SECRET=local-session-secret-is-32-chars-min
SEED_DEMO=true
SEED_DEMO_PASSWORD=change-me-now-12
```

Use your own PostgreSQL user and password. `SEED_DEMO_PASSWORD` must be at least 12 characters. It is the password for every demo login and it is not stored in git.

## Start

```powershell
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

In a second PowerShell window:

```powershell
pnpm dev:web
```

Open http://127.0.0.1:5173.

## Sign in

| Email | What you can click |
|---|---|
| admin.a@demo.sahana.test | Society A. Members, welfare, ledger, loans, projects, emergency, ESG, notifications, and configuration. |
| approver.a@demo.sahana.test | Society A. Approve a critical setting or an approval request. This user cannot approve their own submission. |
| admin.b@demo.sahana.test | Society B. Society A records are not listed. |

Password: the `SEED_DEMO_PASSWORD` you set.

The seed includes one active member (DEMO-001, Nimal Perera), a spouse profile, a posted contribution, a welfare claim, a loan product, a project created from a suggestion, an emergency request, an ESG goal, an in-app template, a bank statement line, a budget, and an asset. Signing in as the society administrator also opens that member on the mobile home, because the member row is linked to that login.
