"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { formatInr } from "@/lib/analysis/delayCost";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PortfolioRow = {
  id: string;
  name: string;
  tenderRef: string;
  vendorOrgName: string;
  delayDays: number;
  ldExposure: number;
  ldCapReached: boolean;
  agencyAttributablePct: number;
  agencyAttributableDays: number;
  vendorAttributableDays: number;
  pOnTime: number | null;
  openCriticalInsights: number;
  lastActivityAt: string | null;
};

type SortKey =
  | "name"
  | "vendorOrgName"
  | "delayDays"
  | "ldExposure"
  | "pOnTime"
  | "openCriticalInsights"
  | "lastActivityAt";

export function PortfolioTable({ rows }: { rows: PortfolioRow[] }) {
  // Triage view: worst delay first by default.
  const [sortKey, setSortKey] = useState<SortKey>("delayDays");
  const [desc, setDesc] = useState(true);
  const router = useRouter();

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = -1;
      else if (bv == null) cmp = 1;
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return desc ? -cmp : cmp;
    });
    return copy;
  }, [rows, sortKey, desc]);

  function toggle(key: SortKey) {
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(key !== "name" && key !== "vendorOrgName");
    }
  }

  const columns: Array<{
    key: SortKey;
    label: string;
    align?: "right";
    width?: string;
  }> = [
    { key: "name", label: "Project" },
    { key: "vendorOrgName", label: "Vendor", width: "w-48" },
    { key: "delayDays", label: "Delay", align: "right", width: "w-20" },
    { key: "ldExposure", label: "LD exposure", align: "right", width: "w-28" },
    { key: "pOnTime", label: "P(on-time)", align: "right", width: "w-20" },
    { key: "openCriticalInsights", label: "Critical", align: "right", width: "w-16" },
    { key: "lastActivityAt", label: "Last activity", align: "right", width: "w-24" },
  ];

  return (
    <div className="p-3">
      <div className="mf-panel">
        <div className="mf-panel-header">
          <span className="mf-panel-title">Vendor Projects</span>
          <span className="ml-2 text-[10px] text-mf-text-2">
            Read-only triage — open a project to respond to requests or approve
            submissions.
          </span>
          <span className="mf-mono ml-auto text-[10px] text-mf-text-2">
            {rows.length} project{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <table className="w-full border-collapse">
          <thead className="bg-[#fafbfc]">
            <tr className="h-7 border-b border-mf-border text-[10px] tracking-wide text-mf-text-2 uppercase">
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggle(c.key)}
                  className={cn(
                    "cursor-pointer px-2 font-medium select-none hover:text-mf-text-1",
                    c.align === "right" ? "text-right" : "text-left",
                    c.width
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5",
                      c.align === "right" && "flex-row-reverse"
                    )}
                  >
                    {c.label}
                    {sortKey === c.key &&
                      (desc ? (
                        <ArrowDown className="size-2.5" />
                      ) : (
                        <ArrowUp className="size-2.5" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.id}
                onClick={() => router.push(`/projects/${r.id}/dashboard`)}
                className="h-[34px] cursor-pointer border-b border-mf-gridline text-[11px] hover:bg-[#f4f7fa]"
              >
                <td className="px-2">
                  <div className="text-[12px] text-mf-accent">{r.name}</div>
                  <div className="mf-mono text-[10px] text-mf-text-2">
                    {r.tenderRef}
                  </div>
                </td>
                <td className="px-2 text-mf-text-1">{r.vendorOrgName}</td>
                <td className="px-2 text-right">
                  <div
                    className={cn(
                      "mf-mono",
                      r.delayDays > 0 ? "font-medium text-mf-critical" : "text-mf-done"
                    )}
                  >
                    {r.delayDays > 0 ? `+${r.delayDays} d` : "on time"}
                  </div>
                  {r.delayDays > 0 && (
                    <AttributionBar
                      agencyPct={r.agencyAttributablePct}
                      agencyDays={r.agencyAttributableDays}
                      vendorDays={r.vendorAttributableDays}
                    />
                  )}
                </td>
                <td className="px-2 text-right">
                  <span
                    className={cn(
                      "mf-mono",
                      r.ldCapReached
                        ? "font-medium text-mf-critical"
                        : r.ldExposure > 0
                          ? "text-mf-warning"
                          : "text-mf-text-2"
                    )}
                  >
                    {formatInr(r.ldExposure)}
                  </span>
                  {r.ldCapReached && (
                    <div className="mf-mono text-[9px] text-mf-critical">at cap</div>
                  )}
                </td>
                <td className="mf-mono px-2 text-right">
                  <span
                    className={cn(
                      r.pOnTime == null
                        ? "text-mf-text-2"
                        : r.pOnTime < 0.5
                          ? "text-mf-critical"
                          : r.pOnTime < 0.8
                            ? "text-mf-warning"
                            : "text-mf-done"
                    )}
                  >
                    {r.pOnTime == null ? "—" : `${Math.round(r.pOnTime * 100)}%`}
                  </span>
                </td>
                <td className="mf-mono px-2 text-right">
                  {r.openCriticalInsights > 0 ? (
                    <span className="inline-flex items-center gap-1 text-mf-critical">
                      <span
                        className="inline-block size-2"
                        style={{ background: "var(--mf-critical)" }}
                      />
                      {r.openCriticalInsights}
                    </span>
                  ) : (
                    <span className="text-mf-text-2">0</span>
                  )}
                </td>
                <td className="mf-mono px-2 text-right whitespace-nowrap text-mf-text-2">
                  {formatDate(r.lastActivityAt)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-2 py-4 text-center text-[11px] text-mf-text-2"
                >
                  No vendor projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Condensed version of the dashboard's attribution bar. */
function AttributionBar({
  agencyPct,
  agencyDays,
  vendorDays,
}: {
  agencyPct: number;
  agencyDays: number;
  vendorDays: number;
}) {
  return (
    <span
      className="mt-0.5 flex h-1 w-full overflow-hidden border border-mf-border"
      title={`Agency-attributable ${agencyDays} d · vendor-attributable ${vendorDays} d`}
    >
      <span
        className="h-full"
        style={{ width: `${agencyPct}%`, background: "var(--mf-warning)" }}
      />
      <span
        className="h-full"
        style={{ width: `${100 - agencyPct}%`, background: "var(--mf-accent)" }}
      />
    </span>
  );
}
