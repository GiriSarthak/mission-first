"use client";

import { useMemo, useTransition } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { OBLIGATION_STATUSES, type ObligationStatus } from "@/lib/enums";
import { setEscalationLevel, updateObligationStatus } from "@/lib/actions/obligations";
import { citation } from "@/components/status";
import { StatusSelect } from "@/components/dashboard/status-select";
import { formatDate } from "@/lib/format";

export type ObligationRow = {
  id: string;
  title: string;
  contractClause: string | null;
  sourcePage: number | null;
  sourceDocumentId: string | null;
  dueOn: string | null;
  receivedOn: string | null;
  status: string;
  escalationLevel: number;
};

export function ObligationsPanel({
  projectId,
  obligations,
  onDraftLetter,
}: {
  projectId: string;
  obligations: ObligationRow[];
  onDraftLetter?: (obligationId: string) => void;
}) {
  const [, startTransition] = useTransition();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const received = obligations.filter((o) => o.status === "RECEIVED").length;

  return (
    <div className="mf-panel">
      <div className="mf-panel-header">
        <span className="mf-panel-title">Deliverables from Agency</span>
        <span className="mf-mono ml-auto text-[10px] text-mf-text-2">
          {received}/{obligations.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <tbody>
            {obligations.map((o) => {
              const overdueDays =
                o.dueOn && !o.receivedOn
                  ? Math.round((today.getTime() - new Date(o.dueOn).setHours(0, 0, 0, 0)) / 86_400_000)
                  : 0;
              return (
                <tr key={o.id} className="border-b border-mf-gridline hover:bg-[#f8f9fb]">
                  <td className="px-2 py-1 align-top">
                    <div className="text-[12px] leading-4 text-mf-text-1">{o.title}</div>
                    {citation(o.contractClause, o.sourcePage) &&
                      (o.sourceDocumentId ? (
                        <Link
                          href={`/projects/${projectId}/documents?doc=${o.sourceDocumentId}&page=${o.sourcePage ?? 1}`}
                          className="mf-mono text-[10px] text-mf-accent hover:underline"
                        >
                          {citation(o.contractClause, o.sourcePage)}
                        </Link>
                      ) : (
                        <span className="mf-mono text-[10px] text-mf-text-2">
                          {citation(o.contractClause, o.sourcePage)}
                        </span>
                      ))}
                  </td>
                  <td className="mf-mono w-16 px-2 py-1 text-right align-top text-[11px] whitespace-nowrap text-mf-text-2">
                    {formatDate(o.dueOn)}
                    {overdueDays > 0 && (
                      <div className="font-medium text-mf-critical">+{overdueDays}d</div>
                    )}
                  </td>
                  <td className="w-25 px-2 py-1 align-top">
                    <StatusSelect
                      value={o.status}
                      options={OBLIGATION_STATUSES}
                      onChange={(s) =>
                        startTransition(() =>
                          updateObligationStatus(o.id, s as ObligationStatus)
                        )
                      }
                    />
                    <div className="mt-1 flex items-center gap-1">
                      <EscalationSquares
                        level={o.escalationLevel}
                        onSet={(lvl) =>
                          startTransition(() => setEscalationLevel(o.id, lvl))
                        }
                      />
                      <button
                        type="button"
                        title={
                          onDraftLetter
                            ? "Draft escalation letter"
                            : "Draft escalation letter (available in milestone 9)"
                        }
                        disabled={!onDraftLetter}
                        onClick={() => onDraftLetter?.(o.id)}
                        className="ml-1 text-mf-text-2 hover:text-mf-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Mail className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EscalationSquares({
  level,
  onSet,
}: {
  level: number;
  onSet: (level: number) => void;
}) {
  return (
    <span className="flex gap-0.5" title={`Escalation level ${level} of 3 — click to set`}>
      {[1, 2, 3].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSet(i === level ? i - 1 : i)}
          className="inline-block size-2 border border-mf-border"
          style={{ background: i <= level ? "var(--mf-critical)" : "transparent" }}
        />
      ))}
    </span>
  );
}
