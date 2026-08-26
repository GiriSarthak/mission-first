/**
 * Seeds the demo project (BRIEF §8) so the dashboard is populated before any
 * upload. Dates are relative to "today" so the schedule always shows work in
 * progress. Citations reference the real Tendernotice_2.pdf clauses/pages
 * listed in the brief; clause numbers are never fabricated beyond those.
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const db = new PrismaClient();

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const TODAY = startOfToday();

function day(offsetFromContractStart: number, base: Date): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetFromContractStart);
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  const existing = await db.project.findFirst({
    where: { tenderRef: "SECL/BSP/CMC/e-Tender/240" },
  });
  if (existing) {
    console.log("Demo project already seeded — skipping.");
    return;
  }

  const contractStart = daysAgo(120);
  const loaDate = day(-20, contractStart);

  const project = await db.project.create({
    data: {
      name: "SECL Dipka OCP — 2×16 MVA & 2×5 MVA Substations",
      tenderRef: "SECL/BSP/CMC/e-Tender/240",
      agencyName: "South Eastern Coalfields Ltd (SECL), Dipka Area",
      contractValue: 227142147,
      contractStart,
      contractDurationDays: 540,
    },
  });

  // ---- Tender document record (file copied from ./samples when present) ----
  const doc = await db.document.create({
    data: {
      projectId: project.id,
      filename: "Tendernotice_2.pdf",
      storagePath: "", // set below once the id is known
      docType: "TENDER_NIT",
      isScanned: false,
      pageCount: 111,
      processingStatus: "PENDING",
      userDescription:
        "NIT and bid documents — SECL/BSP/CMC/e-Tender/240 (NIT p.1–24, GTC p.25–50, ATC p.51–81, Tech Spec p.82+, Annexures I–X)",
    },
  });
  const storageDir = path.join(process.cwd(), "storage", project.id);
  const storagePath = path.join("storage", project.id, `${doc.id}.pdf`);
  const samplePath = path.join(process.cwd(), "samples", "Tendernotice_2.pdf");
  if (fs.existsSync(samplePath)) {
    fs.mkdirSync(storageDir, { recursive: true });
    fs.copyFileSync(samplePath, path.join(process.cwd(), storagePath));
  }
  await db.document.update({ where: { id: doc.id }, data: { storagePath } });

  // ---- Checklist phases ----
  const phaseDefs = [
    { key: "PRE_BID", title: "Pre-Bid", sortOrder: 1 },
    { key: "BID_SUBMISSION", title: "Bid Submission", sortOrder: 2 },
    { key: "POST_AWARD", title: "Post-Award", sortOrder: 3 },
    { key: "SOW", title: "Scope of Work", sortOrder: 4 },
    { key: "EXECUTION", title: "Execution", sortOrder: 5 },
    { key: "CLOSEOUT", title: "Closeout", sortOrder: 6 },
  ];
  const phases: Record<string, string> = {};
  for (const p of phaseDefs) {
    const row = await db.checklistPhase.create({
      data: { projectId: project.id, ...p },
    });
    phases[p.key] = row.id;
  }

  // ---- Checklist items (sourceType AI, citing Tendernotice_2.pdf) ----
  type ItemSeed = {
    phase: string;
    title: string;
    description?: string;
    status: string;
    dueDate?: Date;
    ownerRole?: string;
    clause?: string;
    page?: number;
  };
  const items: ItemSeed[] = [
    // Pre-bid
    {
      phase: "PRE_BID",
      title: "Eligibility: similar works experience",
      description:
        "3 similar works ≥ 40%, or 2 ≥ 50%, or 1 ≥ 80% of estimated cost in the last 7 years.",
      status: "DONE",
      page: 3,
      ownerRole: "Bid Manager",
    },
    {
      phase: "PRE_BID",
      title: "EMD ₹28,39,300 (online only)",
      status: "DONE",
      page: 2,
      ownerRole: "Finance",
    },
    {
      phase: "PRE_BID",
      title: "Pre-bid meeting attendance",
      status: "DONE",
      page: 2,
      ownerRole: "Bid Manager",
    },
    {
      phase: "PRE_BID",
      title: "Online clarification window",
      description: "Raise clarifications within the online window on the e-tender portal.",
      status: "DONE",
      page: 2,
      ownerRole: "Bid Manager",
    },
    // Bid submission
    {
      phase: "BID_SUBMISSION",
      title: "Two-part, three-cover bid submission",
      description: "Cover-I EMD, Cover-II technical, Cover-III price, per NIT instructions.",
      status: "DONE",
      page: 7,
      ownerRole: "Bid Manager",
    },
    // Post-award
    {
      phase: "POST_AWARD",
      title: "Execute agreement within 60 days of LOA",
      status: "DONE",
      dueDate: day(60, loaDate),
      clause: "GTC 2.4",
      page: 29,
      ownerRole: "Contracts",
    },
    {
      phase: "POST_AWARD",
      title: "Performance security within 30 days of LOA",
      status: "DONE",
      dueDate: day(30, loaDate),
      clause: "GTC 2.4",
      page: 29,
      ownerRole: "Finance",
    },
    {
      phase: "POST_AWARD",
      title: "CLPMP registration within 30 days of work order",
      status: "DONE",
      dueDate: day(30, contractStart),
      clause: "22.5",
      page: 23,
      ownerRole: "HR / IR",
    },
    // The 8 documents due within 30 days of LOA (30.5, ~p.24)
    {
      phase: "POST_AWARD",
      title: "Agreement stamp paper",
      status: "DONE",
      dueDate: day(30, loaDate),
      clause: "30.5",
      page: 24,
      ownerRole: "Contracts",
    },
    {
      phase: "POST_AWARD",
      title: "Site handover certificate (joint)",
      status: "DONE",
      dueDate: day(30, loaDate),
      clause: "30.5",
      page: 24,
      ownerRole: "Site Manager",
    },
    {
      phase: "POST_AWARD",
      title: "Labour licence",
      status: "IN_PROGRESS",
      dueDate: day(30, loaDate),
      clause: "30.5",
      page: 24,
      ownerRole: "HR / IR",
    },
    {
      phase: "POST_AWARD",
      title: "Insurance policies (CAR / WC)",
      status: "DONE",
      dueDate: day(30, loaDate),
      clause: "30.5",
      page: 24,
      ownerRole: "Finance",
    },
    {
      phase: "POST_AWARD",
      title: "CMPF certificate",
      status: "DONE",
      dueDate: day(30, loaDate),
      clause: "30.5",
      page: 24,
      ownerRole: "HR / IR",
    },
    {
      phase: "POST_AWARD",
      title: "HT electrical contractor licence",
      status: "DONE",
      dueDate: day(30, loaDate),
      clause: "30.5",
      page: 24,
      ownerRole: "Contracts",
    },
    {
      phase: "POST_AWARD",
      title: "Time & progress chart (jointly signed)",
      status: "DONE",
      dueDate: day(30, loaDate),
      clause: "30.5",
      page: 24,
      ownerRole: "Planning",
    },
    {
      phase: "POST_AWARD",
      title: "List of personnel deployed",
      status: "IN_PROGRESS",
      dueDate: day(30, loaDate),
      clause: "30.5",
      page: 24,
      ownerRole: "HR / IR",
    },
    // Scope of work (tech spec section, pages cited only)
    {
      phase: "SOW",
      title: "2×16 MVA, 33/6.6 kV substation — design, supply, erection",
      status: "IN_PROGRESS",
      page: 82,
      ownerRole: "Engineering",
    },
    {
      phase: "SOW",
      title: "2×5 MVA substation — design, supply, erection",
      status: "IN_PROGRESS",
      page: 82,
      ownerRole: "Engineering",
    },
    {
      phase: "SOW",
      title: "Control room building civil works",
      status: "IN_PROGRESS",
      page: 82,
      ownerRole: "Civil",
    },
    {
      phase: "SOW",
      title: "Outdoor switchyard development",
      status: "IN_PROGRESS",
      page: 82,
      ownerRole: "Civil",
    },
    // Execution
    {
      phase: "EXECUTION",
      title: "Maintain hindrance register at site",
      status: "IN_PROGRESS",
      clause: "GTC 19.2",
      page: 42,
      ownerRole: "Site Manager",
    },
    {
      phase: "EXECUTION",
      title: "EOT request within 14 days of hindrance",
      description: "EOT request no. 1 submitted for equipment supply hindrance.",
      status: "DONE",
      clause: "GTC 19.3",
      page: 42,
      ownerRole: "Planning",
    },
    {
      phase: "EXECUTION",
      title: "Running account bills per proforma",
      status: "IN_PROGRESS",
      clause: "41.5.1",
      ownerRole: "Finance",
    },
  ];
  for (const it of items) {
    await db.checklistItem.create({
      data: {
        phaseId: phases[it.phase],
        title: it.title,
        description: it.description,
        status: it.status,
        dueDate: it.dueDate,
        ownerRole: it.ownerRole,
        sourceType: "AI",
        sourceDocumentId: doc.id,
        sourcePage: it.page,
        sourceClause: it.clause,
      },
    });
  }

  // ---- Obligations owed by the agency (fabricated post-award state) ----
  const equipRequested = daysAgo(35);
  const eotRequested = daysAgo(20);
  const obligations = [
    {
      title: "Site handover certificate (joint)",
      owedBy: "AGENCY",
      contractClause: "30.5",
      sourcePage: 24,
      status: "RECEIVED",
      requestedOn: day(5, loaDate),
      receivedOn: day(22, loaDate),
      stipulatedDays: 30,
      dueOn: day(35, loaDate),
    },
    {
      title: "Jointly signed time & progress chart",
      owedBy: "AGENCY",
      contractClause: "30.5",
      sourcePage: 24,
      status: "RECEIVED",
      requestedOn: day(5, loaDate),
      receivedOn: day(28, loaDate),
      stipulatedDays: 30,
      dueOn: day(35, loaDate),
    },
    {
      title: "Supply of SECL-owned equipment in OK condition",
      description:
        "SECL-supplied equipment listed in the NIT to be handed over in working condition.",
      owedBy: "AGENCY",
      contractClause: "NIT note (iv)",
      sourcePage: 2,
      status: "OVERDUE",
      requestedOn: equipRequested,
      stipulatedDays: 30,
      dueOn: day(30, equipRequested),
      escalationLevel: 1,
    },
    {
      title: "Response to EOT request no. 1",
      owedBy: "AGENCY",
      contractClause: "GTC 19.3",
      sourcePage: 42,
      status: "PENDING",
      requestedOn: eotRequested,
      stipulatedDays: 30,
      dueOn: day(30, eotRequested),
    },
    {
      title: "Approval of substation civil drawings",
      owedBy: "AGENCY",
      status: "PENDING",
      requestedOn: daysAgo(12),
    },
  ];
  const obligationRows = [];
  for (const o of obligations) {
    obligationRows.push(
      await db.obligation.create({
        data: { projectId: project.id, sourceDocumentId: doc.id, ...o },
      })
    );
  }

  // ---- Activities (substation EPC schedule; procurement is critical) ----
  type ActSeed = {
    code: string;
    name: string;
    wbs?: string;
    o?: number;
    m: number;
    p?: number;
    actualStart?: number; // day offset from contractStart
    actualFinish?: number;
    pct?: number;
    remaining?: number;
  };
  const acts: ActSeed[] = [
    { code: "A010", name: "Mobilisation & site establishment", wbs: "1.1", o: 10, m: 15, p: 25, actualStart: 0, actualFinish: 14, pct: 100 },
    { code: "A020", name: "Site survey & soil investigation", wbs: "1.2", o: 15, m: 20, p: 30, actualStart: 15, actualFinish: 34, pct: 100 },
    { code: "A030", name: "Design & drawing submission", wbs: "2.1", o: 20, m: 30, p: 45, actualStart: 35, actualFinish: 66, pct: 100 },
    { code: "A040", name: "Drawing approval (agency)", wbs: "2.2", o: 20, m: 30, p: 50, actualStart: 67, actualFinish: 98, pct: 100 },
    { code: "A050", name: "Civil works — control room building", wbs: "3.1", o: 75, m: 90, p: 120, actualStart: 100, pct: 45, remaining: 50 },
    { code: "A060", name: "Civil works — outdoor switchyard", wbs: "3.2", o: 60, m: 75, p: 100, actualStart: 105, pct: 35, remaining: 50 },
    { code: "A070", name: "Transformer procurement — 2×16 MVA", wbs: "4.1", o: 210, m: 240, p: 300, actualStart: 99, pct: 10, remaining: 225 },
    { code: "A080", name: "Transformer procurement — 2×5 MVA", wbs: "4.2", o: 180, m: 210, p: 260, actualStart: 99, pct: 15, remaining: 180 },
    { code: "A090", name: "Switchgear & panel procurement", wbs: "4.3", o: 150, m: 180, p: 220, actualStart: 100, pct: 20, remaining: 145 },
    { code: "A100", name: "Equipment foundations", wbs: "3.3", o: 35, m: 45, p: 60 },
    { code: "A110", name: "Transformer erection", wbs: "5.1", o: 25, m: 30, p: 40 },
    { code: "A120", name: "Switchgear & panel erection", wbs: "5.2", o: 30, m: 40, p: 55 },
    { code: "A130", name: "Cabling & bus work", wbs: "5.3", o: 35, m: 45, p: 60 },
    { code: "A140", name: "Earthing & lightning protection", wbs: "5.4", o: 20, m: 30, p: 40 },
    { code: "A150", name: "Testing & pre-commissioning", wbs: "6.1", o: 25, m: 30, p: 45 },
    { code: "A160", name: "Trial run", wbs: "6.2", o: 10, m: 15, p: 20 },
    { code: "A170", name: "Commissioning & handover", wbs: "6.3", o: 7, m: 10, p: 15 },
  ];
  const actIds: Record<string, string> = {};
  for (const a of acts) {
    const row = await db.activity.create({
      data: {
        projectId: project.id,
        code: a.code,
        name: a.name,
        wbsPath: a.wbs,
        optimistic: a.o,
        mostLikely: a.m,
        pessimistic: a.p,
        actualStart: a.actualStart !== undefined ? day(a.actualStart, contractStart) : undefined,
        actualFinish: a.actualFinish !== undefined ? day(a.actualFinish, contractStart) : undefined,
        percentComplete: a.pct ?? 0,
        remainingDays: a.remaining,
        sourceType: "AI",
        sourceDocumentId: doc.id,
        sourcePage: 82,
      },
    });
    actIds[a.code] = row.id;
  }

  const links: Array<[string, string, string?, number?]> = [
    ["A010", "A020"],
    ["A020", "A030"],
    ["A030", "A040"],
    ["A040", "A050"],
    ["A040", "A060"],
    ["A040", "A070"],
    ["A040", "A080"],
    ["A040", "A090"],
    ["A060", "A100"],
    ["A050", "A120"],
    ["A070", "A110"],
    ["A080", "A110"],
    ["A100", "A110"],
    ["A090", "A120"],
    ["A110", "A130"],
    ["A120", "A130"],
    ["A130", "A140", "SS", 15],
    ["A130", "A150"],
    ["A140", "A150"],
    ["A150", "A160"],
    ["A160", "A170"],
  ];
  for (const [pred, succ, type, lag] of links) {
    await db.activityLink.create({
      data: {
        predecessorId: actIds[pred],
        successorId: actIds[succ],
        type: type ?? "FS",
        lagDays: lag ?? 0,
      },
    });
  }

  // ---- Insights (consistent with the state above) ----
  const equipObligation = obligationRows[2];
  const eotObligation = obligationRows[3];
  await db.insight.createMany({
    data: [
      {
        projectId: project.id,
        title: "Agency equipment supply is overdue and feeds the critical path",
        body: "Supply of SECL-owned equipment (NIT note iv) was due 5 days ago; transformer erection cannot start without it. Escalation level 1 already issued — consider level 2.",
        severity: "CRITICAL",
        category: "OBLIGATION",
        relatedEntityType: "OBLIGATION",
        relatedEntityId: equipObligation.id,
        sourceDocumentId: doc.id,
        sourcePage: 2,
        status: "OPEN",
      },
      {
        projectId: project.id,
        title: "EOT response window closes in 10 days",
        body: "GTC 19.3 gives SECL one month to respond to EOT request no. 1 (submitted 20 days ago). Follow up before the window lapses to preserve the extension claim.",
        severity: "WARNING",
        category: "OBLIGATION",
        relatedEntityType: "OBLIGATION",
        relatedEntityId: eotObligation.id,
        sourceDocumentId: doc.id,
        sourcePage: 42,
        status: "OPEN",
      },
      {
        projectId: project.id,
        title: "Transformer procurement drives the critical path",
        body: "A070 (2×16 MVA transformers) is 10% complete with 225 days remaining. Any further slip consumes the remaining float to the 540-day contract finish.",
        severity: "WARNING",
        category: "SCHEDULE",
        relatedEntityType: "ACTIVITY",
        relatedEntityId: actIds["A070"],
        status: "OPEN",
      },
      {
        projectId: project.id,
        title: "Two post-award submissions still open past their due date",
        body: "Labour licence and personnel list (clause 30.5 — due within 30 days of LOA) remain in progress. Close them out to avoid a compliance observation at the next review.",
        severity: "WARNING",
        category: "COMPLIANCE",
        sourceDocumentId: doc.id,
        sourcePage: 24,
        status: "OPEN",
      },
    ],
  });

  console.log(`Seeded project ${project.id} (${project.name}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
