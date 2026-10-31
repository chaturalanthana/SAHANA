# Milestone 0 Implementation Plan

Status: **approved** on 31 October 2026 by the project owner. TD-01 through TD-05 are accepted in `docs/decisions/DECISIONS.md`. Implementation follows this plan. Redis is not part of this milestone (TD-05). Local foundation checks passed on 31 October 2026, including TOTP enrollment and language persistence. The plan is not marked **implemented** until the pull request workflow repeats `pnpm i18n:check`, lint, typecheck, and test. A physical device sign-in was not run; the mobile shell typechecks and calls the same login API the API tests cover.
Date: 31 October 2026.
Depends on: `docs/ai/IMPLEMENTATION_PLAN.md`, `docs/architecture/DATABASE_ARCHITECTURE.md`, `docs/decisions/DECISIONS.md`.

Milestone 0 builds the foundation only: workspace, CI, database tooling, API shell, authentication, RBAC, society isolation, localization resources, a responsive shell, safe configuration, and logging. It does not build members, welfare, finance, projects, ESG, or a working emergency submission.

## Goal

A reviewer can sign in to a society on the web and on the mobile shell, see only that society's configuration, switch among English, Sinhala, and Tamil, and be denied a request that targets another society. No business formula is calculated.

## Decisions required before coding starts

| ID | Needed choice | If still open |
|---|---|---|
| TD-01 | Shared schema plus RLS, or a stated alternative | Do not write the first tenant migration |
| TD-02 | Prisma, or another stated data access tool | Do not add an ORM dependency |
| TD-03 | Expo, or bare React Native | Do not create `apps/mobile` |
| TD-04 | Cookie session plus mobile refresh token, or a stated alternative | Do not implement login |
| TD-05 | Job interface with an in-process adapter now, Redis later | Do not add Redis in Milestone 0. The interface may wait until the first bulk job |

Waiver means a named owner writes "waived for Milestone 0" on that row in `DECISIONS.md`, with a date. Silence is not a waiver.

## Work breakdown

### 1. Workspace

Create the layout from `DEVELOPMENT_GUIDE.md`:

- `pnpm-workspace.yaml` including `apps/*` and `packages/*`.
- Root `package.json` private, with scripts that delegate: `lint`, `typecheck`, `test`, `format`.
- `tooling/` holds the shared ESLint, Prettier, and `tsconfig` bases. TypeScript `strict` is on.
- `apps/web` — Vite, React, TypeScript, React Router, TanStack Query, Tailwind, React Hook Form.
- `apps/api` — Express, TypeScript, Zod via `packages/validation`.
- `apps/mobile` — only after TD-03. Online-first shell, no SQLite sync.
- Packages: `ui-web`, `ui-mobile`, `design-tokens`, `api-client`, `types`, `validation`, `i18n`.
- `.env.example` with empty placeholders: `DATABASE_URL`, `SESSION_SECRET`. No real values. `.gitignore` already excludes `.env`.

Do not add Nest, GraphQL, a UI component vendor that fights the token rules, or a state library beyond TanStack Query and the router.

### 2. API shell

- Process starts from configuration, refuses to boot in production without required secrets, and logs the society-free fields only.
- `GET /api/v1/health` returns process up and database reachable, with no society data.
- `GET /api/v1/version` returns the git revision or package version.
- Every response carries a `traceId`. Errors use the shape in the development guide (`code`, `messageKey`, `fields`, `traceId`).
- Request body limit set. JSON only for Milestone 0.
- Rate limit on the login route. Exact threshold is a config value with a conservative default (for example 10 attempts per 15 minutes per IP) recorded in the config allow-list, not buried in a middleware literal without a name.

### 3. Database and tenancy

