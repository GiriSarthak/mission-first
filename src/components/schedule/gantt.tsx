"use client";

import { useMemo, useState } from "react";
import { timeMonth, timeMonday, timeFormat } from "d3";
import type { ActivityState, LinkState } from "@/components/schedule/types";
import type { ScheduleResult } from "@/lib/schedule/engine";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROW_H = 26;
const HEADER_H = 40;
const BAR_H = 14;
const MS_PER_DAY = 86_400_000;

const COLORS = {
  planned: "#2f5f8f",
  plannedDone: "#24486b",
  critical: "#c0392b",
  criticalDone: "#8e2a20",
  complete: "#8a94a6",
  completeDone: "#5b6472",
};

export function Gantt({
  activities,
  links,
  result,
  projectStart,
  dataDate,
  contractFinishDate,
}: {
  activities: ActivityState[];
  links: LinkState[];
  result: Extract<ScheduleResult, { ok: true }>;
  projectStart: Date;
  dataDate: Date;
  contractFinishDate: Date | null;
}) {
  const [scale, setScale] = useState<"WEEK" | "MONTH">("MONTH");
  const ppd = scale === "WEEK" ? 5 : 1.6;

  const rows = useMemo(
    () => activities.filter((a) => result.byId.has(a.id)),
    [activities, result]
  );
  const rowIndex = useMemo(
    () => new Map(rows.map((a, i) => [a.id, i])),
    [rows]
  );

  const minEs = Math.min(0, ...rows.map((a) => result.byId.get(a.id)!.es));
  const contractOffset = contractFinishDate
    ? (contractFinishDate.getTime() - projectStart.getTime()) / MS_PER_DAY
    : 0;
  const maxEf = Math.max(
    result.projectFinish,
    contractOffset,
    ...rows.map((a) => result.byId.get(a.id)!.ef)
  );
  const startDay = Math.floor(minEs) - 7;
  const endDay = Math.ceil(maxEf) + 14;
  const width = (endDay - startDay) * ppd;
  const height = rows.length * ROW_H;

  const x = (day: number) => (day - startDay) * ppd;
  const xDate = (d: Date) =>
    x((d.getTime() - projectStart.getTime()) / MS_PER_DAY);

  const rangeStart = new Date(projectStart.getTime() + startDay * MS_PER_DAY);
  const rangeEnd = new Date(projectStart.getTime() + endDay * MS_PER_DAY);
  const months = timeMonth.range(timeMonth.floor(rangeStart), rangeEnd);
  const weeks = timeMonday.range(rangeStart, rangeEnd);
  const fmtMonth = timeFormat("%b %y");
  const fmtDay = timeFormat("%d");

  const dd = xDate(dataDate);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end gap-1 border-b border-mf-gridline px-2 py-1">
        {(["WEEK", "MONTH"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScale(s)}
            className={cn(
              "border border-mf-border px-1.5 py-px text-[10px]",
              scale === s ? "bg-mf-accent text-white" : "bg-white text-mf-text-2 hover:bg-mf-surface-1"
            )}
          >
            {s === "WEEK" ? "Week" : "Month"}
          </button>
        ))}
      </div>
      <div className="flex max-h-[440px] overflow-y-auto">
        {/* Frozen left columns */}
        <table className="w-105 min-w-105 max-w-105 border-collapse self-start">
          <thead className="sticky top-0 z-10 bg-[#fafbfc]">
            <tr
              className="border-b border-mf-border text-[10px] uppercase tracking-wide text-mf-text-2"
              style={{ height: HEADER_H }}
            >
              <th className="w-11 px-2 text-left font-medium">ID</th>
              <th className="px-2 text-left font-medium">Activity</th>
              <th className="w-9 px-1 text-right font-medium">Dur</th>
              <th className="w-15 px-1 text-right font-medium">Start</th>
              <th className="w-15 px-1 text-right font-medium">Finish</th>
              <th className="w-10 px-1 text-right font-medium">Float</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const s = result.byId.get(a.id)!;
              return (
                <tr
                  key={a.id}
                  className="border-b border-mf-gridline text-[11px]"
                  style={{ height: ROW_H }}
                >
                  <td className="mf-mono px-2 text-mf-text-2">{a.code}</td>
                  <td className="truncate px-2 text-mf-text-1" style={{ maxWidth: 170 }}>
                    {a.name}
                  </td>
                  <td className="mf-mono px-1 text-right text-mf-text-2">
                    {Math.round(s.duration)}
                  </td>
                  <td className="mf-mono px-1 text-right whitespace-nowrap text-mf-text-2">
                    {formatDate(new Date(projectStart.getTime() + s.es * MS_PER_DAY))}
                  </td>
                  <td className="mf-mono px-1 text-right whitespace-nowrap text-mf-text-2">
                    {formatDate(new Date(projectStart.getTime() + s.ef * MS_PER_DAY))}
                  </td>
                  <td
                    className={cn(
                      "mf-mono px-1 text-right",
                      s.totalFloat <= 0 && !s.isComplete ? "text-mf-critical" : "text-mf-text-2"
                    )}
                  >
                    {Math.round(s.totalFloat)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Timeline */}
        <div className="min-w-0 flex-1 overflow-x-auto border-l border-mf-border">
          <svg width={width} height={HEADER_H + height} className="block">
            <defs>
              <marker
                id="dep-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#5b6472" />
              </marker>
            </defs>

            {/* header */}
            <rect x={0} y={0} width={width} height={HEADER_H} fill="#fafbfc" />
            {months.map((m, i) => (
              <g key={i}>
                <line x1={xDate(m)} y1={0} x2={xDate(m)} y2={HEADER_H + height} stroke="#e9ebef" />
                <text
                  x={xDate(m) + 3}
                  y={13}
                  className="fill-mf-text-2"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                >
                  {fmtMonth(m)}
                </text>
              </g>
            ))}
            {scale === "WEEK" &&
              weeks.map((w, i) => (
                <g key={i}>
                  <line x1={xDate(w)} y1={20} x2={xDate(w)} y2={HEADER_H + height} stroke="#e9ebef" />
                  <text
                    x={xDate(w) + 2}
                    y={33}
                    className="fill-mf-text-2"
                    fontSize={8}
                    fontFamily="var(--font-mono)"
                  >
                    {fmtDay(w)}
                  </text>
                </g>
              ))}
            <line x1={0} y1={HEADER_H} x2={width} y2={HEADER_H} stroke="#d0d4da" />

            {/* row separators */}
            {rows.map((_, i) => (
              <line
                key={i}
                x1={0}
                y1={HEADER_H + (i + 1) * ROW_H}
                x2={width}
                y2={HEADER_H + (i + 1) * ROW_H}
                stroke="#e9ebef"
              />
            ))}

            {/* dependency arrows */}
            {links.map((l) => {
              const pi = rowIndex.get(l.predecessorId);
              const si = rowIndex.get(l.successorId);
              const p = result.byId.get(l.predecessorId);
              const s = result.byId.get(l.successorId);
              if (pi == null || si == null || !p || !s) return null;
              const fromX = l.type === "SS" || l.type === "SF" ? x(p.es) : x(p.ef);
              const toX = l.type === "FF" ? x(s.ef) : x(s.es);
              const fromY = HEADER_H + pi * ROW_H + ROW_H / 2;
              const toY = HEADER_H + si * ROW_H + ROW_H / 2;
              const midX = fromX + 6;
              return (
                <path
                  key={l.id}
                  d={`M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`}
                  fill="none"
                  stroke="#5b6472"
                  strokeWidth={1}
                  markerEnd="url(#dep-arrow)"
                  opacity={0.75}
                />
              );
            })}

            {/* bars */}
            {rows.map((a, i) => {
              const s = result.byId.get(a.id)!;
              const bx = x(s.es);
              const bw = Math.max(2, (s.ef - s.es) * ppd);
              const by = HEADER_H + i * ROW_H + (ROW_H - BAR_H) / 2;
              const base = s.isComplete
                ? COLORS.complete
                : s.isCritical
                  ? COLORS.critical
                  : COLORS.planned;
              const doneShade = s.isComplete
                ? COLORS.completeDone
                : s.isCritical
                  ? COLORS.criticalDone
                  : COLORS.plannedDone;
              const doneW = (s.percentComplete / 100) * bw;
              return (
                <g key={a.id}>
                  <rect x={bx} y={by} width={bw} height={BAR_H} fill={base} />
                  {doneW > 0 && (
                    <rect x={bx} y={by} width={doneW} height={BAR_H} fill={doneShade} />
                  )}
                </g>
              );
            })}

            {/* data date */}
            <line
              x1={dd}
              y1={20}
              x2={dd}
              y2={HEADER_H + height}
              stroke="#2f5f8f"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text
              x={dd + 3}
              y={30}
              fontSize={8}
              fontFamily="var(--font-mono)"
              fill="#2f5f8f"
            >
              DD
            </text>

            {/* contract finish */}
            {contractFinishDate && (
              <line
                x1={xDate(contractFinishDate)}
                y1={20}
                x2={xDate(contractFinishDate)}
                y2={HEADER_H + height}
                stroke="#c0392b"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
