# SAHANA Decision Log

Status: opened 31 October 2026 with the governance foundation.
Rules for this file:

- An **accepted** decision may be implemented.
- A **proposed** decision may be implemented only after it is accepted, or after the owner waives it in writing for a named slice.
- An **open** decision blocks the behavior it names. Storage that does not compute the rule may still be designed.
- Do not treat an SRS example, a proposal-deck bullet, or an engineering preference as accepted.

Owner names below are roles. Named people are filled when the society sponsor assigns them.

## Confirmed decisions

These come from the approved SRS baseline and the master build constraints. They do not close OD 01–OD 08.

| ID | Decision | Source | Date | Owner | Modules |
|---|---|---|---|---|---|
| CD-01 | SAHANA is a PERN TypeScript modular monolith: PostgreSQL, Express, React web, Node.js API, React Native mobile. Both clients use one REST API. | SRS 032 | 2026-10-31 | Delivery lead | all |
| CD-02 | English, Sinhala, and Tamil are required from the first release for UI, validation, notifications, and reports. Language does not change amounts, eligibility, or permissions. | SRS 004, SRS 005 | 2026-10-31 | Delivery lead | i18n, all UI |
| CD-03 | Records, rules, funds, and permissions belong to one society. Cross-society access is forbidden until an explicit model is approved. | SRS 002, SRS 031 | 2026-10-31 | Platform administrator | tenancy, all |
| CD-04 | One authoritative general ledger per society. Funds and projects are dimensions. Posted financial rows are immutable; corrections are reversals. | SRS 018, SRS 020 | 2026-10-31 | Treasurer | ledger |
| CD-05 | Welfare and loan formulas are not implied by the baseline. Configuration stores approved rules; code does not invent them. | SRS 001, SRS 014, SRS 017 | 2026-10-31 | Society sponsor | welfare, loans |
| CD-06 | Responsive web from 320px upward is P0. Mobile is online-first member self-service. Offline sync is out of MVP. | SRS 006, SRS 007 | 2026-10-31 | Delivery lead | web, mobile |
| CD-07 | Only the primary employee receives a login in MVP. Family members are beneficiaries, not users. | Master prompt 6.4, consistent with SRS 003 leaving family logins open | 2026-10-31 | Society sponsor | identity, members |
| CD-08 | Kiosk, committee voting, and functional WhatsApp are Phase 2. WhatsApp may appear as a disabled connect option. | SRS delivery priorities, SRS 023 | 2026-10-31 | Product lead | governance, notifications |
| CD-09 | Emergency assistance must say it does not replace official emergency services. Location is optional and permissioned. | SRS 015, SRS 016 | 2026-10-31 | Welfare coordinator | emergency, mobile |
| CD-10 | Capacity target is 100,000 members per society. The claim is valid only after a representative test is executed. | SRS 033 | 2026-10-31 | Delivery lead | platform |
| CD-11 | Secrets are not editable in ordinary settings and must not appear in API responses, exports, or logs. | SRS 030 | 2026-10-31 | Platform administrator | config, security |
| CD-12 | There is no payroll engine in this product. | Master prompt 6.8 | 2026-10-31 | Treasurer | loans, ledger |

CD-07 is confirmed for MVP scope by the master prompt. SRS 003 still lists independent family logins as an open product question for later; that does not reopen logins inside MVP. If the sponsor wants family logins in MVP, that is a scope change under SRS 034.

## Accepted technical decisions

Accepted on 31 October 2026 by the project owner ("Accept. please proceed") so Milestone 0 can be built. OD 01 still forbids a shared member identity across societies. These rows do not decide that.