- Migration tool from the accepted TD-02 choice.
- First migration: `societies`, `users`, `society_users`, `permissions`, `roles`, `role_permissions`, `society_user_roles`, `sessions`, `audit_events`, `config_definitions`, `config_versions`.
- RLS policies in that same migration if TD-01 includes RLS.
- Seed: one local society, one platform administrator, one society administrator, permission codes for `config.read`, `config.write`, `users.read`, `users.invite`, `audit.read`. Seed runs only when `SEED_DEMO=true` and the environment is not production.
- Repository helpers require `societyId`. A test deletes or withholds the session society and expects 401 or 403, and a second test with society B's user expects no rows from society A.

### 4. Authentication and RBAC

- Implement only the TD-04 mechanism.
- Password hashing per TD-07's proposal (Argon2id) unless a waiver names another algorithm.
- Login, logout, and current-user endpoints. Login failure audit does not record the password.
- MFA columns and an enrollment endpoint may exist. Forcing MFA for privileged users is a production gate (Milestone 6), not a reason to block local sign-in, unless the security owner says otherwise in TD-07.
- Authorization middleware loads permissions for the session's society. A route declares the permission it requires. Missing permission returns 403 with `messageKey`, not a stack trace.

### 5. Localization

- `packages/i18n` resources for `en`, `si`, and `ta`.
- Milestone 0 namespaces: `common`, `auth`, `shell`, `config`, `errors`.
- Sinhala and Tamil values for those keys are real translations, reviewed as draft, not English copied three times. Mark unreviewed keys in a comment at the top of the locale file so OD 06's reviewer can find them.
- Fallback language: do not pick one silently. Until OD 06, missing keys render the key id and fail the completeness check. That is intentional.
- A script `pnpm i18n:check` fails CI when a key is absent from any of the three files.
- Web and mobile shells set the document or locale language and persist the user's choice after login. Society default applies before login.

### 6. Design system and responsive shell

- `packages/design-tokens` exports the semantic colors and the spacing scale from `UI_UX_GUIDE.md`. No raw hex in feature components.
- Web shell: language switcher, society name, user menu, and a single sample page (configuration view) that completes at 320px, 768px, and 1024px.
- Mobile shell: sign-in, language switcher, home with the emergency action visible and disabled, with copy that emergency submission is not available yet and that SAHANA will not replace emergency services (NN-14). The button must not call a submit API.
- Fonts that cover Sinhala and Tamil are selected in this milestone and named in the token package. If a license blocks embedding, record the blocker instead of substituting a Latin-only font and calling the task done.

### 7. Configuration

- Allow-list of Milestone 0 keys: society display name, logo file id, contact email, contact phone, default language (`en`|`si`|`ta`), currency code, timezone, and environment display label.
- Values are versioned in `config_versions` with actor and reason (SRS 029).
- Critical flag on currency and timezone. Changing them requires a second permission, `config.approve`, held by a different user than the editor. If the seed has only one admin, the test uses two users.
- API responses for config never include `DATABASE_URL`, session secrets, or provider keys (SRS 030). A test asserts the settings payload has an explicit key allow-list.
- Terms and consent tables may be created empty. Consent copy is not invented; the screen shows an empty state until the society supplies text.

### 8. Observability and CI

- Structured logger as specified in the development guide.
- GitHub Actions workflow: `pnpm install --frozen-lockfile`, lint, typecheck, unit tests, API tests against a disposable PostgreSQL service, `pnpm i18n:check`.
- The workflow does not deploy.
- Playwright is installed but the only Milestone 0 browser test is sign-in and the configuration page at a 320px viewport and a desktop viewport. Further journeys wait for later milestones.

### 9. Documentation updates when the code exists

- OpenAPI file in `docs/api/` for the Milestone 0 routes.
- Traceability rows for SRS 002, SRS 004–007, SRS 028–032 move to **In progress** when work starts and to **Done** only under the Definition of Done.
- This plan's status line changes to **implemented** with the date and the test evidence, not before.

## Out of scope

