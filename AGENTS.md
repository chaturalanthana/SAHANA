# AGENTS.md

Instructions for every AI coding agent working in this repository.

SAHANA is an employee welfare society platform. It stores personal, family, medical, and financial records and posts money. A fast guess that invents a formula or skips society scope is a defect, not a shortcut.

## Read before you change anything

Read these, in this order, before writing or editing code, schema, or user-facing copy:

1. `docs/ai/AI_CONSTITUTION.md`
2. `docs/ai/NON_NEGOTIABLE_RULES.md`
3. `docs/decisions/DECISIONS.md` — confirmed, proposed, and open decisions
4. `docs/requirements/TRACEABILITY_MATRIX.md` — the rows for the slice you are touching
5. `docs/ai/DEVELOPMENT_GUIDE.md` for API, data, and test changes
6. `docs/ai/UI_UX_GUIDE.md` for any screen or component
7. `docs/ai/IMPLEMENTATION_PLAN.md` and, for foundation work, `docs/architecture/MILESTONE_0_PLAN.md`

If you have not read them in this session, read them before the first edit.

## Authority

When two sources disagree, follow the authority order in the constitution. The approved SRS and an accepted decision outrank this file, the guides, and the current code. An example in a document is not a formula.

## Stop conditions

Stop the affected slice and record the blocker in `docs/decisions/DECISIONS.md` when any of these are true:

- The behavior needs a welfare, contribution, loan, approval-threshold, or ESG formula that is still open (OD 02, OD 03, OD 04, OD 05).
- A change would let one society read or write another society's data.
- A change would update or delete a posted financial row in place.
- A change would add a framework, an offline sync store, a workflow designer, WhatsApp sending, committee voting, a kiosk, or a payroll engine.
- The task asks you to claim a test, a capacity number, or a legal certification you did not execute or receive.

You may still write the plan, the failing test that documents the gap, or schema that only stores a future rule. Say that this is all you did.

## While you work

- Stay inside the current milestone slice. Do not scaffold later modules "while you are here".
- Put user-facing strings in `packages/i18n` for English, Sinhala, and Tamil once that package exists. Until it exists, do not invent a parallel string table.
- Scope every tenant query by society. Check permissions on the server.
- Keep web layouts usable from 320px upward.
- Do not put secrets in code, fixtures, logs, or docs.

## How to report

For each development task, report:

- **Requirement understanding** — the SRS clause and module row.
- **Implementation plan** — files and components.
- **Open decisions** — anything still blocking a correct result.
- **Implementation** — what you actually changed.
- **Verification** — commands you ran and the results. If you did not run a check, say so.
- **Completion summary** — done, incomplete, or blocked. Match the Definition of Done. Do not call generated code complete.
- **Next recommended task** — the next step that respects milestone order.

## What this file does not do

It does not approve Milestone 0 implementation. Building the monorepo, API, or database waits on explicit approval of `docs/architecture/MILESTONE_0_PLAN.md` and on acceptance or waiver of TD-01 through TD-05.
