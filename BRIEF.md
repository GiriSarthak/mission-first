# Mission First — Demo Build Brief for Claude Code (API-only, barebones)

You are building a **demo** of Mission First: a web app that reads a government EPC tender bundle, extracts stage-wise checklists and the obligations owed by the government agency, keeps a project schedule with a live critical path, and surfaces AI-suggested actions. This is a demo, not the product: single user, single workspace, no auth, SQLite, Anthropic API only. Optimise for a working, convincing end-to-end flow over completeness.

Read this entire brief before writing any code. Then create `CLAUDE.md` at the repo root summarising the architecture, conventions, and the principles below so later sessions stay aligned.

Two real sample documents will be placed in `./samples/` by the user before the demo:
- `Tendernotice_2.pdf` — 111 pages, has a text layer. SECL (Coal India) NIT No. SECL/BSP/CMC/e-Tender/240 (2018): NIT and bid instructions p.1–24, General Terms & Conditions p.25–50, Additional Terms & Conditions p.51–81, Technical Specifications p.82+, Annexures I–X.
- `NIT.pdf` — 170 pages, **fully scanned, no text layer**. Volume 2: equipment specifications, technical parameter tables, drawing list.

The demo must ingest both successfully.

---

## 1. Principles (non-negotiable even in a demo)

1. **The LLM never does math.** CPM / PERT calculations are deterministic, unit-tested TypeScript. The LLM extracts, classifies, narrates, recommends.
2. **Every AI-derived item carries a citation**: source document, page number, clause reference where one exists. Manual items are marked `sourceType: MANUAL`.
3. **AI output is a proposal until accepted.** Document processing produces a changeset the user reviews on the Documents page. Nothing the AI extracts silently mutates project data.
4. **All model calls go through one module** (`src/lib/ai/client.ts`). Feature code never imports the Anthropic SDK directly. For the demo this module wraps only the Anthropic SDK, but keep its interface provider-neutral (`complete(messages, options)`, `completeJson(schema, ...)`, `completeWithDocument(pdfBase64, ...)`) so a second provider can be added later without touching features.

---

## 2. Stack

- **Next.js 15 (App Router) + TypeScript.** Server Actions and Route Handlers for the API layer.
- **Tailwind CSS + shadcn/ui**, restyled to the design language in §6. Do not ship default shadcn aesthetics.
- **Prisma + SQLite** (`file:./dev.db`). Keep the schema Postgres-compatible (no SQLite-only types).
- **AI:** `@anthropic-ai/sdk`. Model IDs from env. Default `AI_MODEL_HEAVY` for extraction and insights, `AI_MODEL_LIGHT` for classification and chat. Before hardcoding defaults, check the current model list and PDF-input limits in the Anthropic docs rather than relying on memory.
- **PDF handling:**
  - Text-layer PDFs: extract per page with `unpdf` (server-side), store in `DocumentPage`.
  - Scanned PDFs (detected when extracted text is < ~50 characters/page on average): do **not** run a local OCR stack. Split the PDF into chunks of ≤ 20 pages with `pdf-lib`, base64-encode each chunk, and send it to Claude as a document block. Ask for two things in one call: a per-page transcription (stored into `DocumentPage.text` so citations and chat Q&A work) and the structured extraction below. Verify the current per-request page/size limits in the docs and keep chunks comfortably under them.
- **Background processing:** a `Job` table plus a Route Handler `POST /api/jobs/run` that processes the next pending job; the Documents page polls job status every 3 s while any document is PROCESSING. No queue infrastructure.
- **Charts:** custom SVG with `d3` used for scales and layout only. No Gantt libraries.
- **Testing:** `vitest` for the schedule engine. The engine must be tested before the dashboard consumes it.
- **File storage:** uploads saved to `./storage/<projectId>/<documentId>.pdf` (gitignored).

