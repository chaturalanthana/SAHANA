# SAHANA Non-Negotiable Rules

Status: active from the governance foundation (31 October 2026).
A violation is a release-blocking defect. Do not merge, tag, or describe a release as ready while one is open.
Each rule names the SRS clause it enforces and the response an agent must take.

## NN-01 No unauthorized scope expansion

SRS 001, SRS 034. Phase 2 items are out of MVP: kiosk, committee voting and quorum workflows, and functional WhatsApp sending.

- Do not add a module, integration, or workflow that is not in the approved SRS or an accepted decision.
- Do not implement a later milestone while a foundation dependency is still open.
- Response: stop, record the proposed scope in `docs/decisions/DECISIONS.md`, and wait for approval.

## NN-02 No cross-society data leakage

SRS 002, SRS 031.

- Every read and write of tenant data is scoped to the caller's authorized society.
- Exports, search, reports, files, notifications, audits, and background jobs use the same scope. A job that iterates "all members" without a society filter violates this rule.
- Cross-society access requires an explicit authorization model that does not exist yet. Until that decision is accepted, no API returns another society's rows.
- Response: treat any query, join, or cache key that omits society scope as a defect. Add a regression test that proves a second society is invisible.

## NN-03 No frontend-only authorization

SRS 003, SRS 006, SRS 031.

- Hiding a menu, button, or route is not authorization.
- The API checks the caller's permissions, society, and record scope on every mutation and on every read of personal, medical, family, or financial data.
- The web and mobile clients may hide tasks the user cannot perform, and they must, but the API remains the control.
- Response: reject a change that enforces a permission only in React or React Native.

## NN-04 No hardcoded credentials

SRS 030.

- Database URLs, signing keys, encryption keys, provider secrets, and deployment-managed service addresses live in protected configuration or a secrets manager.
- Ordinary administrator settings, API responses, exports, logs, fixtures committed to git, and markdown docs must not contain them.
- `.env` files are gitignored. Only `.env.example` with empty or obvious placeholders may be committed.
- Response: if a secret is committed, stop and report it. Do not copy it into another file "temporarily".

## NN-05 No undocumented database changes

SRS 032. Schema changes ship as migrations reviewed with the code.

- Do not alter a database by hand and leave the repo unaware.
- A migration has a stated purpose, a rollback or forward-fix note, and indexes for the access path it introduces.
- Response: do not claim a feature is done if its tables exist only in a local database.

## NN-06 No silent editing of posted financial records

SRS 018, SRS 020.

- A posted journal, receipt, payment, or disbursement is immutable.
- Corrections are new reversing or adjusting entries that reference the original, with actor, reason, and timestamp.
- Approved, payable, and paid stay distinct. A status flag must not skip a state to force a balance to look right.
- Response: reject an update or delete of a posted financial row. Provide a reversal path instead, once the financial slice is in scope.

## NN-07 No fabricated welfare or loan formulas

SRS 001, SRS 014, SRS 017.

- Eligibility, waiting periods, contribution amounts, benefit limits, exception authority, interest, fees, settlement, rescheduling, and default treatment come from an accepted decision, then from versioned society configuration.
- Do not hardcode a rate, a cap, a waiting period, or a rounding rule because a sample or a proposal slide showed one.
- Completed cases are not recalculated when a rule changes. Treatment of pending cases waits on OD 02.
- Response: stop the calculation slice, cite the open decision, and implement only storage and display of an already-approved rule version.

## NN-08 No hardcoded user-facing English strings

SRS 004, SRS 005.

- Labels, buttons, validation, empty states, errors, notifications, and report headings used by a person go through the shared i18n resources for English, Sinhala, and Tamil.
- Proper nouns stored as data (a member's name, an address, a free-text description) are not translation keys.
- A missing translation uses the agreed fallback language and is reported by the completeness check. It is not silently replaced with a new English literal in a component.
- Response: a screen or template that ships with only English literals is incomplete, not done.

## NN-09 No desktop-only Web ERP screens

SRS 006. Responsive web is P0.

- Core tasks must be completable from 320px width upward: readable text, reachable actions, and layouts that fit English, Sinhala, and Tamil.
- Do not mark a page done from a desktop screenshot alone.
- Response: if a layout only works with a wide table and no small-screen alternative, keep the task incomplete and fix the layout before claiming the slice.

## NN-10 No unbounded database queries

SRS 033.

- List and search endpoints require pagination. A hard maximum page size is enforced on the server.
- Exports, reports, imports, and notification fan-out that can exceed a request budget run as background jobs with a status the user can see.
- Response: do not add `findMany` (or equivalent) over members, ledger lines, notifications, or audit rows without a limit and a supporting index.

## NN-11 No unverified ESG impact calculations

SRS 024, SRS 025, SRS 026.

- A KPI value is computed only from source records that meet the approved verification rule for that KPI definition.
- Do not invent a unit, a baseline, a conversion factor, or a carbon factor. OD 05 must be accepted first.
- Do not add the same beneficiary or the same financial amount to two results unless the accepted double-counting rule says to.
- Withdrawing verification or reversing a source transaction updates affected results under the accepted period-control policy and keeps the prior history.
- Response: dashboards may show configured goals and unverified activity counts. They must not present an unverified total as impact.

## NN-12 No production changes without appropriate controls

SRS 029, SRS 031, SRS 034.

- Changes to designated critical settings require the additional approval recorded for that setting.
- Production deploys, data migrations, and opening-balance loads require the backup and recovery checks agreed under OD 07, and a recorded operator.
- Do not run a destructive migration, a production seed, or a bulk correction against a live society as part of local development.
- Response: stop and ask before any command whose target is not a local or explicitly approved environment.

## NN-13 No claims of successful testing without executing tests

SRS 033, SRS 034, Definition of Done.

- "Should pass", "tests were added", and "typecheck looks fine" are not test results.
- The task report names the command, the scope, and the outcome. If a test could not be run, say so and why.
- A capacity, backup-restore, localization, or reconciliation claim requires the corresponding executed evidence.
- Response: leave the completion summary as incomplete or blocked rather than filling in a pass.

## NN-14 No replacement of official emergency services

SRS 015, SRS 016.

- Emergency assistance copy must state that SAHANA coordinates society welfare assistance and does not replace ambulance, police, or other emergency services.
- Do not require document uploads before the first emergency submission.
- Location is optional and collected only with an explicit permission. Retention of location waits on the agreed policy under SRS 016.
- Response: reject emergency UI or notifications that present SAHANA as an emergency-services dispatcher.

## NN-15 No second source of truth for members or money

SRS 009, SRS 018.

- There is one member registry. Clients do not keep a private membership status that the API does not return.
- There is one general ledger per society. Fund and project balances are dimensions of that ledger, not separate ledgers.
- Deleting or anonymizing a member does not erase financial, claim, or audit history (SRS 011).
- Response: if a design needs a second balance or a second member status, stop and record the conflict.

## How to apply a violation

1. Stop the affected change. Do not "finish the rest" of a slice that depends on the violation.
2. Record the rule id (NN-xx), the file or behavior, and the blocking decision if one exists.
3. Add a test or a review check that would catch the same violation when the slice resumes.
4. Do not downgrade the rule in code comments or in a commit message.
