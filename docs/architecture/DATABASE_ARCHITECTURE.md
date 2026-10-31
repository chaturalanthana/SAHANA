# Database Architecture Proposal

Status: storage tables for later milestones were added on 31 October 2026. Formula bodies stay uninterpreted. OD 01–OD 05 still block eligibility, interest, approval thresholds, chart contents, and ESG calculations.
Baseline: SRS 002, SRS 018, SRS 032, SRS 033.

This document names databases, tenancy, domains, and the patterns every later migration must follow. It deliberately stops before column-level DDL. Column lists for member fields, scheme rules, loan math, and ESG formulas are blocked by OD 01, OD 02, OD 03, and OD 05.

## Database

- One PostgreSQL database per environment (local, and later test and production when OD 07 names them).
- Encoding UTF-8. Collation must not strip Sinhala or Tamil characters. Name searches use a case-insensitive comparison that still matches Unicode letters; the exact collation is chosen when the first member-search migration is written and is recorded then.
- Extensions expected: `pgcrypto` for `gen_random_uuid()` if the server version needs it. No extension is required for tenancy.
- Time stored as `timestamptz` in UTC. Society timezone is a configuration value used when calculating a local period boundary, not a reason to store local timestamps.

## Tenancy

### Recommended model (TD-01, not yet accepted)

Shared schema. Every tenant table has `society_id uuid not null` referencing `societies(id)`.

Enforcement, in two layers:

1. The API resolves the society from the authenticated session and passes it into every repository call. A repository function that reads or writes a tenant table takes `societyId` as a required argument. There is no default.
2. PostgreSQL row-level security is enabled on tenant tables. The API sets a transaction-local setting (`app.society_id`) after authentication. Policies allow a row only when `society_id` matches that setting. A platform administrator's cross-society action, if one is ever approved under OD 01, uses a separate role with an audited reason. Until OD 01 approves it, that role does not exist.

Why this model:

- One migration stream and one connection pool, which a modular monolith can operate.
- Society isolation is visible in SQL, not only in application memory.
- A 100,000-member society is a data problem (indexes, pagination), not a reason to split databases on day one.

### Alternatives, recorded so they are not re-litigated silently

| Model | When it would win | Why it is not the recommendation |
|---|---|---|
| Schema per society | A regulator requires physical separation of DDL, or societies customize columns. | Migrations multiply by society count. SAHANA's rules are data, not per-society schemas (SRS 012). |
| Database per society | A contract requires separate backups and credentials per society. | Operational cost is high before the first society is live. Backup isolation can be added later by moving one society out if a contract demands it. |

Rejecting an alternative here is still a proposal. TD-01 must be accepted before the first tenant migration.

### Tables that are not tenant tables

- `societies` itself.
- Platform-level roles that ship with the product (`platform_admin`) and permission catalog rows that are global templates.
- A user account may be global, with a membership in one or more societies through `society_users`. SRS 002 forbids assuming a shared member identity across societies. A login user and a member record are different things. Linking one person to two societies' member rows waits on OD 01.

## Identifier and audit patterns

- Primary keys: `uuid`, generated in the database. Not sequential bigints in external URLs for people or money.
- Operational tables: `created_at`, `created_by`, `updated_at`, `updated_by`.
- Append-only tables (journal lines, audit events, consent acceptances, rule versions, notification delivery attempts): `created_at` and `created_by` only. No update, no delete, except where a retention job is later approved under OD 06. The application role used by the API does not receive `UPDATE` or `DELETE` on those tables.
- Soft delete is not used for financial documents. Membership exit changes status and sets effective dates; it does not delete the row (SRS 011).

## Money and periods

- Amounts: `numeric(19,4)` (TD-06, proposed). Currency code lives on the society and is copied onto a posted document so a later currency change cannot rewrite history.
- A journal document has lines. The database rejects a commit of a posted document whose line totals do not balance, using a deferred constraint trigger. The API also checks before insert. Both are required (NN-06).
- Status of a financial document: `draft`, `approved`, `payable`, `paid`, `reversed`. Not every document uses every status. A posted status is terminal except by inserting a reversal document that references `reverses_document_id`.
- Accounting periods belong to the society. Posting into a closed period fails.

## Rule versioning

