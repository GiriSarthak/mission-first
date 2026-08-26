# Mission First — demo build

Demo of an EPC tender-intelligence app: ingest a government tender bundle, extract stage-wise checklists and agency obligations, keep a CPM/PERT schedule, surface AI insights. Single user, single workspace, no auth. The full spec is `BRIEF.md`; this file records the working conventions.

## Non-negotiable principles (BRIEF §1)

1. **The LLM never does math.** CPM/PERT is deterministic, unit-tested TypeScript in `src/lib/schedule/` (pure functions, no DB access). The LLM only extracts, classifies, narrates, recommends.
2. **Every AI-derived item carries a citation** (`sourceDocumentId`, `sourcePage`, `sourceClause` where present). Manual items are `sourceType: MANUAL`.
3. **AI output is a proposal until accepted.** Extraction produces a `Changeset` reviewed in the Documents chat; nothing AI-extracted mutates project data silently.
4. **All model calls go through `src/lib/ai/client.ts`.** Feature code never imports `@anthropic-ai/sdk` directly. Interface is provider-neutral: `complete`, `completeJson`, `completeWithDocument`. Every call is logged to `AiCallLog`.

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
- Milestone-per-commit workflow (BRIEF §9); after each milestone `npx tsc --noEmit`, `npx vitest run`, and `npm run build` must pass.
- AI prompts live in `src/lib/ai/prompts/` — each exports a prompt-builder plus its zod output schema; structured calls validate JSON, retry once with the validation error appended, then fail the job readably.
- Model IDs come from env (`AI_MODEL_HEAVY`, `AI_MODEL_LIGHT`).

## Out of scope / extension points (BRIEF §10)

Auth & multi-tenancy, second AI provider (client interface is ready for it), local OCR, vector search (keyword `LIKE` search only), email/SMS escalation (letters are draft-only), XER/MPP import, resource/cost loading.