`.env.example`:
```
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY=
AI_MODEL_HEAVY=
AI_MODEL_LIGHT=
```

---

## 3. Data model (Prisma)

```
Project        id, name, tenderRef, agencyName, contractValue?, 
               contractStart?, contractDurationDays?, createdAt

Document       id, projectId, filename, storagePath, 
               docType (TENDER_NIT | GCC | SCC | SOW | BOQ | TECH_SPEC | DRAWING | CORRESPONDENCE | OTHER),
               isScanned (bool), pageCount,
               processingStatus (PENDING | PROCESSING | DONE | FAILED), processingError?,
               userDescription?, uploadedAt
DocumentPage   id, documentId, pageNumber, text

ChecklistPhase id, projectId, key (PRE_BID | BID_SUBMISSION | POST_AWARD | SOW | EXECUTION | CLOSEOUT),
               title, sortOrder
ChecklistItem  id, phaseId, title, description?, 
               status (NOT_STARTED | IN_PROGRESS | DONE | BLOCKED | NA),
               dueDate?, ownerRole?,
               sourceType (AI | MANUAL), sourceDocumentId?, sourcePage?, sourceClause?,
               createdAt, updatedAt

Obligation     id, projectId, title, description?, owedBy (AGENCY | VENDOR),
               contractClause?, sourceDocumentId?, sourcePage?,
               stipulatedDays?, requestedOn?, dueOn?, receivedOn?,
               status (PENDING | REQUESTED | OVERDUE | RECEIVED | WAIVED),
               escalationLevel (int, 0–3)

Activity       id, projectId, code, name, wbsPath?,
               optimistic?, mostLikely, pessimistic?,          # days
               actualStart?, actualFinish?, percentComplete (0–100), remainingDays?,
               sourceType, sourceDocumentId?, sourcePage?
ActivityLink   id, predecessorId, successorId, type (FS | SS | FF | SF), lagDays

Insight        id, projectId, title, body, severity (INFO | WARNING | CRITICAL),
               category (SCHEDULE | COMPLIANCE | OBLIGATION | DOCUMENT),
               relatedEntityType?, relatedEntityId?, sourceDocumentId?, sourcePage?,
               status (OPEN | DISMISSED | DONE), createdAt

Changeset      id, projectId, documentId?, status (PROPOSED | ACCEPTED | REJECTED | PARTIAL),
               summary, createdAt
ChangesetItem  id, changesetId, entityType (CHECKLIST_ITEM | OBLIGATION | ACTIVITY | INSIGHT),
               payload (JSON string), accepted (bool?)

ChatMessage    id, projectId, role (USER | ASSISTANT), content, documentId?, changesetId?, createdAt
Job            id, projectId, type, status (PENDING | RUNNING | DONE | FAILED), payload (JSON), error?, createdAt
AiCallLog      id, projectId?, jobId?, purpose, model, inputTokens, outputTokens, latencyMs, createdAt
```

---

## 4. Schedule engine (`src/lib/schedule/`)

Pure functions, no DB access, unit-tested. Build this before the dashboard.

- `expectedDuration(o, m, p)` — PERT `(o + 4m + p) / 6`, falling back to `m` when o/p are absent; also returns variance `((p − o) / 6)²`.
- `computeSchedule(activities, links, projectStart, dataDate)` — forward and backward pass supporting FS/SS/FF/SF with lags. Returns per activity ES, EF, LS, LF, total float, free float, `isCritical`. Detects cycles and returns a structured error.
- Progress-aware: `actualStart` fixes ES; `actualFinish` fixes EF and marks complete; otherwise remaining = `remainingDays ?? duration × (1 − percentComplete/100)`, and in-progress work cannot finish before `dataDate`.
- `finishProbability(criticalPathVariances, projectFinish, contractFinish)` — normal approximation, returns 0–1.
- `layoutNetwork(activities, links)` — longest-path layering and row assignment for the PERT diagram so the renderer only draws.

