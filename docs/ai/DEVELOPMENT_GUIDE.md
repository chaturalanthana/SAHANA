# SAHANA Development Guide

Status: active from the governance foundation (31 October 2026).
Read `AI_CONSTITUTION.md` and `NON_NEGOTIABLE_RULES.md` first. This guide says how to build a change that already passed those rules.

## Architecture principles

- Modular monolith. One Node.js + Express + TypeScript API owns business rules. React web and React Native mobile are clients (SRS 032).
- pnpm workspace. Applications live in `apps/`. Shared contracts live in `packages/`. UI is not shared between web and mobile; tokens, types, validation, and translations are.
- A module owns its tables, its API routes, and its permission checks. Another module calls it through a service function in the API, not by writing its tables.
- Clients never talk to PostgreSQL. Background jobs use the same services as HTTP handlers so society scope and audit behavior stay identical.

Target layout once Milestone 0 is approved:

```text
sahana/
├── apps/
│   ├── web/                 React + TypeScript + Vite
│   ├── mobile/              React Native + TypeScript
│   └── api/                 Express + TypeScript
├── packages/
│   ├── ui-web/
│   ├── ui-mobile/
│   ├── design-tokens/
│   ├── api-client/
│   ├── types/
│   ├── validation/          Zod schemas shared by API and clients
│   └── i18n/                en, si, ta resources
├── docs/
└── tooling/
```

Do not introduce Nest, a BPMN engine, a second ORM, GraphQL, or offline sync without an accepted decision.

## Module boundaries

API modules, in dependency order:

| Module | Owns | Must not own |
|---|---|---|
| identity | users, sessions, roles, permissions | member personal history |
| tenancy | society context resolution | business rules of other modules |
| config | versioned society and platform settings | secrets |
| audit | append-only audit events | the business decision itself |
| governance | committees, meetings, documents | member balances |
| members | registry, lifecycle, family links | claim decisions |
| welfare | schemes, rule versions, claims | ledger lines |
| emergency | requests, assignment, tracking | a second payment record |
| loans | products, applications, schedules | interest math until OD 03 |
| ledger | chart, journals, funds, periods | welfare eligibility |
| approvals | routes, inbox, decisions | the domain record's own fields beyond status |
| projects | projects, participation, suggestions | ESG formulas |
| esg | goals, KPI definitions, verified results | source-record edits |
| notifications | templates, deliveries, preferences | business event creation |
| reporting | read models and exports | new writes except export audit |

A workflow that needs two modules (for example an approved claim that becomes a payable) does it in one database transaction in the API, with one module coordinating and the other exposing a posting function.

## Folder and naming conventions

- Files and folders: `kebab-case`. React components: `PascalCase.tsx`. Functions and variables: `camelCase`. Types: `PascalCase`. Database tables and columns: `snake_case`.
- API route files mirror the resource: `claims.routes.ts`, `claims.service.ts`, `claims.repo.ts`.
- A permission code is `module.action`, for example `claims.approve` and `members.read_sensitive`.
- Translation keys are `module.screen.element`, for example `emergency.submit.title`.
- Do not name a type `Data`, `Item`, or `Utils`. Name the domain noun.

## TypeScript standards

- `strict` is on. No `any` unless a boundary comment explains why and a follow-up narrows it. Prefer `unknown` plus a Zod parse at the boundary.
- Shared request and response types live in `packages/types`. Runtime validation lives in `packages/validation` and is called by the API before a service runs. Clients use the same schemas for forms.
- Do not duplicate a DTO as a hand-written interface in a client once the shared type exists.
- Export only the service functions other modules are allowed to call.

## API design standards

- REST over JSON. Resource nouns, plural collections: `/api/v1/members`, `/api/v1/claims/{id}`.
- Society context comes from the authenticated session, not from a client-supplied `societyId` that can be swapped to poke another tenant. A platform administrator acting on a society uses an explicit, audited society switch.
- List endpoints accept `page` and `pageSize`. The server clamps `pageSize` (default 25, maximum 100). Responses include `page`, `pageSize`, and `total` when the count is affordable; otherwise a `hasMore` cursor. Do not offer an unpaged mode.
- Mutations that clients may retry (submit claim, submit emergency, post journal) accept an `Idempotency-Key` header and store the outcome.
- Errors use one shape: `code`, `messageKey` (a translation key, not a sentence), `fields` for validation, and a `traceId`. HTTP status matches the failure: 400 validation, 401 unauthenticated, 403 unauthorized, 404 hidden or missing, 409 conflict, 422 rule rejection.
- A 404 is used when revealing that a row exists in another society would leak information.
- OpenAPI is generated or hand-maintained in `docs/api/` and matches the routes. A route without a contract is not done.

## Database conventions

- PostgreSQL. Unicode storage for all text (SRS 005).
- Every tenant table has `society_id` and a foreign key to `societies`. See `docs/architecture/DATABASE_ARCHITECTURE.md`.
- Primary keys are UUIDs generated by the database or by the API before insert. Do not use sequential ids in URLs for member, family, medical, or financial records.
- Audit columns on operational tables: `created_at`, `created_by`, `updated_at`, `updated_by`. Financial postings and audit events are append-only and omit `updated_*`.
- Money is `numeric(19,4)` in the society's currency. Do not use floating point. Display formatting is a client concern and must not change the stored value when the language changes (SRS 005).
- Timestamps are `timestamptz` stored in UTC. The society timezone from configuration is used only for display and for period boundaries.
- Schema changes are migrations with a short header comment: purpose, tenant impact, and whether a backfill is required.