| ID | Decision | Date | Owner | Modules |
|---|---|---|---|---|
| TD-01 | Shared-schema multi-tenancy. Every tenant table has `society_id`. The API scopes every tenant query. PostgreSQL row-level security is a second barrier. Schema-per-society and database-per-society stay rejected for Milestone 0. | 2026-10-31 | Project owner | tenancy, all tables |
| TD-02 | Prisma owns schema and migrations. Raw SQL is allowed for row-level security and for later ledger posting. Posted financial rows stay immutable in the database; Prisma updates are not a license to edit them (NN-06). | 2026-10-31 | Project owner | api, ledger |
| TD-03 | Mobile shell uses Expo (managed workflow) until a required native module forces prebuild. Supported OS versions remain OD 07. | 2026-10-31 | Project owner | mobile |
| TD-04 | Web uses an HTTP-only session cookie. Mobile uses a short-lived access token and a rotating refresh token kept in secure device storage. | 2026-10-31 | Project owner | identity |
| TD-05 | Bulk work will use a job interface, with Redis when hosting exists and an in-process adapter locally. Milestone 0 has no bulk job and does not add Redis. | 2026-10-31 | Project owner | jobs, notifications, reporting |
| TD-08 | Web chrome follows the public iBilz admin theme (Vuexy-style): collapsible light sidebar, floating top bar with user and language menus, gray page background, white rounded cards, soft shadows, KPI tiles, and data tables. Colors live in `packages/design-tokens` and are shared with mobile. Brand primary is `#6ca925`. Text and links on light backgrounds use `#3d6810` because the brand green on white is about 2.9:1. Status text uses darker ink; the bright success, danger, warning, and info values stay fills. `#b9b9c3` is not used for readable text. SAHANA does not copy iBilz logos, illustrations, CSS, or code. UI type stays Noto Sans, Noto Sans Sinhala, and Noto Sans Tamil because the iBilz Montserrat face does not cover Sinhala and Tamil. The admin sidebar is web-only; mobile keeps the member shell and the same tokens. | 2026-10-31 | Project owner | web, mobile, design-tokens |

Milestone 0 password hashing uses Argon2id, which is the hashing half of TD-07. That does not accept an MFA factor. The factor stays inside OD 07.

## Proposed technical decisions

Not accepted. Do not implement these until the row is accepted or waived.

| ID | Proposal | Why it is not yet accepted | Owner | Modules | Blocks |
|---|---|---|---|---|---|
| TD-06 | Accepted by owner delegation, 31 Oct 2026. Money is `numeric(19,4)`. Currency stays on the society. No floating point. | Treasurer, delegated | ledger | — |
| TD-07 | Argon2id for password hashes. Privileged MFA required before production; mechanism selected with OD 07. | Factor type (app, SMS, hardware) is not chosen. Hashing is already in use for Milestone 0; MFA enforcement is not accepted by that usage. | Security lead | identity | Production login policy |

## Open business decisions

Copied from SRS section 8. A row that begins with "Accepted by owner delegation, 31 Oct 2026" is no longer open. The remaining rows stay open until that sentence is written on them. No formula is used unless that sentence records it.

