"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check, RefreshCw, X } from "lucide-react";
import { updateInsightStatus } from "@/lib/actions/insights";
import { citation, severityColor } from "@/components/status";

export type InsightRow = {
  id: string;
  title: string;
  body: string;
  severity: string;
  category: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  sourceDocumentId: string | null;
  sourcePage: number | null;
};

export function InsightsPanel({
  projectId,
  insights,
  onRegenerate,
  regenerating,
}: {
  projectId: string;
  insights: InsightRow[];
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const [, startTransition] = useTransition();

  return (
    <div className="mf-panel">
      <div className="mf-panel-header">
        <span className="mf-panel-title">AI Insights</span>
        <button
          type="button"
          disabled={!onRegenerate || regenerating}
          onClick={() => onRegenerate?.()}
          title={onRegenerate ? "Regenerate insights" : "Regenerate (available in milestone 9)"}
          className="ml-auto flex items-center gap-1 border border-mf-border bg-white px-1.5 py-px text-[10px] text-mf-text-2 hover:bg-mf-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw className={regenerating ? "size-3 animate-spin" : "size-3"} />
          Regenerate
        </button>
      </div>
      {insights.length === 0 ? (
        <div className="p-4 text-[12px] text-mf-text-2">
          No insights yet — upload tender documents to begin.
        </div>
      ) : (
        <div>
          {insights.map((ins) => (
            <div
              key={ins.id}
              className="flex items-center gap-2 border-b border-mf-gridline px-2 py-1.5 last:border-0 hover:bg-[#f8f9fb]"
            >
              <span
                className="h-7 w-0.5 shrink-0"
                style={{ background: severityColor(ins.severity) }}
              />
              <div className="min-w-0 flex-1">
                <span className="text-[12px] font-medium text-mf-text-1">{ins.title}</span>
                <span className="ml-2 text-[11px] text-mf-text-2">{ins.body}</span>
              </div>
              {ins.relatedEntityType === "ACTIVITY" && (
                <span className="mf-mono shrink-0 text-[10px] text-mf-text-2">schedule</span>
              )}
              {citation(null, ins.sourcePage) && ins.sourceDocumentId && (
                <Link
                  href={`/projects/${projectId}/documents?doc=${ins.sourceDocumentId}&page=${ins.sourcePage}`}
                  className="mf-mono shrink-0 text-[10px] text-mf-accent hover:underline"
                >
                  {citation(null, ins.sourcePage)}
                </Link>
              )}
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  title="Mark done"
                  onClick={() => startTransition(() => updateInsightStatus(ins.id, "DONE"))}
                  className="border border-mf-border bg-white p-0.5 text-mf-text-2 hover:text-mf-done"
                >
                  <Check className="size-3" />
                </button>
                <button
                  type="button"
                  title="Dismiss"
                  onClick={() => startTransition(() => updateInsightStatus(ins.id, "DISMISSED"))}
                  className="border border-mf-border bg-white p-0.5 text-mf-text-2 hover:text-mf-critical"
                >
                  <X className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
