# Mission First — Phase 2 Brief: Government Platform, Roles, Time-Cost Analysis

You are extending the existing Mission First demo, not rebuilding it. Read the current codebase and `CLAUDE.md` before making changes. This brief describes a direction shift and two features; apply them as incremental changes, preserve everything already working (schedule engine, extraction pipeline, changeset review, design tokens), and update `CLAUDE.md` when done.

## Direction shift

Mission First is now framed as a platform the **government agency provides to its vendors**, not a tool a vendor buys for itself. One project has two sides looking at the same data with different permissions: the **vendor** executing the contract, and the **agency** that issued the tender and owes the vendor certain obligations. Both are users of the same instance. This changes the data model from single-workspace to properly multi-tenant, and it means the agency needs a view across *all* its vendor projects, not just one.

Do not build SSO or a production identity provider yet. Build real session-based auth with roles, structured so a government SSO provider can replace the credentials provider later without touching permission logic.

---

## Part A — Auth and roles

### Data model additions

```
Organization   id, name, type (AGENCY | VENDOR), createdAt
User           id, orgId, name, email, passwordHash, role, createdAt

Role (per user, scoped by org type):
  VENDOR:  VENDOR_ADMIN (full edit on own org's projects), VENDOR_MEMBER (edit checklists/activities, cannot delete project or manage users)
  AGENCY:  AGENCY_ADMIN (full read + obligation response + drawing approval across all projects under the org), AGENCY_REVIEWER (read-only + obligation response, no drawing approval)
```

Add to `Project`: `vendorOrgId`, `agencyOrgId` (both reference `Organization`). A project is created by a vendor user under their own `vendorOrgId`, against an `agencyOrgId` selected from existing agency organizations (or entered as new during project creation — agency org gets created but has no users until the agency signs in with a seeded/invited account).

### Auth implementation

- **Auth.js (NextAuth) v5**, credentials provider, JWT session. Password hashing with `bcrypt`.
- Middleware (`middleware.ts`) protects all `/projects/*` routes; unauthenticated requests redirect to `/login`.
- Every Server Action and Route Handler that touches project data must resolve the session, then check: does this user's org match the project's `vendorOrgId` or `agencyOrgId`? If neither, 403. Do not trust a `projectId` in a request body without this check — this is the actual security boundary, not the UI.
- Build a single `getAuthorizedProject(projectId, session)` helper in `src/lib/auth/authorize.ts` that every route/action calls. No feature code re-implements this check.
- `/login` page: email + password, styled to match the design tokens already in place (flat, no illustration, small wordmark, centered card, max 360px wide).

### Permission matrix (enforce server-side, reflect in UI by hiding/disabling, never by hiding-only)

| Action | VENDOR_ADMIN | VENDOR_MEMBER | AGENCY_ADMIN | AGENCY_REVIEWER |
|---|---|---|---|---|
| Edit checklist items, activities, links | yes | yes | no | no |
| Upload documents, run extraction, accept changesets | yes | yes | no | no |
| Mark own obligation actions (request, mark received) | yes | yes | no | no |
| Update obligation status as fulfilling party (agency side: mark REQUESTED item RECEIVED-acknowledged, add response note) | no | no | yes | yes |
| Approve items flagged as requiring agency approval (e.g. drawing approval checklist items) | no | no | yes | no |
| View dashboard, schedule, insights, time-cost panel | yes | yes | yes (any project under their org) | yes (any project under their org) |
| Draft/view escalation letters | yes | yes | view only | view only |
| Manage org users | yes | no | yes | no |
| Create new project | yes | no | no | no |

### Views that differ by role

- **Vendor users**: land on their own project's dashboard (or a picker if they have more than one project). Sidebar project selector lists only their org's projects. Full existing dashboard, unchanged.
- **Agency users**: land on a new **Portfolio page** (`/portfolio`), not a single project dashboard. This is the agency's home view — see Part C. From there they open a specific project's dashboard in a **read-mostly mode**: same panels, but checklist/activity editing controls are gone, obligation rows show a "Respond" action instead of vendor's edit controls, and the AI Insights panel adds an agency-framed insight category (see Part B).

### Seed data

Extend `prisma/seed.ts`: keep the existing SECL Dipka project, but attach it to a seeded `Organization` (type VENDOR, e.g. "Apex Power Infra Pvt. Ltd.") and a seeded agency `Organization` (type AGENCY, "South Eastern Coalfields Ltd."). Seed one user per role (4 total) with a clearly printed demo password in `CLAUDE.md` and in a console log on seed completion — never hardcode it into UI copy. Seed a second, smaller vendor project under a different vendor org but the same agency org, so the portfolio view has more than one row to demonstrate the point.

---

## Part B — Live time-delay vs cost analysis

This is a new dashboard panel plus a portfolio-level rollup. Follow the existing principle: **all figures are computed by deterministic code**; the AI only narrates what the numbers mean.

### Calculation module (`src/lib/analysis/delayCost.ts`, unit-tested)

