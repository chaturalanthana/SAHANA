# SAHANA AI Constitution

Status: active from the governance foundation (31 October 2026).
Applies to: every human and every AI coding agent that changes this repository.
Baseline: SAHANA Initial SRS v1.0 (31 October 2026). The October 2026 CBL solution proposal is context only.

This document states permanent engineering principles. `NON_NEGOTIABLE_RULES.md` states the release-blocking prohibitions that follow from them. If a task conflicts with either document, stop the affected work.

## Authority order

When sources disagree, use the first source that decides the point:

1. The latest explicitly approved requirement or decision recorded in `docs/decisions/DECISIONS.md`.
2. The approved SAHANA SRS.
3. Approved architecture decisions in `docs/decisions/DECISIONS.md`.
4. This constitution and `NON_NEGOTIABLE_RULES.md`.
5. `DEVELOPMENT_GUIDE.md` and `UI_UX_GUIDE.md`.
6. Existing code and its conventions, once code exists.
7. An engineering recommendation that has not been approved.

An example, a configurable option, a slide in the proposal deck, or a default an agent finds convenient is not an approved business rule (SRS 001).

## Principles

### 1. Requirements first

- Read the SRS clause and the traceability row in `docs/requirements/TRACEABILITY_MATRIX.md` before implementing a feature.
- Implement only the slice named in the current task. Do not start a later milestone module because it would be convenient to scaffold it now.
- If two requirements conflict, or a required formula is missing, stop that slice and add or update an open decision. Do not pick a formula to keep moving.

### 2. Architecture discipline

- SAHANA is a modular monolith: one API, one PostgreSQL database, one web app, one mobile app, shared contracts in packages (SRS 032).
- Web and mobile talk to the backend only through the common REST API. Do not embed a second rules engine in a client.
- Do not add a major framework (ORM, mobile runtime, workflow engine, cache, UI kit) until the decision is recorded as accepted. Prisma, Expo, and Redis are recommendations pending review, not approvals.
- Do not replace a working boundary without an accepted decision.

### 3. Security by design

- Every tenant row belongs to one society. A query, export, file, notification, or report that can return another society's data is a defect (SRS 002, SRS 031).
- Authorization is enforced in the API. A hidden button is not access control (SRS 031).
- Personal, family, medical, and financial fields are restricted by permission. A Member 360 screen must not load sections the caller cannot see (SRS 009).
- Secrets stay in deployment configuration or a secrets manager. Settings pages, API responses, exports, logs, and docs must not contain them (SRS 030).

### 4. Financial correctness

- Each society has one authoritative general ledger. Welfare, loans, and projects post into that ledger. They do not keep a second balance that can drift (SRS 018).
- Journals balance. Posted entries are not edited in place. Corrections are reversing entries with an actor, a reason, and a time (SRS 018, SRS 020).
- Approved, payable, and paid are different states. Posting or paying twice for the same obligation is a defect (SRS 013, SRS 020).
- Do not build a payroll engine. Loan interest, fees, settlement, rescheduling, and default treatment stay unimplemented until OD 03 is approved (SRS 017).

### 5. Multilingual by default

- English, Sinhala, and Tamil are first-class from the first screen (SRS 004). A feature with hardcoded user-facing English is incomplete.
- User-facing copy, validation, navigation, help, notifications, and generated report labels come from shared translation resources.
- Names, addresses, documents, and sensitive descriptions are stored as entered. Do not machine-translate personal records (SRS 005).
- Changing language must not change a financial amount, an eligibility result, or a permission (SRS 005).

### 6. Responsive by default

- A web screen is not done until the same task works at 320px, on a tablet, and on a desktop (SRS 006). This is P0, not a polish pass.
- The mobile app is the member channel: own profile, family, requests, status, activities, suggestions, notifications, and emergency assistance (SRS 007). It is not a second copy of the administrative ERP.
- The mobile app is online-first. Do not add offline queues, local SQLite sync, or conflict resolution without an accepted decision (SRS 007).

### 7. Performance by design

- Design for 100,000 members per society, large family sets, and high volumes of historical transactions, notifications, and reports (SRS 033).
- Lists are paginated on the server. Searches and reports use indexes and bounded queries. Imports, bulk notifications, and large reports run as background work.
- Do not state that SAHANA supports 100,000 members until a representative dataset test has been executed and recorded (SRS 033).

### 8. Evidence-based ESG

- ESG figures come from eligible, verified source records: projects, member activities, and finance transactions that meet the approved verification rule (SRS 025, SRS 026).
- Unverified or missing data is shown as unverified or missing. It is never shown as performance.
- Beneficiary counts and financial impact are counted once. The calculation definition, period, sources, and verifier stay attached to the result (SRS 026).
- ESG scope is the welfare society's own activities, not the parent employer's full ESG report.
- Illustrative measures in the SRS (participation, volunteer hours, beneficiaries, project spend) are examples. They are not conversion factors, carbon claims, or certification (SRS 025).

### 9. Maintainability

- Prefer a small, clear change over a large generated one. The master prompt forbids trading correctness, maintainability, or usability for volume of code.
- Business rules that societies must change (schemes, limits, approval routes, notification templates, configuration) are data, versioned and effective-dated, not constants in code (SRS 012, SRS 014, SRS 028).
- Shared types, validation, and translations live in packages. Do not copy a contract into a client.

### 10. Test-driven verification

- A behavior that protects money, isolation, or eligibility has an automated test before the slice is called complete.
- Report the command that ran and the result. Do not describe a test as passed because the code looks correct.

### 11. Human approval for critical decisions

- These require a named owner and an accepted decision before the affected code is written: eligibility and benefit formulas, contribution amounts, loan interest and fees, chart of accounts and fund rules, approval thresholds, ESG definitions and double-counting rules, notification providers and consent, hosting and recovery objectives, and any scope change (SRS OD 01–OD 08, SRS 034).
- Schema that only stores a future rule may be proposed. Code that computes an unapproved rule may not.

### 12. Accurate implementation reporting

- For each development task, report requirement understanding, plan, open decisions, what changed, what was verified, what is incomplete or blocked, and the next dependency-aware step.
- "Files were generated" is not "feature complete". Use the Definition of Done in `DEVELOPMENT_GUIDE.md`.

## How an agent applies this

Before editing:

1. Read this file, `NON_NEGOTIABLE_RULES.md`, and the guide that matches the change (`DEVELOPMENT_GUIDE.md` or `UI_UX_GUIDE.md`).
2. Read the traceability rows and any open decision that touches the slice.
3. If the slice depends on an open formula or an unaccepted technology choice, write the blocker and stop that slice.

After editing:

1. Update the traceability status only to the state the evidence supports (`Planned`, `In progress`, `Blocked`, `Done`).
2. Update `DECISIONS.md` when a new ambiguity appears. Do not leave it only in a chat message.
