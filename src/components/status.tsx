import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; color: string }> = {
  // checklist
  NOT_STARTED: { label: "Not started", color: "var(--mf-neutral)" },
  IN_PROGRESS: { label: "In progress", color: "var(--mf-progress)" },
  DONE: { label: "Done", color: "var(--mf-done)" },
  BLOCKED: { label: "Blocked", color: "var(--mf-critical)" },
  NA: { label: "N/A", color: "var(--mf-neutral)" },
  // obligations
  PENDING: { label: "Pending", color: "var(--mf-neutral)" },
  REQUESTED: { label: "Requested", color: "var(--mf-progress)" },
  OVERDUE: { label: "Overdue", color: "var(--mf-critical)" },
  RECEIVED: { label: "Received", color: "var(--mf-done)" },
  WAIVED: { label: "Waived", color: "var(--mf-neutral)" },
  // jobs / documents
  PROCESSING: { label: "Processing", color: "var(--mf-progress)" },
  FAILED: { label: "Failed", color: "var(--mf-critical)" },
  // insights
  OPEN: { label: "Open", color: "var(--mf-warning)" },
  DISMISSED: { label: "Dismissed", color: "var(--mf-neutral)" },
};

export function statusColor(status: string): string {
  return STATUS_META[status]?.color ?? "var(--mf-neutral)";
}

export function statusLabel(status: string): string {
  return STATUS_META[status]?.label ?? status;
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span
        className="inline-block size-2"
        style={{ background: statusColor(status) }}
      />
      <span className="text-[11px] text-mf-text-2">{statusLabel(status)}</span>
    </span>
  );
}

/** `GTC 19.3 · p.42` style citation string. */
export function citation(clause?: string | null, page?: number | null): string {
  if (clause && page != null) return `${clause} · p.${page}`;
  if (clause) return clause;
  if (page != null) return `p.${page}`;
  return "";
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--mf-critical)",
  WARNING: "var(--mf-warning)",
  INFO: "var(--mf-progress)",
};

export function severityColor(severity: string): string {
  return SEVERITY_COLOR[severity] ?? "var(--mf-neutral)";
}
