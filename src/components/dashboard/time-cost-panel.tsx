"use client";

import { useMemo } from "react";
import { scaleLinear, scaleTime, line as d3line, extent } from "d3";
import { formatInr } from "@/lib/analysis/delayCost";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TimeCostStats = {
  delayDays: number;
  contractFinishDate: string | null;
  forecastFinishDate: string | null;
  ldExposure: number;
  ldCapReached: boolean;
  ldCapAmount: number;
  agencyAttributableDays: number;
  vendorAttributableDays: number;
  agencyAttributablePct: number;
  drivers: Array<{ obligationId: string; title: string; attributedDays: number }>;
};

export type SnapshotPoint = {
  capturedAt: string;
  delayDays: number;
  ldExposure: number;
};

export function TimeCostPanel({
  stats,
  history,
}: {
  stats: TimeCostStats;
  history: SnapshotPoint[];
}) {
  const vendorPct = 100 - stats.agencyAttributablePct;

  return (
    <div className="mf-panel">
      <div className="mf-panel-header">
        <span className="mf-panel-title">Time &amp; Cost Exposure</span>
        <span className="mf-mono ml-auto text-[10px] text-mf-text-2">
          contract {formatDate(stats.contractFinishDate)} · forecast{" "}
          {formatDate(stats.forecastFinishDate)}
        </span>
      </div>
      <div className="flex min-h-0">
        {/* Left third — stat block */}
        <div className="w-1/3 min-w-64 border-r border-mf-border p-3">
          <div className="grid gap-3">
            <Stat
              label="Delay"
              value={stats.delayDays === 0 ? "On schedule" : `${stats.delayDays} days`}
              tone={stats.delayDays > 0 ? "bad" : "good"}
            />
            <Stat
              label="LD exposure"
              value={formatInr(stats.ldExposure)}
              tone={stats.ldCapReached ? "bad" : stats.ldExposure > 0 ? "warn" : "good"}
              note={
                stats.ldCapReached
                  ? `at cap — ${formatInr(stats.ldCapAmount)}`
                  : stats.ldCapAmount > 0
                    ? `cap ${formatInr(stats.ldCapAmount)}`
                    : undefined
              }
            />
          </div>

          {/* Attribution — allocation, not blame: steel blue / amber, never red */}
          <div className="mt-3">
            <div className="mf-heading mb-1 text-mf-text-2">Delay attribution</div>
            {stats.delayDays === 0 ? (
              <div className="text-[11px] text-mf-text-2">
                No delay to attribute.
              </div>
            ) : (
              <>
                <div className="flex h-2.5 w-full overflow-hidden border border-mf-border">
                  <div
                    className="h-full"
                    style={{
                      width: `${stats.agencyAttributablePct}%`,
                      background: "var(--mf-warning)",
                    }}
                    title={`Agency-attributable: ${stats.agencyAttributableDays} days`}
                  />
                  <div
                    className="h-full"
                    style={{
                      width: `${vendorPct}%`,
                      background: "var(--mf-accent)",
                    }}
                    title={`Vendor-attributable: ${stats.vendorAttributableDays} days`}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1 text-mf-text-2">
                    <span
                      className="inline-block size-2"
                      style={{ background: "var(--mf-warning)" }}
                    />
                    Agency{" "}
                    <span className="mf-mono text-mf-text-1">
                      {Math.round(stats.agencyAttributablePct)}%
                    </span>{" "}
                    ({stats.agencyAttributableDays}d)
                  </span>
                  <span className="flex items-center gap-1 text-mf-text-2">
                    <span
                      className="inline-block size-2"
                      style={{ background: "var(--mf-accent)" }}
                    />
                    Vendor{" "}
                    <span className="mf-mono text-mf-text-1">
                      {Math.round(vendorPct)}%
                    </span>{" "}
                    ({stats.vendorAttributableDays}d)
                  </span>
                </div>
                {stats.drivers.length > 0 && (
                  <div className="mt-2 border-t border-mf-gridline pt-1.5">
                    <div className="mf-heading mb-1 text-mf-text-2">
                      Agency-side drivers
                    </div>
                    {stats.drivers.map((d) => (
                      <div
                        key={d.obligationId}
                        className="flex items-baseline gap-2 text-[11px]"
                      >
                        <span className="min-w-0 flex-1 truncate text-mf-text-1">
                          {d.title}
                        </span>
                        <span className="mf-mono shrink-0 text-mf-text-2">
                          {d.attributedDays}d
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right two-thirds — trend */}
        <div className="min-w-0 flex-1 p-3">
          <TrendChart history={history} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
  note?: string;
}) {
  return (
    <div>
      <div className="mf-heading text-mf-text-2">{label}</div>
      <div
        className={cn(
          "mf-mono text-[18px] leading-6 font-medium",
          tone === "bad" && "text-mf-critical",
          tone === "warn" && "text-mf-warning",
          tone === "good" && "text-mf-text-1",
          !tone && "text-mf-text-1"
        )}
      >
        {value}
      </div>
      {note && <div className="mf-mono text-[10px] text-mf-text-2">{note}</div>}
    </div>
  );
}

const W = 720;
const H = 168;
const M = { top: 10, right: 52, bottom: 20, left: 34 };

/**
 * Two series on a dual axis: delay days (left, steel blue) and LD exposure
 * (right, amber). Same gridline/label treatment as the Gantt — d3 for scales
 * only, the drawing is ours.
 */
function TrendChart({ history }: { history: SnapshotPoint[] }) {
  const points = useMemo(
    () =>
      history
        .map((h) => ({
          date: new Date(h.capturedAt),
          delayDays: h.delayDays,
          ldExposure: h.ldExposure,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [history]
  );

  if (points.length < 2) {
    return (
      <div className="flex h-[168px] items-center justify-center text-[11px] text-mf-text-2">
        Not enough history yet — the trend appears once the schedule has been
        recomputed a few times.
      </div>
    );
  }

  const [minDate, maxDate] = extent(points, (p) => p.date) as [Date, Date];
  const maxDelay = Math.max(1, ...points.map((p) => p.delayDays));
  const maxLd = Math.max(1, ...points.map((p) => p.ldExposure));

  const x = scaleTime().domain([minDate, maxDate]).range([M.left, W - M.right]);
  const yDelay = scaleLinear().domain([0, maxDelay * 1.15]).range([H - M.bottom, M.top]);
  const yLd = scaleLinear().domain([0, maxLd * 1.15]).range([H - M.bottom, M.top]);

  const delayLine = d3line<(typeof points)[number]>()
    .x((p) => x(p.date))
    .y((p) => yDelay(p.delayDays))(points)!;
  const ldLine = d3line<(typeof points)[number]>()
    .x((p) => x(p.date))
    .y((p) => yLd(p.ldExposure))(points)!;

  const yTicks = yDelay.ticks(4);
  const xTicks = x.ticks(6);
  const last = points[points.length - 1];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-[168px] w-full min-w-[420px]">
        {/* gridlines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={M.left}
              y1={yDelay(t)}
              x2={W - M.right}
              y2={yDelay(t)}
              stroke="#e9ebef"
            />
            <text
              x={M.left - 4}
              y={yDelay(t) + 3}
              textAnchor="end"
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill="#5b6472"
            >
              {t}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={H - M.bottom + 12}
            textAnchor="middle"
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill="#5b6472"
          >
            {formatDate(t).slice(3)}
          </text>
        ))}

        {/* right axis labels — LD exposure */}
        {yLd.ticks(4).map((t, i) => (
          <text
            key={i}
            x={W - M.right + 4}
            y={yLd(t) + 3}
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill="#b7791f"
          >
            {formatInr(t)}
          </text>
        ))}

        {/* axes */}
        <line x1={M.left} y1={M.top} x2={M.left} y2={H - M.bottom} stroke="#d0d4da" />
        <line
          x1={M.left}
          y1={H - M.bottom}
          x2={W - M.right}
          y2={H - M.bottom}
          stroke="#d0d4da"
        />

        {/* series */}
        <path d={ldLine} fill="none" stroke="var(--mf-warning)" strokeWidth={1.5} />
        <path d={delayLine} fill="none" stroke="var(--mf-accent)" strokeWidth={1.5} />
        {points.map((p, i) => (
          <rect
            key={i}
            x={x(p.date) - 1.5}
            y={yDelay(p.delayDays) - 1.5}
            width={3}
            height={3}
            fill="var(--mf-accent)"
          />
        ))}
        <rect
          x={x(last.date) - 2.5}
          y={yDelay(last.delayDays) - 2.5}
          width={5}
          height={5}
          fill="var(--mf-accent)"
        />

        {/* legend */}
        <g transform={`translate(${M.left + 4}, ${M.top + 2})`}>
          <rect width={8} height={2} y={3} fill="var(--mf-accent)" />
          <text x={12} y={6} fontSize={9} fill="#5b6472">
            Delay (days)
          </text>
          <rect width={8} height={2} x={78} y={3} fill="var(--mf-warning)" />
          <text x={90} y={6} fontSize={9} fill="#5b6472">
            LD exposure
          </text>
        </g>
      </svg>
    </div>
  );
}
