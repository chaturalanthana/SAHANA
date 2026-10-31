# SAHANA UI/UX Guide

Status: active from the governance foundation (31 October 2026).
Visual references: the public iBilz admin app at `https://app.ibilz.com/auth/login` (Vuexy-style Bootstrap theme), accepted as TD-08 on 31 October 2026. Copy the layout pattern and the palette. Do not copy iBilz logos, illustrations, stylesheets, or code.

The product must feel simple while the operation underneath is not. If a screen needs a paragraph of explanation before a member can finish the task, the screen is wrong.

## Design principles

1. One primary action per view. Secondary actions stay visible but quieter.
2. Ask for the minimum the rule requires. Optional fields are visibly optional.
3. Show status in words and a color, never by color alone.
4. Put the consequence next to a sensitive action (pay, approve, suspend, export) before the user confirms.
5. The same task has the same labels in web and mobile, from the shared i18n keys.
6. Members see member tasks. Administrators see the tasks their permissions allow (SRS 006). Do not show a disabled ERP menu to a member on the phone.

## Responsive rules

Responsive web is P0 (SRS 006, NN-09).

- Support from 320px wide upward. No horizontal page scroll for a core task.
- Breakpoints, used consistently: 320, 768, and 1024. Layout may add columns above 1024. It may not require them.
- Tables become stacked records or a prioritized column set below 768, with the remaining fields one tap away. Do not shrink a 12-column grid until the text is unreadable.
- Touch targets are at least 44 by 44 CSS pixels on touch devices.
- Sticky footers and dialogs must leave the primary action visible when the on-screen keyboard is open.

A screen is not complete until the task has been completed at phone width, tablet width, and desktop width.

## Web navigation

- Society administrators use a light vertical sidebar, about 260px wide, that collapses to icons on desktop. Below 768px the same destinations open from a menu button as an overlay. Do not leave the sidebar on screen at 320px.
- Group destinations by the job: Members, Welfare, Emergency, Loans, Finance, Projects, ESG, Communications, Settings. Hide a group the caller cannot access. The active item uses a light green tint and the darkened primary ink.
- The top bar is a white rounded bar with a soft shadow. It shows the society name, a language menu, and a user menu. It does not show database or environment secrets (SRS 030). A non-production environment may show a plain text banner such as the configured environment name.
- Page background is light gray. Content sits in white rounded cards with a soft shadow. Dashboards lead with KPI cards. Lists are tables from 768px up and stacked records below that.
- Deep pages keep a short breadcrumb. Do not add a second navigation inside a module unless the module has more than one primary list.

## Mobile navigation

- Member app only. Bottom navigation for the four or five daily destinations: Home, Requests, Activity, Alerts, Profile. Labels come from i18n.
- Emergency assistance is a persistent, high-contrast action on Home and is reachable in one tap from any primary tab (SRS 015). It is not buried in a settings screen.
- Administrative approval, ledger posting, and configuration are web tasks. Do not reproduce them in the mobile app in MVP.

## Typography

- Use one family for UI text and a second only if Sinhala or Tamil glyphs are missing. The chosen families must cover Sinhala and Tamil with consistent weight. Record the family names in `packages/design-tokens` when the UI slice starts.
- Body size is at least 16px on mobile and 14px on dense web tables. It scales with the user's browser or OS text size.
- Line length for reading text stays near 70 characters. Sinhala and Tamil need extra line-height (at least 1.6) because vowel signs and descenders collide at tight leading.
- Do not set a font size below 12px for any language.
- Numerals in money and dates use locale-aware formatting. The stored value does not change with language (SRS 005).

## Color and spacing

Tokens live in `packages/design-tokens`. Feature components do not hardcode hex. The web theme variables repeat those values so Tailwind can see them.

iBilz swatches, confirmed from `https://app.ibilz.com/theme/app-assets/css/colors.css` and `bootstrap-extended.css` on 31 October 2026:

| Role | Value | Use |
|---|---|---|
| Primary | `#6ca925` | Buttons, active tint, brand fill |
| Secondary | `#82868b` | Quiet chrome |
| Success | `#28c76f` | Success fill |
| Danger | `#ea5455` | Danger fill |
| Warning | `#ff9f43` | Warning fill |
| Info | `#00cfe8` | Info fill |
| Heading | `#4b4b4b`, `#22292f` | Titles and button labels on green |
| Body | `#6e6b7b` | Reading text |
| Muted | `#b9b9c3` | Placeholders and decorative marks only |
| Page | `#f6f6f6` | Page background |
| Border | `#ebe9f1` | Card and field borders |
| Surface | `#ffffff` | Sidebar, navbar, cards |

`#6ca925` on white is about 2.9:1, so links and small text use `#3d6810` (`primaryInk`). White text on the brand green also fails, so primary buttons use `#22292f` labels. Success, danger, warning, and info text use the `*Ink` tokens. A status still has a word, not color alone.

- Primary is the main action. Danger is reserved for irreversible or harmful actions, and those buttons use the darker danger ink with white text.
- Spacing scale: 4, 8, 12, 16, 24, 32. Cards use a 8px radius and the shadow `0 4px 24px 0 rgba(34, 41, 47, 0.1)`. Compact forms use 12 between fields, 24 between groups.
- Contrast for text and for status indicators meets WCAG 2.2 AA (at least 4.5:1 for body text, 3:1 for large text and non-text UI).

## Reusable components

Build these in `packages/ui-web` and, separately, in `packages/ui-mobile`. Do not import web components into mobile.

