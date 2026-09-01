"use client";

import { useMemo, useState, useTransition } from "react";
import {
  computeSchedule,
  finishProbability,
  offsetToDate,
  type EngineLink,
  type LinkType,
  type ScheduleResult,
} from "@/lib/schedule/engine";
import type { ActivityState, LinkState } from "@/components/schedule/types";
import {
  createActivity,
  createLink,
  deleteActivity,
  deleteLink,
  updateActivity,
  type ActivityPatch,
} from "@/lib/actions/activities";
import { ActivityTable } from "@/components/schedule/activity-table";
import { Gantt } from "@/components/schedule/gantt";
import { PertNetwork } from "@/components/schedule/pert-network";
import { formatDate, addDays } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "GANTT" | "PERT" | "TABLE";

export function SchedulePanel({
  projectId,
  contractStart,
  contractDurationDays,
  initialActivities,
  initialLinks,
  canEdit,
}: {
  projectId: string;
  contractStart: string | null;
  contractDurationDays: number | null;
  initialActivities: ActivityState[];
  initialLinks: LinkState[];
  /** agency roles view the schedule but cannot edit it */
  canEdit: boolean;
}) {
  const [activities, setActivities] = useState(initialActivities);
  const [links, setLinks] = useState(initialLinks);
  const [tab, setTab] = useState<Tab>("GANTT");
  const [, startTransition] = useTransition();

  const projectStart = useMemo(
    () => (contractStart ? new Date(contractStart) : new Date()),
    [contractStart]
  );
  const dataDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const engineLinks: EngineLink[] = useMemo(
    () =>
      links.map((l) => ({
        predecessorId: l.predecessorId,
        successorId: l.successorId,
        type: l.type as LinkType,
        lagDays: l.lagDays,
      })),
    [links]
  );

  const result: ScheduleResult = useMemo(
    () =>
      computeSchedule(
        activities.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          optimistic: a.optimistic,
          mostLikely: a.mostLikely,
          pessimistic: a.pessimistic,
          actualStart: a.actualStart ? new Date(a.actualStart) : null,
          actualFinish: a.actualFinish ? new Date(a.actualFinish) : null,
          percentComplete: a.percentComplete,
          remainingDays: a.remainingDays,
        })),
        engineLinks,
        projectStart,
        dataDate
      ),
    [activities, engineLinks, projectStart, dataDate]
  );

  const contractFinishOffset =
    contractDurationDays != null ? contractDurationDays : null;
  const contractFinishDate =
    contractFinishOffset != null ? addDays(projectStart, contractFinishOffset) : null;

  const stats = result.ok
    ? {
        projectFinishDate: offsetToDate(result.projectFinish, projectStart),
        varianceDays:
          contractFinishOffset != null
            ? contractFinishOffset - result.projectFinish
            : null,
        pOnTime:
          contractFinishOffset != null
            ? finishProbability(
                result.criticalVariances,
                result.projectFinish,
                contractFinishOffset
              )
            : null,
      }
    : null;

  // ---- mutators: optimistic local update + persisted server action ----
  function patchLocal(id: string, patch: ActivityPatch) {
    setActivities((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              ...(patch.name !== undefined && { name: patch.name }),
              ...(patch.optimistic !== undefined && { optimistic: patch.optimistic }),
              ...(patch.mostLikely !== undefined && { mostLikely: patch.mostLikely }),
              ...(patch.pessimistic !== undefined && { pessimistic: patch.pessimistic }),
              ...(patch.percentComplete !== undefined && {
                percentComplete: patch.percentComplete,
              }),
              ...(patch.actualStart !== undefined && { actualStart: patch.actualStart }),
              ...(patch.actualFinish !== undefined && { actualFinish: patch.actualFinish }),
              ...(patch.remainingDays !== undefined && { remainingDays: patch.remainingDays }),
            }
          : a
      )
    );
  }

  function onPatchActivity(id: string, patch: ActivityPatch) {
    patchLocal(id, patch);
    startTransition(() => updateActivity(id, patch));
  }

  async function onAddActivity(code: string, name: string, mostLikely: number) {
    const res = await createActivity(projectId, { code, name, mostLikely });
    if ("error" in res) {
      alert(res.error);
      return;
    }
    setActivities((prev) => [
      ...prev,
      {
        id: res.id,
        code,
        name,
        wbsPath: null,
        optimistic: null,
        mostLikely,
        pessimistic: null,
        actualStart: null,
        actualFinish: null,
        percentComplete: 0,
        remainingDays: null,
      },
    ]);
  }

  function onRemoveActivity(id: string) {
    setActivities((prev) => prev.filter((a) => a.id !== id));
    setLinks((prev) =>
      prev.filter((l) => l.predecessorId !== id && l.successorId !== id)
    );
    startTransition(() => deleteActivity(id));
  }

  async function onAddLink(
    predecessorId: string,
    successorId: string,
    type: LinkType,
    lagDays: number
  ) {
    const res = await createLink(predecessorId, successorId, type, lagDays);
    if ("error" in res) {
      alert(res.error);
      return;
    }
    setLinks((prev) => [
      ...prev,
      { id: res.id, predecessorId, successorId, type, lagDays },
    ]);
  }

  function onRemoveLink(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    startTransition(() => deleteLink(id));
  }

  const ordered = useMemo(
    () => [...activities].sort((a, b) => a.code.localeCompare(b.code)),
    [activities]
  );

  return (
    <div className="mf-panel">
      <div className="mf-panel-header">
        <span className="mf-panel-title">Schedule</span>
        <div className="ml-6 flex items-center gap-5">
          <Stat label="Project finish" value={stats ? formatDate(stats.projectFinishDate) : "—"} />
          <Stat label="Contract finish" value={formatDate(contractFinishDate)} />
          <Stat
            label="Variance (days)"
            value={
              stats?.varianceDays != null
                ? `${stats.varianceDays >= 0 ? "+" : ""}${Math.round(stats.varianceDays)}`
                : "—"
            }
            tone={
              stats?.varianceDays != null
                ? stats.varianceDays < 0
                  ? "bad"
                  : "good"
                : undefined
            }
          />
          <Stat
            label="P(on-time)"
            value={stats?.pOnTime != null ? `${Math.round(stats.pOnTime * 100)}%` : "—"}
            tone={
              stats?.pOnTime != null
                ? stats.pOnTime < 0.5
                  ? "bad"
                  : stats.pOnTime < 0.8
                    ? "warn"
                    : "good"
                : undefined
            }
          />
        </div>
        <div className="ml-auto flex">
          {(
            [
              ["GANTT", "Gantt"],
              ["PERT", "PERT Network"],
              ["TABLE", "Activity Table"],
            ] as Array<[Tab, string]>
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 px-2 py-1 text-[11px] transition-colors duration-100",
                tab === t
                  ? "border-mf-accent font-medium text-mf-text-1"
                  : "border-transparent text-mf-text-2 hover:text-mf-text-1"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!result.ok ? (
        <div className="border-l-2 border-mf-critical p-3 text-[12px] text-mf-critical">
          Cycle detected in the activity network:{" "}
          <span className="mf-mono">{result.error.activityCodes.join(" → ")}</span>. Remove
          one of the links to restore the schedule.
        </div>
      ) : tab === "GANTT" ? (
        <Gantt
          activities={ordered}
          links={links}
          result={result}
          projectStart={projectStart}
          dataDate={dataDate}
          contractFinishDate={contractFinishDate}
        />
      ) : tab === "PERT" ? (
        <PertNetwork activities={ordered} links={engineLinks} result={result} />
      ) : (
        <ActivityTable
          activities={ordered}
          links={links}
          result={result}
          projectStart={projectStart}
          canEdit={canEdit}
          onPatch={onPatchActivity}
          onAdd={onAddActivity}
          onRemove={onRemoveActivity}
          onAddLink={onAddLink}
          onRemoveLink={onRemoveLink}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[10px] text-mf-text-2 uppercase tracking-wide">{label}</span>
      <span
        className={cn(
          "mf-mono text-[11px] font-medium",
          tone === "bad" && "text-mf-critical",
          tone === "warn" && "text-mf-warning",
          tone === "good" && "text-mf-done"
        )}
      >
        {value}
      </span>
    </span>
  );
}
