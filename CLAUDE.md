# Mission First — demo build

Demo of an EPC tender-intelligence app: ingest a government tender bundle, extract stage-wise checklists and agency obligations, keep a CPM/PERT schedule, surface AI insights, and quantify delay against liquidated-damages exposure.

**Framing (phase 2):** this is a platform the **government agency provides to its vendors**, not a tool a vendor buys. One project has two sides on the same data — the vendor executing the contract and the agency that issued the tender and owes deliverables. Both are users of the same instance.

Specs: `BRIEF.md` (phase 1) and `mission-first-phase2-brief.md` (phase 2). This file records the working conventions.

## Non-negotiable principles (BRIEF §1)

1. **The LLM never does math.** CPM/PERT is deterministic, unit-tested TypeScript in `src/lib/schedule/` (pure functions, no DB access). The LLM only extracts, classifies, narrates, recommends.
2. **Every AI-derived item carries a citation** (`sourceDocumentId`, `sourcePage`, `sourceClause` where present). Manual items are `sourceType: MANUAL`.
3. **AI output is a proposal until accepted.** Extraction produces a `Changeset` reviewed in the Documents chat; nothing AI-extracted mutates project data silently.
4. **All model calls go through `src/lib/ai/client.ts`.** Feature code never imports `@anthropic-ai/sdk` directly. Interface is provider-neutral: `complete`, `completeJson`, `completeWithDocument`. Every call is logged to `AiCallLog`.

## Auth, orgs, and roles (phase 2 Part A)

`Organization` (AGENCY | VENDOR) owns `User`s; `Project` carries `vendorOrgId` and `agencyOrgId`. Auth.js v5, credentials provider, JWT session, bcrypt hashes.

- **Split config so middleware stays edge-safe:** `src/auth.config.ts` has no Prisma/bcrypt and is what `middleware.ts` runs; `src/auth.ts` adds the credentials provider. **Replacing credentials with government SSO/OIDC means editing `src/auth.ts` only** — as long as the provider populates `role`, `orgId`, `orgName`, `orgType` on the user, the session shape and every permission check stay as they are.
- **`getAuthorizedProject(projectId, permission?)` in `src/lib/auth/authorize.ts` is THE security boundary.** Every server action and route handler calls it (or an `authorizeBy*` variant) before touching project data. It resolves the session, confirms the user's org is the project's vendor or agency org, rejects a role/side mismatch, and optionally checks a permission. **A `projectId` from a request is never trusted without it.** Feature code never re-implements this check. Route handlers translate `AuthorizationError` into 403.
- `POST /api/jobs/run` drains only jobs belonging to the caller's visible projects.
- Middleware guards all routes and routes agency users to `/portfolio`, vendor users to their project. That is convenience routing, not the boundary.
- **UI reflects permissions by disabling, never by hiding alone** — server actions reject writes from agency roles regardless of UI state.

### Permission matrix

Single source of truth: `MATRIX` in `src/lib/auth/roles.ts`, queried by `can(role, permission)`.

| Action | VENDOR_ADMIN | VENDOR_MEMBER | AGENCY_ADMIN | AGENCY_REVIEWER |
|---|---|---|---|---|
| Edit checklist items, activities, links | yes | yes | no | no |
| Upload docs, run extraction, accept changesets | yes | yes | no | no |
| Mark obligations vendor-side (chase, receive, escalate) | yes | yes | no | no |
| Respond to obligations agency-side (note, mark fulfilled) | no | no | yes | yes |
| Approve items flagged `requiresAgencyApproval` | no | no | yes | no |
| View dashboard, schedule, insights, time-cost panel | yes | yes | yes | yes |
| Draft escalation letters | yes | yes | view only | view only |
| Manage org users | yes | no | yes | no |
| Create project | yes | no | no | no |
| Portfolio (`/portfolio`) | no | no | yes | yes |
| Edit project settings / reset data | yes | no | no | no |

Demo sign-ins (all use `DEMO_PASSWORD`, default `missionfirst`, printed on seed):
`admin@apexpower.example` (VENDOR_ADMIN), `member@apexpower.example` (VENDOR_MEMBER), `admin@secl.example` (AGENCY_ADMIN), `reviewer@secl.example` (AGENCY_REVIEWER), `admin@bharatelec.example` (second vendor org).

## Time-cost analysis & delay attribution (phase 2 Part B)

`src/lib/analysis/delayCost.ts` is pure and unit-tested — same rule as the schedule engine, **the LLM never computes these figures, it only narrates them** (`generateDelayCostInsight`, one `Insight` row with category `TIME_COST`).

