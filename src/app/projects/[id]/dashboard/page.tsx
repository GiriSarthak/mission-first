import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ChecklistPanel } from "@/components/dashboard/checklist-panel";
import { ObligationsPanel } from "@/components/dashboard/obligations-panel";
import { InsightsPanel } from "@/components/dashboard/insights-panel";
import { SchedulePanel } from "@/components/schedule/schedule-panel";
import { AuthorizationError, getAuthorizedProject } from "@/lib/auth/authorize";

export const dynamic = "force-dynamic";

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let ctx;
  try {
    ctx = await getAuthorizedProject(id, "VIEW_PROJECT");
  } catch (err) {
    if (err instanceof AuthorizationError) notFound();
    throw err;
  }

  const perms = {
    editProjectData: ctx.can("EDIT_PROJECT_DATA"),
    markObligationVendorSide: ctx.can("MARK_OBLIGATION_VENDOR_SIDE"),
    respondObligationAgencySide: ctx.can("RESPOND_OBLIGATION_AGENCY_SIDE"),
    approveAgencyItems: ctx.can("APPROVE_AGENCY_ITEMS"),
    draftLetter: ctx.can("DRAFT_ESCALATION_LETTER"),
    regenerateInsights: ctx.can("REGENERATE_INSIGHTS"),
  };

  const [project, phases, obligations, insights, activities, links] =
    await Promise.all([
      db.project.findUnique({ where: { id } }),
      db.checklistPhase.findMany({
        where: { projectId: id },
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { createdAt: "asc" } } },
      }),
      db.obligation.findMany({
        where: { projectId: id, owedBy: "AGENCY" },
        orderBy: { requestedOn: "asc" },
      }),
      db.insight.findMany({
        where: { projectId: id, status: "OPEN" },
        orderBy: { createdAt: "asc" },
      }),
      db.activity.findMany({ where: { projectId: id }, orderBy: { code: "asc" } }),
      db.activityLink.findMany({ where: { predecessor: { projectId: id } } }),
    ]);

  const pickPhases = (keys: string[]) => phases.filter((p) => keys.includes(p.key));

  const serializeItems = (keys: string[]) =>
    pickPhases(keys)
      .flatMap((p) => p.items)
      .map((it) => ({
        id: it.id,
        title: it.title,
        status: it.status,
        dueDate: it.dueDate?.toISOString() ?? null,
        ownerRole: it.ownerRole,
        sourceClause: it.sourceClause,
        sourcePage: it.sourcePage,
        sourceDocumentId: it.sourceDocumentId,
        requiresAgencyApproval: it.requiresAgencyApproval,
        approvedAt: it.approvedAt?.toISOString() ?? null,
      }));

  const serializePhases = (keys: string[]) =>
    pickPhases(keys).map((p) => ({ id: p.id, key: p.key, title: p.title }));

  const sortedInsights = [...insights].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3)
  );

  return (
    <div className="grid gap-3 p-3">
      <div className="grid grid-cols-3 items-start gap-3">
        <ChecklistPanel
          projectId={id}
          title="Pre-Bid Documentation"
          phases={serializePhases(["PRE_BID", "BID_SUBMISSION"])}
          items={serializeItems(["PRE_BID", "BID_SUBMISSION"])}
          canEdit={perms.editProjectData}
          canApprove={perms.approveAgencyItems}
        />
        <ChecklistPanel
          projectId={id}
          title="Scope of Work Elements"
          phases={serializePhases(["SOW", "EXECUTION"])}
          items={serializeItems(["SOW", "EXECUTION"])}
          canEdit={perms.editProjectData}
          canApprove={perms.approveAgencyItems}
        />
        <ObligationsPanel
          projectId={id}
          canEditVendorSide={perms.markObligationVendorSide}
          canRespondAgencySide={perms.respondObligationAgencySide}
          canDraftLetter={perms.draftLetter}
          obligations={obligations.map((o) => ({
            id: o.id,
            title: o.title,
            contractClause: o.contractClause,
            sourcePage: o.sourcePage,
            sourceDocumentId: o.sourceDocumentId,
            dueOn: o.dueOn?.toISOString() ?? null,
            receivedOn: o.receivedOn?.toISOString() ?? null,
            status: o.status,
            escalationLevel: o.escalationLevel,
            agencyResponseNote: o.agencyResponseNote,
            agencyRespondedAt: o.agencyRespondedAt?.toISOString() ?? null,
          }))}
        />
      </div>

      <InsightsPanel
        projectId={id}
        canRegenerate={perms.regenerateInsights}
        insights={sortedInsights.map((ins) => ({
          id: ins.id,
          title: ins.title,
          body: ins.body,
          severity: ins.severity,
          category: ins.category,
          relatedEntityType: ins.relatedEntityType,
          relatedEntityId: ins.relatedEntityId,
          sourceDocumentId: ins.sourceDocumentId,
          sourcePage: ins.sourcePage,
        }))}
      />

      <SchedulePanel
        projectId={id}
        canEdit={perms.editProjectData}
        contractStart={project?.contractStart?.toISOString() ?? null}
        contractDurationDays={project?.contractDurationDays ?? null}
        initialActivities={activities.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          wbsPath: a.wbsPath,
          optimistic: a.optimistic,
          mostLikely: a.mostLikely,
          pessimistic: a.pessimistic,
          actualStart: a.actualStart?.toISOString() ?? null,
          actualFinish: a.actualFinish?.toISOString() ?? null,
          percentComplete: a.percentComplete,
          remainingDays: a.remainingDays,
        }))}
        initialLinks={links.map((l) => ({
          id: l.id,
          predecessorId: l.predecessorId,
          successorId: l.successorId,
          type: l.type,
          lagDays: l.lagDays,
        }))}
      />
    </div>
  );
}