Used by welfare schemes, approval routes, notification templates, configuration, and ESG KPI definitions.

- A definition row is the stable identity (`welfare_schemes`).
- A version row is immutable once effective (`welfare_scheme_versions` with `version_no`, `effective_from`, `effective_to`, `published_at`, `published_by`).
- A transaction stores the version id it was decided against (`claims.scheme_version_id`). Later edits to a draft version do not change that pointer.
- Publishing a version inserts a new row. It does not update the previous version's rule body.

The **body** of a welfare, loan, or ESG version stays a schema placeholder (`rule_body jsonb` plus a comment that the shape is undefined) until the matching open decision is accepted. Code must not interpret an empty body as "eligible" or as zero interest.

## Domains and principal entities

Names are the proposed tables. Attributes beyond the keys below are filled when the blocking decision is accepted.

### Platform and identity (Milestone 0)

- `societies` — name, default language, currency, timezone, status.
- `users` — login identity, password hash, MFA factor reference, status. No member medical or family data on this row.
- `society_users` — user, society, status.
- `roles`, `permissions`, `role_permissions` — permission catalog is global; role assignments are per society (`society_user_roles`).
- `sessions` — server-side session or refresh-token record (shape depends on TD-04), with expiry and revoke.
- `audit_events` — append-only: society (nullable only for a pre-auth failure), actor, action, object type, object id, trace id, timestamp, and a JSON diff that must already be scrubbed of secrets.

### Configuration (Milestone 0)

- `config_definitions` — key, type, scope (`platform` or `society`), validation rule, whether a change is critical.
- `config_versions` — society nullable for platform scope, value, effective_from, reason, actor. Secrets are not a config key. The allow-list of keys is code plus this table; unknown keys are rejected (SRS 029).
- `consent_documents` and `consent_acceptances` — versioned terms and privacy text per language, and the version a user accepted.

### Governance (Milestone 1)

- `committees`, `committee_roles`, `committee_appointments` — role title is data, not the CBL slide's fixed list. Appointment has start and end.
- `meetings`, `meeting_attendance`, `resolutions`.
- `governance_documents` — file metadata and language; bytes live in object storage, not in PostgreSQL.

Voting tables are not created (Phase 2, NN-01).

### Members and family (Milestone 1)

- `members` — one row per membership in a society. Employee identifier unique per society. Status and category are foreign keys to society-defined lookups once OD 01 lists them. Until then the lookup tables exist and ship empty.
- `member_status_history` — append-only transitions with effective date and reason.
- `family_members` — own identity attributes, not a login. Relationship type is a lookup.
- `member_family_links` — member, family member, relationship, effective dates, evidence document id. Unique active link per pair so duplicate links can be rejected once OD 01 defines "duplicate".
- `member_documents` — metadata only.

Indexes for 100,000 members in one society:

- `(society_id, member_no)` unique.
- `(society_id, status, last_name, first_name)` for the default directory.
- `pg_trgm` on name and employee number, added when search is built, not before, so the extension decision is explicit.

Lists always filter `society_id` first and use `LIMIT`/`OFFSET` or keyset pagination. Keyset is preferred for the directory once the sort key is stable.

### Welfare (Milestone 2) — formula body blocked by OD 02

- `welfare_schemes`, `welfare_scheme_versions` — version row may contain structured columns that are known without a formula: required document types, approval route id, effective dates. Eligibility expression, limits, waiting period, and frequency stay inside the uninterpreted `rule_body` until OD 02.
- `claims` — member, beneficiary family member nullable, scheme version, status, idempotency key, timestamps.
- `claim_events` — append-only status and comments.
- `claim_documents`.

Do not add a generated column that computes a payout amount.

### Approvals (Milestone 2) — thresholds blocked by OD 04

- `approval_routes`, `approval_route_stages` — one to three stages, role, optional amount band. Amount bands can be stored; using them as live policy waits on OD 04.
- `approval_requests`, `approval_decisions` — object type and id, stage, actor, decision, reason, delegated_from. Append-only decisions.

### Ledger (Milestone 3) — chart contents blocked by OD 03