- Button (primary, secondary, quiet, danger) with a loading state that disables a second submit.
- Text field, select, date field, and file field with a visible label, hint, and error. Placeholder text is not the label.
- Status pill with label plus tone.
- Dialog for confirmation of sensitive actions, including the object name and the effect.
- Toast for short success feedback. Errors that block the task stay on the form.
- Pagination control bound to server page size.

## Forms and validation

- Labels sit above fields. Required fields are marked in text, not by color only.
- Validate on submit, then on change after the first error, using the shared Zod schema. Map `messageKey` through i18n.
- Group a long form into steps only when the domain is already stepped (claim, emergency). Do not split a settings form into a wizard to hide complexity.
- Preserve entered values when validation fails. Do not clear a welfare application on a network error.
- Submitting twice is blocked in the UI and rejected by the idempotency key on the API.

## Data tables

- Server-side pagination, sort, and filters. The filter set is small and named after the domain (status, date range, scheme), not a generic query builder.
- The first column is the human identifier (member name and member number, claim number). Actions sit on the row and remain reachable at 320px.
- Empty, loading, and error states replace the table body. They do not flash a false "no records" during load.
- Exports are a separate action with permission `reports.export` (or the module export permission) and an audit event. They are not "download everything on this page" without a scope.

## Dashboards

- A dashboard is a set of counts the caller is allowed to see, each with a link to the filtered list. It is not a place to compute an unapproved KPI.
- Operational dashboards (SRS 027) load within a bounded query. If a figure needs a heavy aggregate, show a skeleton and compute it as a job, with the as-of time visible.
- Do not place society-wide financial totals on a member home screen.

## Member 360 profile

SRS 009. One profile, lazy sections, server pagination inside each section.

Sections, in order, each gated by permission:

1. Identity and contact.
2. Membership status and history.
3. Family links.
4. Contributions.
5. Welfare.
6. Loans.
7. Projects and activities.
8. Documents.
9. Notifications relevant to the member.
10. Activity timeline.

- Sensitive sections (medical evidence, financial detail) are not requested until the section is opened, and the API still checks permission.
- The header shows name, member number, status, and category. It stays readable at 320px by stacking.
- A change history is available to roles that may see it. Members see their own permitted history, not internal notes.

## Finance interfaces

- Journals show balanced lines before post. The post action is disabled while debits and credits differ, and the API rejects an unbalanced post anyway.
- Posted documents are read-only. The correction action starts a reversal, it does not unlock the original fields (NN-06).
- Money columns align end, use the society currency code, and do not switch precision when the UI language changes.
- Period status (open or closed) is visible on every posting screen. A closed period explains why posting is refused.
- Bank reconciliation shows statement lines and ledger lines side by side from 768px up, and as two stacked lists below that.

## ESG dashboards

- Every figure is labeled verified or unverified, with the period and the KPI definition name (SRS 025).
- A verified number links to the source records and the calculation id (SRS 026). If the definition is not approved, the card says the measure is not configured. It does not show a zero that looks like a result.
- Do not add a carbon or certification badge unless OD 05 approves that claim.

## Emergency assistance screens

SRS 015, SRS 016, NN-14.

- Mobile: one screen with beneficiary (self or an eligible linked family member), emergency type, contact number, optional short description, and optional location that starts off until the member allows it. Submit is the primary button. No document step before submit.
- A fixed sentence, translated, states that SAHANA does not replace ambulance, police, or other emergency services.
- After submit, the member sees status (submitted, acknowledged, in progress, closed) and the latest coordinator update.
- Web coordinator inbox: list sorted by priority and time, with acknowledge, assign, escalate, and close. Fast-track approval is labeled as such and still asks for a reason.

## Accessibility

Target: WCAG 2.2 AA.

- Every input has a programmatic label. Errors are tied to the field with `aria-describedby` on web and equivalent accessibility props on mobile.
- Focus order follows the visual order. Focus is visible. Dialogs trap focus and restore it on close.
- Status is not color-only. Charts have a text or table alternative.
- Language of the page is set to `en`, `si`, or `ta` so assistive technology uses the right voice when one exists.
- Respect reduced motion. Skeletons may pulse once, not continuously, when reduced motion is requested.

## English, Sinhala, and Tamil

- All three languages ship for every new screen. Layouts are tested with real Sinhala and Tamil strings, not with English copied into the other files.
- Allow strings to grow by about half. Do not fix button width to an English word.
- Society default language and the user preference both exist (SRS 004). The user preference wins after login. A missing key falls back to the agreed fallback language and is counted by the completeness check.
- Configurable content (scheme name, announcement, consent text) is stored per language. Do not auto-translate it.
- PDF and spreadsheet exports use a font that can render the selected language (SRS 027). If the font is not embedded yet, the export is incomplete for that language.

## Loading, empty, and error states

- Loading: skeleton that matches the layout, not a blank page and not a spinner that hides the whole app for a local refresh.
- Empty: say what is missing and the one action that creates it, if the caller has permission. Example key: `claims.list.empty`.
- Error: say what failed and what to do next (retry, check connection). Keep the member's draft.
- Offline or failed submit on mobile: a clear message, no silent queue (SRS 007). The member can retry. The API idempotency key prevents a duplicate emergency or claim.
- Destructive confirmation: name the record and the effect. Require an explicit confirm control, not a timeout.

## What not to ship

- A dashboard of placeholder zeros that imply live ESG or financial performance.
- English-only validation messages.
- A member flow that asks for a budget, a project plan, or a chart-of-accounts code.
- Carousels, decorative motion, or dense icon-only toolbars without names.
