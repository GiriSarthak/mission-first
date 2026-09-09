import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser, visibleProjects } from "@/lib/auth/authorize";
import { computeProjectDelayCost } from "@/lib/analysis/snapshot";
import { sweepProjects } from "@/lib/obligations/sweep";
import {
  computeSchedule,
  finishProbability,
  type EngineLink,
  type LinkType,
} from "@/lib/schedule/engine";
import { PortfolioTable, type PortfolioRow } from "@/components/portfolio/portfolio-table";
import { PortfolioShell } from "@/components/portfolio/portfolio-shell";

export const dynamic = "force-dynamic";

/**
 * Agency home (Phase 2 brief, Part C). A triage view only — every figure is
 * computed by the same deterministic engine the dashboards use, and nothing
 * on this page is editable.
 */
export default async function PortfolioPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.orgType !== "AGENCY") redirect("/");

  const projects = await visibleProjects(user);

  // Rule-based escalation across the whole portfolio before the figures are read.
  await sweepProjects(projects.map((p) => p.id));

  const rows: PortfolioRow[] = await Promise.all(
    projects.map(async (p) => {
      const [activities, links, vendorOrg, openCritical, lastActivityAt] =
        await Promise.all([
          db.activity.findMany({ where: { projectId: p.id } }),
          db.activityLink.findMany({ where: { predecessor: { projectId: p.id } } }),
          p.vendorOrgId
            ? db.organization.findUnique({ where: { id: p.vendorOrgId } })
            : null,
          db.insight.count({
            where: { projectId: p.id, status: "OPEN", severity: "CRITICAL" },
          }),
          lastActivityDate(p.id),
        ]);

      const delayCost = await computeProjectDelayCost(p.id);

      // P(on-time) uses the same engine run the dashboard shows
      const today = new Date();
      today.setHours(0, 0, 0, 0);
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
        p.contractStart ?? today,
        today
      );
      const pOnTime =
        schedule.ok && p.contractDurationDays != null
          ? finishProbability(
              schedule.criticalVariances,
              schedule.projectFinish,
              p.contractDurationDays
            )
          : null;

      return {
        id: p.id,
        name: p.name,
        tenderRef: p.tenderRef,
        vendorOrgName: vendorOrg?.name ?? "—",
        delayDays: delayCost?.delayDays ?? 0,
        ldExposure: delayCost?.ldExposure ?? 0,
        ldCapReached: delayCost?.ldCapReached ?? false,
        agencyAttributablePct: delayCost?.agencyAttributablePct ?? 0,
        agencyAttributableDays: delayCost?.agencyAttributableDays ?? 0,
        vendorAttributableDays: delayCost?.vendorAttributableDays ?? 0,
        pOnTime,
        openCriticalInsights: openCritical,
        lastActivityAt: lastActivityAt?.toISOString() ?? null,
      };
    })
  );

  const totals = {
    projects: rows.length,
    delayed: rows.filter((r) => r.delayDays > 0).length,
    exposure: rows.reduce((s, r) => s + r.ldExposure, 0),
    agencyDays: rows.reduce((s, r) => s + r.agencyAttributableDays, 0),
  };

  return (
    <PortfolioShell
      userName={user.name}
      orgName={user.orgName}
      role={user.role}
      totals={totals}
    >
      <PortfolioTable rows={rows} />
    </PortfolioShell>
  );
}

/** Most recent sign of life on a project, for the triage "last activity" column. */
async function lastActivityDate(projectId: string): Promise<Date | null> {
  const [chat, doc, snapshot, insight] = await Promise.all([
    db.chatMessage.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.document.findFirst({
      where: { projectId },
      orderBy: { uploadedAt: "desc" },
      select: { uploadedAt: true },
    }),
    db.scheduleSnapshot.findFirst({
      where: { projectId },
      orderBy: { capturedAt: "desc" },
      select: { capturedAt: true },
    }),
    db.insight.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  const dates = [
    chat?.createdAt,
    doc?.uploadedAt,
    snapshot?.capturedAt,
    insight?.createdAt,
  ].filter((d): d is Date => !!d);
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a > b ? a : b));
}
