import "server-only";
import { db } from "@/lib/db";
import {
  computeSchedule,
  type EngineLink,
  type LinkType,
} from "@/lib/schedule/engine";
import { computeDelayCost, type DelayCostResult } from "@/lib/analysis/delayCost";

/**
 * Recomputes the schedule and delay-cost figures for a project from current
 * DB state. Server-side counterpart of what SchedulePanel runs in the browser
 * — same engine, same inputs, so the two never disagree.
 */
export async function computeProjectDelayCost(
  projectId: string
): Promise<DelayCostResult | null> {
  const [project, activities, links, obligations] = await Promise.all([
    db.project.findUnique({ where: { id: projectId } }),
    db.activity.findMany({ where: { projectId } }),
    db.activityLink.findMany({ where: { predecessor: { projectId } } }),
    db.obligation.findMany({ where: { projectId } }),
  ]);
  if (!project) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const projectStart = project.contractStart ?? today;

  const schedule = computeSchedule(
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

  return computeDelayCost({
    contractStart: project.contractStart,
    contractDurationDays: project.contractDurationDays,
    contractValue: project.contractValue,
    ldWeeklyRatePct: project.ldWeeklyRatePct,
    ldCapPct: project.ldCapPct,
    forecastFinishOffset: schedule.ok ? schedule.projectFinish : null,
    criticalActivityIds: schedule.ok ? schedule.criticalPath : [],
    obligations,
    today,
  });
}

/**
 * Records a ScheduleSnapshot for the project's current state. Called from
 * every server action that changes schedule or obligation data, so the trend
 * line builds up from real usage without a scheduler.
 *
 * Consecutive identical points are skipped — an edit that doesn't move the
 * forecast adds nothing to the chart, and skipping keeps it readable.
 * Failures are swallowed: a snapshot is telemetry, never a reason to fail the
 * user's edit.
 */
export async function recordScheduleSnapshot(projectId: string): Promise<void> {
  try {
    const result = await computeProjectDelayCost(projectId);
    if (!result || !result.forecastFinishDate) return;

    const last = await db.scheduleSnapshot.findFirst({
      where: { projectId },
      orderBy: { capturedAt: "desc" },
    });
    const unchanged =
      last &&
      last.delayDays === Math.round(result.delayDays) &&
      Math.round(last.ldExposure) === Math.round(result.ldExposure) &&
      last.forecastFinishDate.getTime() === result.forecastFinishDate.getTime();
    if (unchanged) return;

    await db.scheduleSnapshot.create({
      data: {
        projectId,
        forecastFinishDate: result.forecastFinishDate,
        delayDays: Math.round(result.delayDays),
        ldExposure: result.ldExposure,
        agencyAttributablePct: result.agencyAttributablePct,
      },
    });
  } catch {
    // telemetry only — never block the mutation that triggered it
  }
}
