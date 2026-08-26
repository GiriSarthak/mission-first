"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CHECKLIST_STATUSES, type ChecklistStatus } from "@/lib/enums";
import { addChecklistItem, updateChecklistItemStatus } from "@/lib/actions/checklist";
import { citation } from "@/components/status";
import { StatusSelect } from "@/components/dashboard/status-select";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ChecklistItemRow = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  ownerRole: string | null;
  sourceClause: string | null;
  sourcePage: number | null;
  sourceDocumentId: string | null;
};

export type PhaseRow = { id: string; key: string; title: string };

type Filter = "ALL" | "OPEN" | "OVERDUE";

const OPEN_STATUSES = new Set(["NOT_STARTED", "IN_PROGRESS", "BLOCKED"]);

export function ChecklistPanel({
  projectId,
  title,
  phases,
  items,
}: {
  projectId: string;
  title: string;
  phases: PhaseRow[];
  items: ChecklistItemRow[];
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [newTitle, setNewTitle] = useState("");
  const [newPhaseId, setNewPhaseId] = useState(phases[0]?.id ?? "");
  const [, startTransition] = useTransition();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const isOverdue = (it: ChecklistItemRow) =>
    OPEN_STATUSES.has(it.status) && !!it.dueDate && new Date(it.dueDate) < today;

  const visible = items.filter((it) => {
    if (filter === "OPEN") return OPEN_STATUSES.has(it.status);
    if (filter === "OVERDUE") return isOverdue(it);
    return true;
  });

  const done = items.filter((i) => i.status === "DONE" || i.status === "NA").length;

  return (
    <div className="mf-panel">
      <div className="mf-panel-header">
        <span className="mf-panel-title">{title}</span>
        <div className="ml-auto flex items-center gap-2">
          <FilterChips value={filter} onChange={setFilter} />
          <span className="mf-mono text-[10px] text-mf-text-2">
            {done}/{items.length}
          </span>
          <div className="h-1 w-12 bg-mf-gridline">
            <div
              className="h-1 bg-mf-done"
              style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <tbody>
            {visible.map((it) => (
              <tr key={it.id} className="border-b border-mf-gridline hover:bg-[#f8f9fb]">
                <td className="w-25 px-2 py-1 align-top">
                  <StatusSelect
                    value={it.status}
                    options={CHECKLIST_STATUSES}
                    onChange={(s) =>
                      startTransition(() =>
                        updateChecklistItemStatus(it.id, s as ChecklistStatus)
                      )
                    }
                  />
                </td>
                <td className="px-2 py-1 align-top">
                  <div className="text-[12px] leading-4 text-mf-text-1">{it.title}</div>
                  {citation(it.sourceClause, it.sourcePage) &&
                    (it.sourceDocumentId ? (
                      <Link
                        href={`/projects/${projectId}/documents?doc=${it.sourceDocumentId}&page=${it.sourcePage ?? 1}`}
                        className="mf-mono text-[10px] text-mf-accent hover:underline"
                      >
                        {citation(it.sourceClause, it.sourcePage)}
                      </Link>
                    ) : (
                      <span className="mf-mono text-[10px] text-mf-text-2">
                        {citation(it.sourceClause, it.sourcePage)}
                      </span>
                    ))}
                </td>
                <td
                  className={cn(
                    "mf-mono w-16 px-2 py-1 text-right align-top text-[11px] whitespace-nowrap",
                    isOverdue(it) ? "text-mf-critical" : "text-mf-text-2"
                  )}
                >
                  {formatDate(it.dueDate)}
                </td>
                <td className="w-20 px-2 py-1 text-right align-top text-[11px] text-mf-text-2">
                  {it.ownerRole ?? ""}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-[11px] text-mf-text-2">
                  No items match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <form
        className="flex items-center gap-1 border-t border-mf-border px-2 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          const t = newTitle.trim();
          if (!t || !newPhaseId) return;
          setNewTitle("");
          startTransition(() => addChecklistItem(newPhaseId, t));
        }}
      >
        <Plus className="size-3.5 text-mf-text-2" />
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add item…"
          className="h-6 min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-mf-neutral"
        />
        {phases.length > 1 && (
          <select
            value={newPhaseId}
            onChange={(e) => setNewPhaseId(e.target.value)}
            className="h-6 cursor-pointer border border-mf-border bg-white px-1 text-[10px] text-mf-text-2 outline-none focus:border-mf-accent"
          >
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        )}
      </form>
    </div>
  );
}

function FilterChips({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (f: Filter) => void;
}) {
  const chips: Array<[Filter, string]> = [
    ["ALL", "All"],
    ["OPEN", "Open"],
    ["OVERDUE", "Overdue"],
  ];
  return (
    <div className="flex">
      {chips.map(([f, label]) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={cn(
            "border border-mf-border px-1.5 py-px text-[10px] transition-colors duration-100 first:rounded-l-[2px] last:rounded-r-[2px] not-first:border-l-0",
            value === f
              ? "bg-mf-accent text-white"
              : "bg-white text-mf-text-2 hover:bg-mf-surface-1"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