- `delayDays = max(0, forecastFinish − contractFinish)`; `ldExposure = min(ldCapPct, (delayDays/7) × ldWeeklyRatePct) / 100 × contractValue`. LD terms live on `Project` (`ldWeeklyRatePct` 0.5, `ldCapPct` 10 from GTC; SCC can override, so they're editable).
- **Delay attribution is a documented approximation, and the reasoning matters.** Proper attribution needs a day-by-day history of which activity was critical and which obligations were outstanding each day; we don't have that yet. Instead: for each AGENCY obligation that is *currently* overdue **and** linked via `Obligation.blockingActivityId` to an activity that is critical in the *current* engine run, take `min(overdueDays, delayDays)`; sum, then cap at `delayDays`. Consequences: it reads the present, not the past (an obligation fulfilled yesterday contributes nothing); two obligations blocking the same activity both count, so the cap is what keeps the total honest. **It is an allocation for management attention, not a legal apportionment of liability** — which is why the UI shows it in amber/steel-blue, never the overdue red, and the prompt forbids blame language. Replace with a day-wise walk once snapshot history is deep enough, and delete the note in the module.
- `ScheduleSnapshot` is written by `recordScheduleSnapshot` (`src/lib/analysis/snapshot.ts`) from every action that moves the forecast or attribution — activity and link mutations, obligation status/response, changeset apply, contract settings. Consecutive identical points are skipped; snapshot failures never block the user's edit. Seed backfills 14 fortnightly points per project.
- `/portfolio` is the agency home: one row per vendor project with the same figures, sorted by delay descending. Read-only triage.

## Stack & architecture

- Next.js 15 App Router + TypeScript, `src/` dir, `@/*` alias. Server Actions for mutations, Route Handlers for jobs/uploads.
- Tailwind v4 + shadcn/ui (new `shadcn` package, radix base). Theme fully overridden to `src/styles/tokens.css`; **never ship default shadcn look** (see BRIEF §6).
- Prisma + SQLite (`file:./dev.db`), schema kept Postgres-compatible — no SQLite-only types; enums are modeled as `String` fields with TS union types in `src/lib/enums.ts` since SQLite has no native enums.
- PDFs: text-layer via `unpdf` per page; scanned (< ~50 chars/page avg) → split into ≤20-page chunks with `pdf-lib`, sent to Claude as document blocks (transcription + extraction in one call). No local OCR.
- Background work: `Job` table + `POST /api/jobs/run` processes next pending job; Documents page polls every 3 s. No queue infra.
- Charts: hand-rolled SVG, `d3` for scales/layout only. No chart/Gantt libraries.
- Uploads: `./storage/<projectId>/<documentId>.pdf` (gitignored).
- Tests: vitest, colocated as `src/**/*.test.ts`, engine tested before dashboard use.

## Design language (BRIEF §6 — Primavera P6, "serious business only")

12px base font, 26–28px rows, 28px panel headers, 8px grid. Inter UI / JetBrains Mono for IDs, dates, clauses, numerics. Headings 11px uppercase letterspaced. Surfaces `#ffffff`/`#f4f5f7`, borders `#d0d4da`, sidebar `#1e2a3a`, accent steel blue `#2f5f8f`; status colours are the only saturated colours. No gradients, no shadows, radius ≤ 2px, no emoji, no illustrations. All values live in `src/styles/tokens.css` as `--mf-*` variables, exposed to Tailwind as `mf-*` colors; use `.mf-panel`, `.mf-panel-header`, `.mf-heading`, `.mf-mono` helpers.

## Extraction pipeline (milestone 8)

Document processing fans out over the Job table (FIFO): `PROCESS_DOCUMENT`
(text extraction via unpdf, light-model classification, chat ack, changeset
shell) → one `EXTRACT_UNIT` per ≤40-page text section or ≤18-page scanned chunk
(scanned chunks return transcription + items in one heavy call; transcriptions
are stored to DocumentPage) → `FINALIZE_EXTRACTION` (title dedupe, optional
`proposeActivities` WBS call when a scope-ish doc yields <3 activities, summary
+ review-card chat message). `applyChangeset` in
`src/lib/actions/changesets.ts` is the only path from proposal to real records.

**Status:** end-to-end API test on the two sample files is still pending — the
Anthropic account had no credits during the build. Run both samples through
the Documents page (upload or Reprocess) once credits exist; `scripts/verify-ai.ts`
is the trivial connectivity check.

## Conventions

- Dates render P6-style (`26-Aug-26`) via `formatDate` in `src/lib/format.ts`.
- Milestone-per-commit workflow (BRIEF §9, phase 2 build order); after each `npx tsc --noEmit`, `npx vitest run`, and `npm run build` must pass.
- **Stop the dev server before `npm run build`** — both write `.next/`, and running them together corrupts the dev server's cache (symptom: every route 500s with `_buildManifest.js.tmp` ENOENT). Fix: stop dev, `rm -rf .next`, restart.
- AI prompts live in `src/lib/ai/prompts/` — each exports a prompt-builder plus its zod output schema; structured calls validate JSON, retry once with the validation error appended, then fail the job readably.
- Model IDs come from env (`AI_MODEL_HEAVY`, `AI_MODEL_LIGHT`).

## Out of scope / extension points

Phase 1 (BRIEF §10): second AI provider (client interface is ready for it), local OCR, vector search (keyword `LIKE` search only), email/SMS escalation (letters are draft-only), XER/MPP import, resource/cost loading.

Phase 2 explicitly not done yet: SSO/OIDC (structured for it — see the auth section), password reset, email invitations for agency users (seeded directly), audit log of who changed what, vendors with more than the seeded projects, configurable permission matrix (hardcoded per role in `roles.ts`).
