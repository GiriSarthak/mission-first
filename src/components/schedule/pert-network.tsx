"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { layoutNetwork, type EngineLink, type ScheduleResult } from "@/lib/schedule/engine";
import type { ActivityState } from "@/components/schedule/types";

const NODE_W = 132;
const NODE_H = 58;
const GAP_X = 56;
const GAP_Y = 20;

export function PertNetwork({
  activities,
  links,
  result,
}: {
  activities: ActivityState[];
  links: EngineLink[];
  result: Extract<ScheduleResult, { ok: true }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ tx: 20, ty: 20, k: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const layout = useMemo(() => layoutNetwork(activities, links), [activities, links]);
  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const n of layout.nodes) {
      m.set(n.id, {
        x: n.layer * (NODE_W + GAP_X),
        y: n.row * (NODE_H + GAP_Y),
      });
    }
    return m;
  }, [layout]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        const k = Math.min(2.5, Math.max(0.3, v.k * (e.deltaY < 0 ? 1.1 : 0.9)));
        return { ...v, k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const byId = new Map(activities.map((a) => [a.id, a]));

  return (
    <div
      ref={containerRef}
      className="relative h-[440px] cursor-grab overflow-hidden select-none active:cursor-grabbing"
      onMouseDown={(e) => {
        drag.current = { x: e.clientX - view.tx, y: e.clientY - view.ty };
      }}
      onMouseMove={(e) => {
        if (!drag.current) return;
        setView((v) => ({
          ...v,
          tx: e.clientX - drag.current!.x,
          ty: e.clientY - drag.current!.y,
        }));
      }}
      onMouseUp={() => (drag.current = null)}
      onMouseLeave={() => (drag.current = null)}
    >
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        {(["−", "+"] as const).map((sym) => (
          <button
            key={sym}
            type="button"
            onClick={() =>
              setView((v) => ({
                ...v,
                k: Math.min(2.5, Math.max(0.3, v.k * (sym === "+" ? 1.2 : 0.8))),
              }))
            }
            className="size-5 border border-mf-border bg-white text-[12px] leading-none text-mf-text-2 hover:bg-mf-surface-1"
          >
            {sym}
          </button>
        ))}
      </div>
      <svg className="h-full w-full">
        <defs>
          <marker
            id="pert-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#5b6472" />
          </marker>
          <marker
            id="pert-arrow-crit"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#c0392b" />
          </marker>
        </defs>
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
          {links.map((l, i) => {
            const p = pos.get(l.predecessorId);
            const s = pos.get(l.successorId);
            const ps = result.byId.get(l.predecessorId);
            const ss = result.byId.get(l.successorId);
            if (!p || !s || !ps || !ss) return null;
            const critical = ps.isCritical && ss.isCritical;
            const x1 = p.x + NODE_W;
            const y1 = p.y + NODE_H / 2;
            const x2 = s.x;
            const y2 = s.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={critical ? "#c0392b" : "#5b6472"}
                strokeWidth={critical ? 1.5 : 1}
                markerEnd={critical ? "url(#pert-arrow-crit)" : "url(#pert-arrow)"}
                opacity={critical ? 1 : 0.7}
              />
            );
          })}
          {layout.nodes.map((n) => {
            const a = byId.get(n.id);
            const s = result.byId.get(n.id);
            const p = pos.get(n.id);
            if (!a || !s || !p) return null;
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  fill="#ffffff"
                  stroke={s.isCritical ? "#c0392b" : "#d0d4da"}
                  strokeWidth={s.isCritical ? 1.5 : 1}
                />
                {/* ES / EF strip */}
                <text x={4} y={11} fontSize={8} fontFamily="var(--font-mono)" fill="#5b6472">
                  ES {Math.round(s.es)}
                </text>
                <text
                  x={NODE_W - 4}
                  y={11}
                  fontSize={8}
                  fontFamily="var(--font-mono)"
                  fill="#5b6472"
                  textAnchor="end"
                >
                  EF {Math.round(s.ef)}
                </text>
                <line x1={0} y1={15} x2={NODE_W} y2={15} stroke="#e9ebef" />
                <text x={4} y={27} fontSize={9} fontFamily="var(--font-mono)" fill="#1f2430" fontWeight="bold">
                  {a.code}
                </text>
                <text x={4} y={38} fontSize={8} fill="#1f2430">
                  {a.name.length > 30 ? `${a.name.slice(0, 29)}…` : a.name}
                </text>
                <line x1={0} y1={43} x2={NODE_W} y2={43} stroke="#e9ebef" />
                <text x={4} y={54} fontSize={8} fontFamily="var(--font-mono)" fill="#5b6472">
                  LS {Math.round(s.ls)}
                </text>
                <text
                  x={NODE_W / 2}
                  y={54}
                  fontSize={8}
                  fontFamily="var(--font-mono)"
                  fill={s.totalFloat <= 0 && !s.isComplete ? "#c0392b" : "#5b6472"}
                  textAnchor="middle"
                >
                  TF {Math.round(s.totalFloat)}
                </text>
                <text
                  x={NODE_W - 4}
                  y={54}
                  fontSize={8}
                  fontFamily="var(--font-mono)"
                  fill="#5b6472"
                  textAnchor="end"
                >
                  LF {Math.round(s.lf)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