Tests: simple chain, parallel branches, all four link types with lags, cycle detection, in-progress recompute that moves the critical path.

---

## 5. Application structure

### Shell
- **Left sidebar, ~240px, dark navy, persistent.** Wordmark "MISSION FIRST" in small caps. Below: project selector dropdown (name + tender ref, plus "New project"). Navigation: `Dashboard`, `Documents`, `Settings`.
- **Top toolbar strip** (36px, light grey, 1px bottom border): breadcrumb `Project › Page`, data date, page actions on the right.
- Routes: `/projects/[id]/dashboard`, `/projects/[id]/documents`, `/projects/[id]/settings`. `/` redirects to the first project.

### Dashboard
Light grey background (#f4f5f7), dense grid, 12px gaps. Panels are flat, 1px border, 28px header strip.

**Row 1 — three equal-width panels:**
1. **Pre-Bid Documentation** — checklist items from phases `PRE_BID` and `BID_SUBMISSION`.
2. **Scope of Work Elements** — items from phases `SOW` and `EXECUTION`.
3. **Deliverables from Agency** — `Obligation` rows where `owedBy = AGENCY`: title, clause, due date, days overdue (red when positive), status, escalation level (0–3 as small filled squares). Row action: **Draft escalation letter** → AI drafts formal correspondence citing the clause, shown in a plain modal with a Copy button. No sending.

Each checklist panel: compact table (not cards) with status cell, title, citation cell in monospace (`GTC §19.3 · p.42`, clickable → Documents page viewer at that page), due date, owner. Header shows `done / total` and a thin progress bar. Status is inline-editable. "Add item" row at the bottom. Filter chips: All / Open / Overdue.

**Row 2 — AI Insights (full width):**
`Insight` rows ordered by severity: 2px coloured left bar, title, one-line body, related entity link, citation, actions `Mark done` / `Dismiss`. Header button **Regenerate** runs the insights job (§7.4). Empty state text: "No insights yet — upload tender documents to begin."

**Row 3 — Schedule (full width):**
Stat strip: `Project finish`, `Contract finish`, `Variance (days)`, `P(on-time)`. Tabs: `Gantt` | `PERT Network` | `Activity Table`.
- **Gantt:** frozen left columns (ID, Activity, Dur, Start, Finish, Float) + timeline. Planned bars steel blue, critical bars red, completed portion darker, data-date vertical line, dependency arrows. Week/month scale toggle.
- **PERT Network:** activity-on-node boxes from `layoutNetwork`. Each node: code, name, ES/EF top, LS/LF bottom, float. Critical edges red. Pan and zoom.
- **Activity Table:** editable grid. Editing duration, %, actual dates, or links triggers recompute; all three tabs render from the same engine result. Add/remove activity and link.

### Documents
Split: **left 60%** workspace, **right 40%** chat.

**Left:** drop zone (PDF only, multiple). Document table: filename, type (inline-editable select), pages, scanned indicator, status with spinner, uploaded, actions (View, Reprocess, Delete). Clicking a row swaps the table for a viewer: page navigator, extracted text of the current page, and a **Findings** tab listing everything extracted from that document with page anchors.

**Right — chat:** project-scoped, persisted in `ChatMessage`.
- User uploads and types a description ("This is Volume 2 of the SECL Dipka tender — equipment specs"). Assistant acknowledges, proposes a `docType` (user can correct via the table's select), and the extraction job starts.
- On job completion the assistant posts a changeset summary ("Found 12 pre-bid requirements, 7 SOW elements, 5 agency obligations, 4 schedule milestones") followed by a **review card**: proposed items grouped by type, each with a checkbox (default on) and citation, and buttons Accept all / Accept selected / Reject. Accepting writes the records; the dashboard reflects them on next load.
- Chat without upload answers questions from stored `DocumentPage` text with page citations (§7.5).

### Settings
Project name, tender ref, agency, contract start and duration, and a **Reset project data** button (confirm dialog) that clears everything except the project record. Show the configured model IDs read-only.

---

## 6. Design language — Primavera P6 inspired, serious business only

Enterprise scheduling software. Every screen should look at home beside P6, MS Project, or a trading terminal.

- **Density:** base font 12px, table rows 26–28px, panel headers 28px, 8px grid, tight padding.
- **Typography:** Inter for UI; JetBrains Mono for IDs, dates, clause refs, and numeric table cells. Headings are 11px uppercase with letter-spacing, never large display text.
- **Colour:** surfaces #ffffff and #f4f5f7, borders #d0d4da, text #1f2430 / #5b6472, sidebar #1e2a3a. Accent steel blue #2f5f8f for links, selected rows, planned bars. Status colours are the only saturated colours: critical/overdue #c0392b, warning #b7791f, done #2e7d4f, in-progress #2f5f8f, neutral #8a94a6. **No gradients, no shadows beyond a 1px border, corners ≤ 2px, no emoji, no illustrations, no marketing copy.**
- **Components:** flat panels with header strips; tables with visible row separators and right-aligned numerics; toolbars as strips of 14px icon buttons with tooltips; tabs as underlined text; inputs 26px tall; primary buttons solid steel blue, secondary outlined; rectangular modals.
- **Charts:** thin #e9ebef gridlines, 14px bars, visible week columns, mono labels, 1px dark grey dependency arrows with small heads. The Gantt must be recognisable as P6-style at a glance.
- **Motion:** ≤ 120ms hover/focus transitions only. No skeleton shimmer.
- **Icons:** `lucide-react`, 14px, monochrome.
- Put all values in `src/styles/tokens.css` as CSS variables and override the shadcn theme to them.

---

## 7. AI calls (`src/lib/ai/prompts/`)

Each prompt is a function returning the prompt string with its `zod` output schema alongside. Every structured call requests JSON only and validates it; on failure retry once with the validation error appended, then fail the job with a readable message. Log every call to `AiCallLog`.

1. **`classifyDocument`** (light model) — user description + first 3 pages of text (or first chunk as document for scanned). Output `{ docType, confidence, reasoning }`.
2. **`extractRequirements`** (heavy model) — for text-layer docs, split by detected section headings (the sample has clear ones: GENERAL TERMS AND CONDITIONS OF CONTRACT, ADDITIONAL TERMS & CONDITIONS, TECHNICAL SPECIFICATIONS, Annexure-N) and cap each call at ~40 pages; for scanned docs, one call per ≤ 20-page chunk with the document block. Output array of `{ entityType: CHECKLIST_ITEM | OBLIGATION | ACTIVITY, phaseKey?, title, description, clause?, page, owedBy?, stipulatedDays?, dueDateHint?, confidence }`. Pass the actual page offset of the chunk so returned page numbers are absolute. Deduplicate across chunks by normalised title before building the changeset. Instruct the model to prefer time-bound clauses ("within N days", "prior to", "shall submit") and to always cite the clause number when the text shows one.
3. **`proposeActivities`** (heavy model) — from SOW/scope text and contract duration, propose a WBS with `mostLikely` durations and FS links, marked `sourceType: AI`. Proposals only; they enter the changeset like everything else.
4. **`generateInsights`** (heavy model) — input is a compact JSON snapshot: overdue obligations, blocked/overdue checklist items, engine output (critical path, activities with float < 3 days, finish variance, P(on-time)), and changes since last run. Output ≤ 8 insights. The prompt must state that all numbers in the snapshot are authoritative and must not be recomputed or altered.
5. **`answerFromDocuments`** (light model) — keyword search over `DocumentPage.text` (SQLite `LIKE` on 2–4 extracted keywords), pass the top ~10 pages with page numbers, require page citations in the answer.
6. **`draftEscalationLetter`** (light model) — obligation + clause text + escalation level → formal letter.

---

## 8. Seed data

`prisma/seed.ts` creates the demo project so the dashboard is populated before any upload:

- **Project:** "SECL Dipka OCP — 2×16 MVA & 2×5 MVA Substations", tender ref `SECL/BSP/CMC/e-Tender/240`, agency "South Eastern Coalfields Ltd (SECL), Dipka Area", contract value ₹22,71,42,147, construction period 540 days. Set `contractStart` to roughly 120 days before today so the schedule shows work in progress.
- **Checklist items** drawn from the real document (mark `sourceType: AI`, cite `Tendernotice_2.pdf` and these approximate pages):
  - Pre-bid: eligibility — 3 similar works ≥ 40% / 2 ≥ 50% / 1 ≥ 80% of estimated cost in last 7 years (p.3); EMD ₹28,39,300 online only (p.2); two-part three-cover submission (p.7–9); pre-bid meeting attendance (p.2); online clarification window (p.2).
  - Post-award: agreement within 60 days of LOA (GTC 2.4, ~p.29); performance security within 30 days of LOA (GTC ~p.29); CLPMP registration within 30 days of work order (22.5, ~p.23); the 8 documents due within 30 days of LOA — stamp paper, site handover certificate, labour licence, insurance policies, CMPF certificate, HT electrical contractor licence, time & progress chart, personnel list (30.5, ~p.24).
  - Execution: maintain hindrance register (GTC 19.2, ~p.42); EOT request within 14 days of hindrance (19.3); running bills per proforma (41.5.1).
- **Obligations owed by the agency** (fabricated post-award state against real clauses): site handover certificate (joint, 30.5) — RECEIVED; jointly signed time & progress chart (30.5) — RECEIVED; supply of SECL-owned equipment in OK condition (NIT note iv, p.2) — REQUESTED 35 days ago, stipulated 30, OVERDUE, escalation level 1; response to EOT request no. 1 (GTC 19.3, 1 month) — REQUESTED 20 days ago, PENDING; approval of substation civil drawings — REQUESTED 12 days ago, PENDING.
- **Activities:** ~16 with links forming a credible substation EPC schedule: mobilisation → site survey → design & drawing submission → drawing approval (agency) → civil works (control room, outdoor yard) → transformer procurement → switchgear procurement → foundations → equipment erection → cabling → earthing → testing → trial run → commissioning. Set actuals so the first four are complete, civil works are in progress, and procurement is the critical path.
- **Insights:** four, consistent with the above (e.g. equipment supply overdue is on the critical path; EOT response window closes in N days).

Do not fabricate clause numbers beyond those listed; where unsure, cite page only.

---

## 9. Build order — one commit per milestone

1. Scaffold Next.js + Tailwind + shadcn + Prisma/SQLite; `tokens.css`; shell with sidebar, toolbar, project selector.
2. Schema, migration, seed. Dashboard must look populated on first run.
3. Schedule engine + vitest suite passing.
4. Dashboard: checklist panels + agency deliverables panel, read/write.
5. Dashboard: Activity Table with live recompute → Gantt → PERT network.
6. AI client module + `AiCallLog`; verify with a trivial call.
7. Documents page: upload, text-layer extraction, scanned detection, document table, viewer.
8. Extraction jobs (text and scanned paths) → changeset → chat review card → accept flow. Test with both sample files.
9. Insights generation, escalation letter modal, Settings page.
10. Design audit against §6; remove anything that looks like default shadcn or a consumer app.

After each milestone run `tsc --noEmit`, `vitest run`, and `next build`. Do not proceed with failing checks. Update `CLAUDE.md` if any decision changes.

---

## 10. Out of scope

Auth, multi-tenancy, a second AI provider, local OCR, vector search, email/SMS escalation, XER/MPP import, resource or cost loading. Leave clean extension points and list them in `CLAUDE.md`.