Inputs: current `computeSchedule` output, `Project.contractStart`, `Project.contractDurationDays`, `Project.contractValue`, LD terms, and `Obligation` records.

- `contractFinishDate = contractStart + contractDurationDays`
- `forecastFinishDate` = from the engine's current run
- `delayDays = max(0, forecastFinishDate − contractFinishDate)` (in days)
- `ldWeeklyRatePct` and `ldCapPct`: read from `Project` (add these two fields; default `0.5` and `10` from the actual GTC clause in the sample tender, editable in Settings since SCC can override GTC)
- `ldExposure = min(ldCapPct, (delayDays / 7) * ldWeeklyRatePct) / 100 * contractValue`
- **Delay attribution**: add `blockingActivityId` (optional) to `Obligation`, letting an extraction or manual link mark which activity an agency obligation blocks (e.g. "supply of SECL equipment" blocks "equipment erection"). For each day the project has been delayed relative to the original baseline, determine whether an AGENCY obligation was overdue *and* its `blockingActivityId` was on the critical path that day. Because you don't have daily history yet, approximate for the demo: `agencyAttributableDays = sum over overdue AGENCY obligations blocking a currently-critical activity of min(obligation.overdueDays, delayDays)`, capped at `delayDays` in total. `vendorAttributableDays = delayDays − agencyAttributableDays`.
- Return `{ delayDays, contractFinishDate, forecastFinishDate, ldExposure, ldCapReached (bool), agencyAttributableDays, vendorAttributableDays, agencyAttributablePct }`.

Write tests: zero delay, delay fully agency-caused, delay fully vendor-caused, delay exceeding LD cap, no LD terms set (should not throw).

### Snapshot for the trend line

Add `ScheduleSnapshot`: `id, projectId, capturedAt, forecastFinishDate, delayDays, ldExposure, agencyAttributablePct`. Write one snapshot every time the schedule is recomputed (i.e., inside the same server action that calls `computeSchedule`, not a separate cron — keep it simple). This gives the panel a real trend line from day one of usage without needing a scheduler.

### Panel design — "Time & Cost Exposure" (new row on the dashboard, between Insights and Schedule)

Same flat P6 styling as everything else. Left third: stat block — `Delay: N days`, `LD exposure: ₹X` (red if `ldCapReached`), `Agency-attributable: N%` / `Vendor-attributable: N%` shown as a thin two-segment horizontal bar (steel blue for vendor, warning amber for agency — do not use the overdue red here, this isn't blame, it's allocation). Right two-thirds: a line chart from `ScheduleSnapshot` history — two lines, delay days and LD exposure (dual axis, or two stacked small charts if a dual axis reads badly in mono/flat style), gridlines and labels in the same style as the Gantt.

On the **Portfolio page** (agency view), show this same stat block condensed into one row per project in a table, so an agency reviewer can scan delay and LD exposure across every vendor at once, sorted by delay descending by default.

### AI narration

Add a `generateDelayCostInsight` prompt (light model): input is the `delayCost` output plus which obligations are driving the agency-attributable share. Output one or two sentences the way a project controls officer would write them, e.g. "Of the 12-day delay, 8 days trace to the overdue equipment-supply obligation on the critical path; LD exposure is ₹X against a ₹Y cap." This becomes one `Insight` row (category `SCHEDULE`, or a new category `TIME_COST`) rather than a separate free-floating text box — keep insights in one place.

---

## Part C — Portfolio page (agency home)

New route `/portfolio`, agency roles only (vendor users never see this; redirect them to their project). Table: project name, tender ref, vendor org, delay days, LD exposure, P(on-time), open critical insights count, last activity date. Row click opens that project's dashboard in the read-mostly agency mode from Part A. No editing on this page itself — it's a triage view.

---

## Build order

1. Auth: Organization/User schema, Auth.js setup, `/login`, `middleware.ts`, `getAuthorizedProject` helper. Seed the four demo users. Verify vendor and agency logins land on different views before doing anything else.
2. Wire the existing dashboard behind auth: role-based editability (disable controls, not hide — server actions must reject writes from agency roles regardless of UI state). Confirm with both a vendor and an agency login.
3. `delayCost.ts` + tests. Confirm numbers against the seeded project by hand before wiring UI.
4. `ScheduleSnapshot` write-on-recompute; backfill 10–15 synthetic snapshots in seed so the trend chart isn't a single point on first run.
5. Time & Cost Exposure panel on the dashboard.
6. Portfolio page.
7. `generateDelayCostInsight` wired into the existing insights flow.
8. Design audit: login page and portfolio page must match tokens.css exactly — no default Auth.js styling anywhere.

Run `tsc --noEmit`, `vitest run`, `next build` after each numbered step; commit at each. Update `CLAUDE.md` with the new auth model, the permission matrix, and the delay-attribution logic (this last one especially — it's a judgment call embedded in code and the next person touching it needs to know why).

## Explicitly not doing yet

SSO/OIDC, password reset flow, email invitations for new agency users (seed them directly), audit log of who changed what, multi-project vendors with more than the seeded two, configurable permission matrix (it's hardcoded per role for now).
