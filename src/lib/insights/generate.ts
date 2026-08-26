/**
 * §7.4 — builds the deterministic snapshot (engine + DB, no AI math) and asks
 * the heavy model to narrate ≤ 8 insights. Regeneration dismisses the previous
 * open set and inserts the new one.
 */
import { db } from "@/lib/db";
import {
  computeSchedule,
  finishProbability,
  offsetToDate,
  type EngineLink,
  type LinkType,
} from "@/lib/schedule/engine";
import { completeJson } from "@/lib/ai/client";
import {
  generateInsightsPrompt,
  GenerateInsightsSchema,
} from "@/lib/ai/prompts/generate-insights";
import { formatDate, daysBetween } from "@/lib/format";

export async function buildInsightsSnapshot(projectId: string): Promise<object> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [project, obligations, phases, activities, links, lastInsight] =
    await Promise.all([
      db.project.findUniqueOrThrow({ where: { id: projectId } }),
      db.obligation.findMany({ where: { projectId } }),
      db.checklistPhase.findMany({
        where: { projectId },
        include: { items: true },
      }),
      db.activity.findMany({ where: { projectId } }),
      db.activityLink.findMany({ where: { predecessor: { projectId } } }),
      db.insight.findFirst({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const projectStart = project.contractStart ?? today;
  const result = computeSchedule(
    activities.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      optimistic: a.optimistic,
      mostLikely: a.mostLikely,
      pessimistic: a.pessimistic,
      actualStart: a.actualStart,
      actualFinish: a.actualFinish,
      percentComplete: a.percentComplete,
      remainingDays: a.remainingDays,
    })),
    links.map(
      (l): EngineLink => ({
        predecessorId: l.predecessorId,
        successorId: l.successorId,
        type: l.type as LinkType,
        lagDays: l.lagDays,
      })
    ),
    projectStart,
    today
  );

  const contractFinishOffset = project.contractDurationDays ?? null;

  const overdueObligations = obligations
    .filter((o) => o.dueOn && !o.receivedOn && o.dueOn < today && o.status !== "WAIVED")
    .map((o) => ({
      id: o.id,
      title: o.title,
      owedBy: o.owedBy,
      clause: o.contractClause,
      page: o.sourcePage,
      dueOn: formatDate(o.dueOn),
      daysOverdue: daysBetween(o.dueOn!, today),
      escalationLevel: o.escalationLevel,
      status: o.status,
    }));

  const pendingAgency = obligations
    .filter((o) => o.owedBy === "AGENCY" && !o.receivedOn && o.status !== "WAIVED")
    .map((o) => ({
      id: o.id,
      title: o.title,
      clause: o.contractClause,
      page: o.sourcePage,
      requestedOn: formatDate(o.requestedOn),
      dueOn: formatDate(o.dueOn),
      daysUntilDue: o.dueOn ? daysBetween(today, o.dueOn) : null,
    }));

  const problemChecklist = phases.flatMap((ph) =>
    ph.items
      .filter(
        (i) =>
          i.status === "BLOCKED" ||
          (i.dueDate &&
            i.dueDate < today &&
            !["DONE", "NA"].includes(i.status))
      )
      .map((i) => ({
        id: i.id,
        phase: ph.title,
        title: i.title,
        status: i.status,
        dueDate: formatDate(i.dueDate),
        clause: i.sourceClause,
        page: i.sourcePage,
      }))
  );

  const schedule = result.ok
    ? {
        projectFinishDate: formatDate(offsetToDate(result.projectFinish, projectStart)),
        contractFinishDate:
          contractFinishOffset != null
            ? formatDate(offsetToDate(contractFinishOffset, projectStart))
            : null,
        finishVarianceDays:
          contractFinishOffset != null
            ? Math.round(contractFinishOffset - result.projectFinish)
            : null,
        pOnTime:
          contractFinishOffset != null
            ? Number(
                finishProbability(
                  result.criticalVariances,
                  result.projectFinish,
                  contractFinishOffset
                ).toFixed(3)
              )
            : null,
        criticalPath: result.criticalPath.map((id) => {
          const s = result.byId.get(id)!;
          return { id, code: s.code, name: s.name, remainingDays: Math.round(s.remaining) };
        }),
        lowFloatActivities: result.activities
          .filter((a) => !a.isComplete && !a.isCritical && a.totalFloat < 3)
          .map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            totalFloat: Math.round(a.totalFloat * 10) / 10,
          })),
      }
    : { error: "cycle detected in activity network" };

  return {
    project: {
      name: project.name,
      agency: project.agencyName,
      contractStart: formatDate(project.contractStart),
      contractDurationDays: project.contractDurationDays,
      dataDate: formatDate(today),
    },
    overdueObligations,
    pendingAgencyObligations: pendingAgency,
    blockedOrOverdueChecklistItems: problemChecklist,
    schedule,
    lastInsightsGeneratedAt: lastInsight ? formatDate(lastInsight.createdAt) : null,
  };
}

export async function generateInsights(projectId: string, jobId?: string): Promise<number> {
  const snapshot = await buildInsightsSnapshot(projectId);
  const result = await completeJson(
    GenerateInsightsSchema,
    [{ role: "user", content: generateInsightsPrompt(JSON.stringify(snapshot, null, 1)) }],
    { tier: "heavy", purpose: "generateInsights", projectId, jobId, maxTokens: 8000 }
  );

  await db.insight.updateMany({
    where: { projectId, status: "OPEN" },
    data: { status: "DISMISSED" },
  });
  for (const ins of result.insights) {
    await db.insight.create({
      data: {
        projectId,
        title: ins.title,
        body: ins.body,
        severity: ins.severity,
        category: ins.category,
        relatedEntityType: ins.relatedEntityType ?? undefined,
        relatedEntityId: ins.relatedEntityId ?? undefined,
        sourcePage: ins.sourcePage ?? undefined,
        status: "OPEN",
      },
    });
  }
  return result.insights.length;
}