- `accounts` — society chart. Seed data is empty until OD 03. Type (asset, liability, equity, income, expense) is structural and may exist before the chart is chosen.
- `funds` — restricted-purpose dimension.
- `fiscal_periods`.
- `journal_documents`, `journal_lines` — lines carry account, fund, optional project, optional member, debit, credit. Posted documents are immutable.
- `counterparty_entries` for basic payable and receivable open items.
- `bank_accounts`, `bank_statement_lines`, `reconciliation_matches`.
- `budgets`, `assets`, `investments` — record-keeping. Depreciation and valuation methods are not columns that calculate themselves until OD 03.

A database trigger rejects `UPDATE` and `DELETE` on `journal_lines` and on posted `journal_documents`.

### Loans (Milestone 3) — math blocked by OD 03

- `loan_products`, `loan_product_versions` — version body uninterpreted.
- `loan_applications`, `loan_guarantors`, `loan_agreements`.
- `loan_disbursements`, `repayment_schedules`, `repayment_receipts` — schedule generation that depends on interest is not implemented. A manually approved schedule can be stored once the treasurer's rule exists.
- Disbursement and receipt reference `journal_documents`. They do not store a second balance that can diverge (NN-15). Outstanding balance is derived from posted lines.

### Projects (Milestone 4)

- `projects` — category includes an event flag or event category. Committee, dates, budget amount, funding fund id.
- `project_participants` — member and optional family member.
- `project_tasks`, `project_documents`.
- `project_expenses` — optional `journal_document_id` once posted.
- `suggestions` — short text, status (`submitted`, `accepted`, `declined`, `later`), optional `project_id` after conversion. Original text is not edited by conversion; corrections are events.
- `suggestion_events` — append-only.

### Emergency (Milestone 5)

- `emergency_requests` — member, optional family beneficiary, type, phone, description, status, idempotency key. Location columns nullable; a boolean records that permission was given. Retention deletion job waits on OD 04 / SRS 016.
- `emergency_updates` — append-only coordinator notes and status.
- Link to a claim or a journal document when an authorized expense exists. No second payment record.

### ESG (Milestone 5) — calculations blocked by OD 05

- `esg_goals`, `esg_kpi_definitions`, `esg_kpi_versions` — unit, period, owner, verification requirement. Formula body uninterpreted.
- `esg_results` — written only by the calculator, with `kpi_version_id`, period, value, `verification_status`, and `calculation_id`.
- `esg_result_sources` — result id, source table, source id, amount or count contributed. Unique on `(result_id, source_table, source_id)` so the same source cannot be attached twice to one result.
- The calculator is not shipped until OD 05. Tables may be created empty in the milestone that owns them; they must not be filled with sample impact numbers.

### Notifications (scaffold in Milestone 0, delivery later)

- `notification_templates` and versions, per language (`en`, `si`, `ta`).
- `notification_messages` — audience snapshot, template version, scheduled time.
- `notification_deliveries` — channel, status, attempts. Channel `whatsapp` may exist as a disabled enum value and must not be selected for sending (CD-08).

### Files

PostgreSQL stores metadata: owner society, object type, object id, storage key, media type, size, checksum, language. Object bytes live in the environment's object store (chosen with OD 07). Access is an authorized API redirect or stream, not a public bucket URL.

## What this proposal refuses to specify

| Topic | Waiting on |
|---|---|
| Member required columns, categories, departments, statuses | OD 01 |
| Relationship enumeration and duplicate-link rule | OD 01 |
| Eligibility, limits, waiting periods, contribution amounts | OD 02 |
| Chart of accounts, fund list, opening balance shape | OD 03 |
| Interest, fees, penalty, reschedule calculations | OD 03 |
| Approval amount thresholds and emergency SLA timestamps as policy | OD 04 |
| KPI formulas, units beyond a free text column, double-counting across goals | OD 05 |
| Retention periods that would delete audit or location rows | OD 06 |

## Migration rules once implementation is approved

- One migration per change, applied by the migration tool, never by a hand edit (NN-05).
- Every new tenant table enables RLS in the same migration that creates it, if TD-01 is accepted with RLS.
- Every new list path ships an index that starts with `society_id`.
- A migration that backfills financial rows is forbidden. Opening balances are their own journal documents.
- Rollback: prefer a forward fix. A down migration may drop tables only while no environment has production data. After first production data, down migrations are not used to edit posted money.