- Member, family, claim, ledger, loan, project, ESG, and emergency tables beyond a disabled mobile button.
- SMS, email, and push provider accounts.
- Redis, even if TD-05 is later accepted. Milestone 0 has no bulk job.
- Production hosting, backup software, and load tests. Those are Milestone 6 and OD 07.
- Any welfare amount, interest rate, or ESG number, including seeds and screenshots.

## Acceptance criteria

1. `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm i18n:check` pass in CI on a clean checkout. Evidence is the workflow run, not a local claim alone.
2. Two societies exist in the test database. Society A's administrator receives an empty list or 404 for society B's config and users. The test is in the repository.
3. A user without `config.write` cannot change a setting. The API returns 403 even if the client is bypassed.
4. A posted config change stores a new version and an audit event. The previous version remains readable.
5. The settings JSON from the API contains only allow-listed keys.
6. The web configuration task is completed in a browser at 320px and at a desktop width, in English and with Sinhala and Tamil locales loaded.
7. The mobile shell signs in and shows the disabled emergency entry with the non-replacement sentence in all three languages.
8. Login does not succeed with a wrong password, and the audit log contains the failure without the password.
9. No `.env` file is committed. Secret scanning of the diff shows no connection strings.

## Testing gate

- Unit tests for permission checks and config validation.
- API tests for health, login, cross-society denial, and config versioning.
- One Playwright spec for the web shell.
- Commands and results written into the task report (NN-13). A local pass that CI cannot repeat is not the gate.

## Security checkpoint

- RLS or the accepted TD-01 substitute is on for every tenant table created here.
- Session secret loaded from the environment, missing secret fails boot outside local development.
- Passwords hashed, never logged, never returned.
- Seed users documented as local-only, with a password that comes from the environment when seeding, not from a constant in git. The example in `.env.example` is an obvious placeholder such as `change-me`.

## Performance checkpoint

- No list endpoint in Milestone 0 returns an unbounded array. User lists are paginated even for the seed data.
- Health check does not scan tenant tables.
- Targets for 100,000 members are not measured in this milestone and must not be claimed.

## Local evidence, 31 October 2026

These commands were run on the developer machine. They are not a GitHub Actions run.

| Check | Result |
|---|---|
| `pnpm lint` | Passed after the viewport and API test edits. |
| `pnpm typecheck` | Passed for all 10 packages, including the mobile shell. |
| `pnpm i18n:check` | Passed. 54 keys in English, Sinhala, and Tamil. Sinhala and Tamil remain unreviewed (OD 06). |
| API foundation tests | 6 passed via `vitest run` against a disposable database named `sahana_test`. `pnpm --filter @sahana/api test` then failed at `prisma generate` because the running API process had the query-engine file open. |
| `pnpm test:e2e` | 3 passed: desktop 1280×800, tablet 768×1024, phone 320×720. Each signed in, saved a contact phone, and showed the Sinhala and Tamil configuration headings. |
| `pnpm i18n:check`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter @sahana/api exec vitest run` | Passed on 31 October 2026. API tests: 20 passed. |
| Mobile sign-in on a device | Not run. The shell persists language after login and shows the non-replacement sentence from the shared catalogs. |
| Backup, MFA enforcement, 100,000-member load | Not run. |

## Exit

Milestone 0 is complete when every acceptance criterion has executed evidence and the open NN rules are clear. Milestone 1 planning may then start. Milestone 1 coding still waits on OD 01 for final member fields, but the registry skeleton can be planned against the database proposal.

## Approval

| Role | Name | Date | Decision (approve / reject / waive TDs) |
|---|---|---|---|
| Project owner | Recorded from the approval to proceed. No personal name was given. | 2026-10-31 | Approve Milestone 0. Accept TD-01, TD-02, TD-03, TD-04, and TD-05 as proposed. |
| Security reviewer | | | |
| Society sponsor (informed) | | | |

Approval of this plan authorizes Milestone 0 only. It does not accept OD 01–OD 08 and it does not authorize later milestones.
