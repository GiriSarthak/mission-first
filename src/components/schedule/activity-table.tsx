"use client";

import { useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActivityState, LinkState } from "@/components/schedule/types";
import type { LinkType, ScheduleResult } from "@/lib/schedule/engine";
import type { ActivityPatch } from "@/lib/actions/activities";
import { LINK_TYPES } from "@/lib/enums";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const MS_PER_DAY = 86_400_000;

export function ActivityTable({
  activities,
  links,
  result,
  projectStart,
  onPatch,
  onAdd,
  onRemove,
  onAddLink,
  onRemoveLink,
}: {
  activities: ActivityState[];
  links: LinkState[];
  result: Extract<ScheduleResult, { ok: true }>;
  projectStart: Date;
  onPatch: (id: string, patch: ActivityPatch) => void;
  onAdd: (code: string, name: string, mostLikely: number) => Promise<void>;
  onRemove: (id: string) => void;
  onAddLink: (
    predecessorId: string,
    successorId: string,
    type: LinkType,
    lagDays: number
  ) => Promise<void>;
  onRemoveLink: (id: string) => void;
}) {
  const [linksFor, setLinksFor] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newDur, setNewDur] = useState("10");

  const codeById = new Map(activities.map((a) => [a.id, a.code]));
  const linkTarget = activities.find((a) => a.id === linksFor);

  return (
    <div className="max-h-[440px] overflow-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-[#fafbfc]">
          <tr className="h-7 border-b border-mf-border text-[10px] uppercase tracking-wide text-mf-text-2">
            <th className="w-12 px-2 text-left font-medium">ID</th>
            <th className="min-w-40 px-2 text-left font-medium">Activity</th>
            <th className="w-11 px-1 text-right font-medium" title="Optimistic (days)">O</th>
            <th className="w-11 px-1 text-right font-medium" title="Most likely (days)">M</th>
            <th className="w-11 px-1 text-right font-medium" title="Pessimistic (days)">P</th>
            <th className="w-11 px-1 text-right font-medium">%</th>
            <th className="w-24 px-1 text-right font-medium">Actual start</th>
            <th className="w-24 px-1 text-right font-medium">Actual finish</th>
            <th className="w-12 px-1 text-right font-medium" title="Remaining days">Rem</th>
            <th className="w-16 px-1 text-right font-medium">ES</th>
            <th className="w-16 px-1 text-right font-medium">EF</th>
            <th className="w-11 px-1 text-right font-medium">Float</th>
            <th className="min-w-24 px-2 text-left font-medium">Predecessors</th>
            <th className="w-7"></th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => {
            const s = result.byId.get(a.id);
            const preds = links.filter((l) => l.successorId === a.id);
            return (
              <tr key={a.id} className="h-[26px] border-b border-mf-gridline text-[11px] hover:bg-[#f8f9fb]">
                <td className="mf-mono px-2 text-mf-text-2">{a.code}</td>
                <td className="px-2 text-mf-text-1">{a.name}</td>
                <NumCell value={a.optimistic} nullable onCommit={(v) => onPatch(a.id, { optimistic: v })} />
                <NumCell value={a.mostLikely} onCommit={(v) => onPatch(a.id, { mostLikely: v ?? 1 })} />
                <NumCell value={a.pessimistic} nullable onCommit={(v) => onPatch(a.id, { pessimistic: v })} />
                <NumCell
                  value={a.percentComplete}
                  onCommit={(v) => onPatch(a.id, { percentComplete: Math.max(0, Math.min(100, v ?? 0)) })}
                />
                <DateCell value={a.actualStart} onCommit={(v) => onPatch(a.id, { actualStart: v })} />
                <DateCell value={a.actualFinish} onCommit={(v) => onPatch(a.id, { actualFinish: v })} />
                <NumCell value={a.remainingDays} nullable onCommit={(v) => onPatch(a.id, { remainingDays: v })} />
                <td className="mf-mono px-1 text-right whitespace-nowrap text-mf-text-2">
                  {s ? formatDate(new Date(projectStart.getTime() + s.es * MS_PER_DAY)) : "—"}
                </td>
                <td className="mf-mono px-1 text-right whitespace-nowrap text-mf-text-2">
                  {s ? formatDate(new Date(projectStart.getTime() + s.ef * MS_PER_DAY)) : "—"}
                </td>
                <td
                  className={cn(
                    "mf-mono px-1 text-right",
                    s && s.totalFloat <= 0 && !s.isComplete ? "text-mf-critical" : "text-mf-text-2"
                  )}
                >
                  {s ? Math.round(s.totalFloat) : "—"}
                </td>
                <td className="px-2">
                  <button
                    type="button"
                    onClick={() => setLinksFor(a.id)}
                    className="mf-mono flex items-center gap-1 text-[10px] text-mf-accent hover:underline"
                    title="Edit predecessors"
                  >
                    <Link2 className="size-3" />
                    {preds.length
                      ? preds
                          .map(
                            (l) =>
                              `${codeById.get(l.predecessorId) ?? "?"} ${l.type}${
                                l.lagDays ? `${l.lagDays > 0 ? "+" : ""}${l.lagDays}` : ""
                              }`
                          )
                          .join(", ")
                      : "add"}
                  </button>
                </td>
                <td className="px-1 text-center">
                  <button
                    type="button"
                    title="Remove activity"
                    onClick={() => {
                      if (confirm(`Remove activity ${a.code} and its links?`)) onRemove(a.id);
                    }}
                    className="text-mf-text-2 hover:text-mf-critical"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </td>
              </tr>
            );
          })}
          {/* add row */}
          <tr className="h-[28px] text-[11px]">
            <td className="px-2">
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Code"
                className="mf-mono h-6 w-11 border border-mf-border bg-white px-1 text-[10px] outline-none focus:border-mf-accent"
              />
            </td>
            <td className="px-2" colSpan={2}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New activity name…"
                className="h-6 w-full border border-mf-border bg-white px-1.5 text-[11px] outline-none focus:border-mf-accent"
              />
            </td>
            <td className="px-1">
              <input
                value={newDur}
                onChange={(e) => setNewDur(e.target.value)}
                className="mf-mono h-6 w-10 border border-mf-border bg-white px-1 text-right text-[10px] outline-none focus:border-mf-accent"
                title="Most-likely duration (days)"
              />
            </td>
            <td colSpan={10} className="px-1">
              <button
                type="button"
                onClick={async () => {
                  const dur = Number(newDur) || 10;
                  if (!newCode.trim() || !newName.trim()) return;
                  await onAdd(newCode.trim(), newName.trim(), dur);
                  setNewCode("");
                  setNewName("");
                }}
                className="flex items-center gap-1 border border-mf-border bg-white px-1.5 py-0.5 text-[10px] text-mf-text-2 hover:bg-mf-surface-1"
              >
                <Plus className="size-3" /> Add activity
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      {/* predecessors dialog */}
      <Dialog open={linksFor != null} onOpenChange={(o) => !o && setLinksFor(null)}>
        <DialogContent className="max-w-sm rounded-[2px] p-0">
          <DialogHeader className="border-b border-mf-border px-3 py-2">
            <DialogTitle className="mf-heading text-mf-text-1">
              Predecessors — {linkTarget?.code} {linkTarget?.name}
            </DialogTitle>
          </DialogHeader>
          {linkTarget && (
            <LinkEditor
              target={linkTarget}
              activities={activities}
              links={links.filter((l) => l.successorId === linkTarget.id)}
              codeById={codeById}
              onAddLink={onAddLink}
              onRemoveLink={onRemoveLink}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LinkEditor({
  target,
  activities,
  links,
  codeById,
  onAddLink,
  onRemoveLink,
}: {
  target: ActivityState;
  activities: ActivityState[];
  links: LinkState[];
  codeById: Map<string, string>;
  onAddLink: (
    predecessorId: string,
    successorId: string,
    type: LinkType,
    lagDays: number
  ) => Promise<void>;
  onRemoveLink: (id: string) => void;
}) {
  const candidates = activities.filter((a) => a.id !== target.id);
  const [predId, setPredId] = useState(candidates[0]?.id ?? "");
  const [type, setType] = useState<LinkType>("FS");
  const [lag, setLag] = useState("0");

  return (
    <div className="p-3">
      {links.length === 0 ? (
        <div className="pb-2 text-[11px] text-mf-text-2">No predecessors.</div>
      ) : (
        <table className="mb-2 w-full border-collapse">
          <tbody>
            {links.map((l) => (
              <tr key={l.id} className="h-6 border-b border-mf-gridline text-[11px]">
                <td className="mf-mono">{codeById.get(l.predecessorId)}</td>
                <td className="mf-mono text-mf-text-2">{l.type}</td>
                <td className="mf-mono text-right text-mf-text-2">
                  {l.lagDays ? `${l.lagDays > 0 ? "+" : ""}${l.lagDays}d` : "0d"}
                </td>
                <td className="w-6 text-right">
                  <button
                    type="button"
                    onClick={() => onRemoveLink(l.id)}
                    className="text-mf-text-2 hover:text-mf-critical"
                    title="Remove link"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex items-center gap-1">
        <select
          value={predId}
          onChange={(e) => setPredId(e.target.value)}
          className="h-6 min-w-0 flex-1 border border-mf-border bg-white px-1 text-[11px] outline-none focus:border-mf-accent"
        >
          {candidates.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as LinkType)}
          className="mf-mono h-6 border border-mf-border bg-white px-1 text-[10px] outline-none focus:border-mf-accent"
        >
          {LINK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={lag}
          onChange={(e) => setLag(e.target.value)}
          className="mf-mono h-6 w-10 border border-mf-border bg-white px-1 text-right text-[10px] outline-none focus:border-mf-accent"
          title="Lag (days)"
        />
        <button
          type="button"
          onClick={() => predId && onAddLink(predId, target.id, type, Number(lag) || 0)}
          className="flex h-6 items-center gap-1 border border-mf-border bg-white px-1.5 text-[10px] text-mf-text-2 hover:bg-mf-surface-1"
        >
          <Plus className="size-3" /> Add
        </button>
      </div>
    </div>
  );
}

function NumCell({
  value,
  nullable,
  onCommit,
}: {
  value: number | null;
  nullable?: boolean;
  onCommit: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value));
  const commit = () => {
    if (draft == null) return;
    const trimmed = draft.trim();
    if (trimmed === "" && nullable) onCommit(null);
    else {
      const n = Number(trimmed);
      if (!Number.isNaN(n)) onCommit(n);
    }
    setDraft(null);
  };
  return (
    <td className="px-1 text-right">
      <input
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="mf-mono h-5 w-full min-w-8 border border-transparent bg-transparent px-0.5 text-right text-[11px] outline-none hover:border-mf-border focus:border-mf-accent focus:bg-white"
      />
    </td>
  );
}

function DateCell({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (iso: string | null) => void;
}) {
  const dateStr = value ? value.slice(0, 10) : "";
  return (
    <td className="px-1 text-right">
      <input
        type="date"
        value={dateStr}
        onChange={(e) => {
          const v = e.target.value;
          onCommit(v ? new Date(`${v}T00:00:00`).toISOString() : null);
        }}
        className="mf-mono h-5 w-full border border-transparent bg-transparent px-0.5 text-right text-[10px] text-mf-text-2 outline-none hover:border-mf-border focus:border-mf-accent focus:bg-white"
      />
    </td>
  );
}
