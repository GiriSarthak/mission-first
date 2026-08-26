import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate, daysBetween } from "@/lib/format";
import { StatusBadge, citation, severityColor } from "@/components/status";

export const dynamic = "force-dynamic";

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

  const preBid = phases
    .filter((p) => p.key === "PRE_BID" || p.key === "BID_SUBMISSION")
    .flatMap((p) => p.items);
  const sow = phases
    .filter((p) => p.key === "SOW" || p.key === "EXECUTION")
    .flatMap((p) => p.items);

  const severityRank = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
  const sortedInsights = [...insights].sort(
    (a, b) =>
      (severityRank[a.severity as keyof typeof severityRank] ?? 3) -
      (severityRank[b.severity as keyof typeof severityRank] ?? 3)
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="grid gap-3 p-3">
      {/* Row 1 */}
      <div className="grid grid-cols-3 gap-3">
        <ChecklistPanel projectId={id} title="Pre-Bid Documentation" items={preBid} />
        <ChecklistPanel projectId={id} title="Scope of Work Elements" items={sow} />
        <div className="mf-panel">
          <div className="mf-panel-header">
            <span className="mf-panel-title">Deliverables from Agency</span>
            <span className="mf-mono ml-auto text-[10px] text-mf-text-2">
              {obligations.filter((o) => o.status === "RECEIVED").length} /{" "}
              {obligations.length}
            </span>
          </div>
          <table className="w-full border-collapse">
            <tbody>
              {obligations.map((o) => {
                const overdueDays =
                  o.dueOn && !o.receivedOn ? daysBetween(new Date(o.dueOn), today) : 0;
                return (
                  <tr key={o.id} className="border-b border-mf-gridline last:border-0">
                    <td className="px-2 py-1.5 align-top">
                      <div className="text-[12px] text-mf-text-1">{o.title}</div>
                      <div className="mf-mono text-[10px] text-mf-text-2">
                        {citation(o.contractClause, o.sourcePage)}
                      </div>
                    </td>
                    <td className="mf-mono px-2 py-1.5 text-right align-top text-[11px] whitespace-nowrap">
                      {formatDate(o.dueOn)}
                      {overdueDays > 0 && (
                        <div className="text-mf-critical">+{overdueDays}d</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <StatusBadge status={o.status} />
                      <EscalationDots level={o.escalationLevel} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 2 — AI Insights */}
      <div className="mf-panel">
        <div className="mf-panel-header">
          <span className="mf-panel-title">AI Insights</span>
        </div>
        {sortedInsights.length === 0 ? (
          <div className="p-4 text-mf-text-2">
            No insights yet — upload tender documents to begin.
          </div>
        ) : (
          <div>
            {sortedInsights.map((ins) => (
              <div
                key={ins.id}
                className="flex items-start gap-2 border-b border-mf-gridline px-2 py-1.5 last:border-0"
              >
                <span
                  className="mt-0.5 h-8 w-0.5 shrink-0"
                  style={{ background: severityColor(ins.severity) }}
                />
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-mf-text-1">
                    {ins.title}
                  </div>
                  <div className="truncate text-[11px] text-mf-text-2">{ins.body}</div>
                </div>
                <div className="mf-mono ml-auto shrink-0 text-[10px] text-mf-text-2">
                  {citation(null, ins.sourcePage)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row 3 — Schedule (engine arrives in milestone 3, views in milestone 5) */}
      <div className="mf-panel">
        <div className="mf-panel-header">
          <span className="mf-panel-title">Schedule</span>
        </div>
        <div className="p-4 text-mf-text-2">
          Gantt, PERT network, and activity table arrive in milestone 5.{" "}
          <Link href={`/projects/${id}/documents`} className="text-mf-accent">
            Documents
          </Link>
        </div>
      </div>
    </div>
  );
}

function ChecklistPanel({
  title,
  items,
}: {
  projectId: string;
  title: string;
  items: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: Date | null;
    ownerRole: string | null;
    sourceClause: string | null;
    sourcePage: number | null;
  }>;
}) {
  const done = items.filter((i) => i.status === "DONE" || i.status === "NA").length;
  return (
    <div className="mf-panel">
      <div className="mf-panel-header">
        <span className="mf-panel-title">{title}</span>
        <span className="mf-mono ml-auto text-[10px] text-mf-text-2">
          {done} / {items.length}
        </span>
        <div className="h-1 w-16 bg-mf-gridline">
          <div
            className="h-1 bg-mf-done"
            style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
          />
        </div>
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-mf-gridline last:border-0">
              <td className="w-24 px-2 py-1.5 align-top">
                <StatusBadge status={it.status} />
              </td>
              <td className="px-2 py-1.5 align-top">
                <div className="text-[12px] text-mf-text-1">{it.title}</div>
                <div className="mf-mono text-[10px] text-mf-text-2">
                  {citation(it.sourceClause, it.sourcePage)}
                </div>
              </td>
              <td className="mf-mono px-2 py-1.5 text-right align-top text-[11px] whitespace-nowrap">
                {formatDate(it.dueDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EscalationDots({ level }: { level: number }) {
  if (level <= 0) return null;
  return (
    <span className="mt-1 flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block size-1.5"
          style={{
            background: i < level ? "var(--mf-critical)" : "var(--mf-gridline)",
          }}
        />
      ))}
    </span>
  );
}