| ID | Decision required | Owner | Affects | Blocks |
|---|---|---|---|---|
| OD 01 | Accepted by owner delegation, 31 Oct 2026. One member row belongs to one society. There is no shared member identity across societies. Required fields are member number, given name, family name, status, and category. Optional fields are employee number and department. A new member starts as `applied` unless the society has added another opening code. Default statuses are applied, active, suspended, transferred, retired, resigned, terminated, and reinstated, with the transitions in `apps/api/src/domain/members.ts`. Default category is `employee`. Default relationships are spouse, child, parent, parent_in_law, sibling, and other. Societies may add lookup codes. Family profiles are not logins. An import that contains a rejected row writes nothing. | Society sponsor, delegated | governance, members, identity | — |
| OD 02 | Accepted by owner delegation, 31 Oct 2026. A published rule uses waitingDays 0, no amount cap, covered relationships spouse/child/parent/parent_in_law, member status active, frequency once, no required documents, and contribution not required, unless the society stores different values. An unpublished or empty rule stays not_calculated and is not treated as eligible. A claim keeps the eligibility stored against its scheme version. A later rule version does not rewrite it. | Operations and welfare, delegated | welfare, claims | — |
| OD 03 | Accepted by owner delegation, 31 Oct 2026. Interest is simple, Actual/365, rounded half-up to 4 decimal places, with no compounding. The default annual rate and flat fee are zero until the society publishes a different rule. The starter chart is cash 1000, bank 1100, contribution receivable 1200, loans receivable 1300, welfare payable 2000, member fund 3000, contribution income 4000, interest income 4100, welfare expense 5000, and project expense 5100. Opening balances are a balanced journal. A posted line is never edited. Paying a claim posts one expense and one cash credit and cannot be repeated. | Treasurer, delegated | loans, ledger | — |
| OD 04 | Accepted by owner delegation, 31 Oct 2026. A new approval route is in force, has one to three stages, and rejects self-approval unless allowSelfApproval is stored as true. Emergency acknowledgement target is 4 hours and escalation is 8 hours, both overridable later as society configuration. Fast-track still requires a reason and an audit row. | Society sponsor, delegated | approvals, emergency | — |
| OD 05 | Accepted by owner delegation, 31 Oct 2026. The only measures are participation count, volunteer hours, beneficiary count, and project spend. A source counts only after a verification row exists. The same member, family member, or journal document counts once in a result. Unverified sources are counted separately and are not added to the verified total. A new result row keeps the previous one. There is no carbon factor and no certification claim. | Project or ESG officer, delegated | esg, projects | — |
| OD 06 | Accepted by owner delegation, 31 Oct 2026. Missing runtime translations fall back to English, then to the key id. Sinhala and Tamil catalogs stay marked unreviewed. In-app notifications are delivered. Email and SMS templates can be stored and are not sent to a provider. WhatsApp sending stays off. Consent acceptances are kept. Emergency location, when permitted, is not required and is not a substitute for official emergency services. | Operations and product lead, delegated | i18n, notifications, reporting | — |
| OD 07 | Hosting, supported devices and operating systems, integrations, concurrency and performance targets, backup and recovery objectives. | Delivery lead | platform, security | Production deploy, load-test pass criteria, MFA factor |
| OD 08 | Migration sources and quality, MVP delivery sequence, stakeholder acceptance owners, and any Phase 2 scope changes. | Product lead | reporting, program plan | Treating the milestone order as final; legacy import mappings |

## Conflicts to watch

- SRS 003 leaves family logins open. CD-07 closes them for MVP only. A request to add family accounts in the first release is a scope change, not a bug fix.
- The October 2026 proposal deck lists PDPA compliance as a mark on the architecture slide. SRS 031 requires agreed controls and forbids claiming legal compliance without formal verification. PDPA is a design constraint, not a certification this repository can assert.
- The proposal deck's committee titles (Chief organizer, President, Secretary, Treasurer, Vice President, Assistant Secretary, Advisory Committee, Working Committee) are the CBL example. SRS 008 requires configurable committee roles. Do not hardcode that list as the only structure.

## Direction recorded on 31 October 2026

The project owner directed the remaining MVP modules to be built and deferred creating the git remote. OD 01–OD 08 stay open. That direction allows storage, lists, and workflow state. It does not accept a welfare, contribution, loan, approval-threshold, or ESG formula. Code must not treat an empty rule body as eligible, as zero interest, or as a verified ESG result. Committee voting, a kiosk, WhatsApp sending, offline sync, and a payroll engine stay out.

## How to accept a decision

1. Write the outcome in the relevant table: status, date, owner, and the modules that may now rely on it.
2. Move the row from Open or Proposed to Confirmed, or add an Accepted date column value in the narrative under the table.
3. Update the traceability matrix status for every row that was blocked only by that decision.
4. Only then implement the calculation or the technology choice.
