import { db } from "@/lib/db";
import { ChecklistPanel } from "@/components/dashboard/checklist-panel";
import { ObligationsPanel } from "@/components/dashboard/obligations-panel";
import { InsightsPanel } from "@/components/dashboard/insights-panel";

export const dynamic = "force-dynamic";

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [phases, obligations, insights] = await Promise.all([
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
  ]);

  const pickPhases = (keys: string[]) =>
    phases.filter((p) => keys.includes(p.key));

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
        />
        <ChecklistPanel
          projectId={id}
          title="Scope of Work Elements"
          phases={serializePhases(["SOW", "EXECUTION"])}
          items={serializeItems(["SOW", "EXECUTION"])}
        />
        <ObligationsPanel
          projectId={id}
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
          }))}
        />
      </div>

      <InsightsPanel
        projectId={id}
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

      {/* Row 3 — Schedule views arrive in milestone 5 */}
      <div className="mf-panel">
        <div className="mf-panel-header">
          <span className="mf-panel-title">Schedule</span>
        </div>
        <div className="p-4 text-[12px] text-mf-text-2">
          Gantt, PERT network, and activity table arrive in milestone 5.
        </div>
      </div>
    </div>
  );
}