## Transaction management

- A use case that writes more than one row runs in a single transaction.
- Posting a balanced journal and moving a claim to payable commit or roll back together.
- Do not hold a transaction open across a call to SMS, email, push, or file storage. Write the business result, enqueue the notification, and let the worker retry delivery.
- Isolation: `READ COMMITTED` is the default. Use a stronger lock only for a named contention point such as issuing a member number or consuming an idempotency key, and document it.

## Error handling

- Services throw typed domain errors (`NotAuthorized`, `RuleRejected`, `Conflict`, `NotFound`). The HTTP layer maps them. Repositories do not throw HTTP errors.
- A rule rejection includes the rule version id when one applies, so the client can show why a claim was ineligible (SRS 013) without inventing the formula in the UI.
- Unexpected errors are logged with `traceId` and returned as a generic translated message. The raw database error is not sent to the client.

## Logging

- Structured logs: `timestamp`, `level`, `traceId`, `societyId`, `actorId`, `module`, `message`.
- Never log national identity numbers, medical notes, document contents, passwords, tokens, or secrets (NN-04, SRS 030).
- Security-relevant events (login, denial, export, settings change, financial reversal, emergency acknowledgement) also write an audit row. A log line is not an audit trail.

## Authentication and authorization

- Authenticate on the API. Session or token choice is TD-04 and stays unresolved until accepted. Milestone 0 may implement the accepted option only.
- Passwords are hashed with a current adaptive algorithm (Argon2id unless a later decision names another). MFA is required for privileged roles before production (SRS 031); the factor mechanism waits on OD 07 / SRS 031 agreement, but the enrollment hook is part of identity.
- A permission check takes actor, society, action, and when needed the record. Record-level rules (a member reads only their own family links) live next to the module, not in a single growing `if` in the client.
- Separation of duties and self-approval rules come from the approval route (SRS 019), once OD 04 is approved. Do not hardcode "treasurer can always approve".

## Data validation

- Validate at the boundary with Zod schemas from `packages/validation`.
- Validate again inside the service for rules that depend on stored state (duplicate claim, limit remaining, period open). Client validation is a convenience.
- Configuration values are typed and checked against an allow-list. URLs in settings are validated and restricted to approved schemes (SRS 029).
- File uploads: allow-list of types, size cap, virus-scan hook when the hosting decision provides one, and storage keys that are not guessable. Access is authorized per request, not by a public URL.

## Testing standards

- Vitest for unit and service tests. Playwright for web end-to-end flows of core tasks. API tests hit the service or HTTP layer with a society fixture.
- Minimum for a slice that moves money, changes membership, or reads personal data:
  - allowed actor succeeds inside their society;
  - same actor is denied in another society (NN-02);
  - actor without the permission is denied (NN-03);
  - the failure path the SRS names (duplicate, unbalanced journal, missing evidence) is asserted.
- Tests do not use production data. Fixtures are synthetic.
- A test that needs an unapproved formula is not written by inventing the formula. Assert that the engine refuses to calculate until a rule version exists.

## CI/CD

- Pull requests run typecheck, lint, unit tests, and the API tests that do not need a production secret.
- Migrations are applied in CI against a disposable PostgreSQL before API tests.
- A workflow must not print environment secrets. Production deploy is manual until OD 07 names the host and the approval gate (NN-12).
- Dependency installs use the lockfile (`pnpm install --frozen-lockfile`) once the workspace exists.

## Code review

A reviewer checks, in order:

1. Traceability: which SRS row this change serves, and whether an open decision blocks it.
2. Society scope on every new query.
3. Permission check on the server.
4. Money and status transitions, if the diff touches them.
5. Translation keys for new user-facing copy in all three languages, or a logged gap if a translation is not yet supplied.
6. Pagination and indexes for any new list.
7. Tests that match the risk, and evidence they were run.

## Documentation requirements

- Update `TRACEABILITY_MATRIX.md` status when a slice starts, blocks, or finishes.
- Update `DECISIONS.md` when a new ambiguity is discovered. Do not leave it only in chat.
- Update OpenAPI when a route changes.
- A migration's purpose belongs in the migration header, not only in a chat summary.

## Definition of Done

A feature is done only when all of the following are true:

- The SRS clause and module row are identified, and no open decision still blocks the behavior.
- Migrations are in the repository and applied by the migration tool.
- The API enforces validation, authorization, and society scope.
- The web or mobile UI for that feature exists where the milestone says it should.
- English, Sinhala, and Tamil resources exist for the new copy, or the completeness check lists the missing keys and the slice is not called translated.
- The web UI has been exercised at 320px, tablet, and desktop for the task (NN-09).
- Errors, empty states, and loading states use the shared patterns.
- Audit rows exist for sensitive reads and for every mutation the SRS says to record.
- The relevant tests were executed and the command plus result are in the task report (NN-13).
- Docs named above are updated.
- No open NN-rule violation remains in the slice.

Generating code, or writing a plan, does not satisfy this list.
