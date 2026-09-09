"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Copy, Loader2, Mail, MessageSquareReply } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OBLIGATION_STATUSES, type ObligationStatus } from "@/lib/enums";
import {
  respondToObligation,
  setEscalationLevel,
  updateObligationStatus,
} from "@/lib/actions/obligations";
import { draftEscalationLetter } from "@/lib/actions/letters";
import { citation } from "@/components/status";
import { StatusSelect } from "@/components/dashboard/status-select";
import { formatDate } from "@/lib/format";
import {
  daysOverdue as computeDaysOverdue,
  daysToNextEscalation,
  effectiveEscalationLevel,
  effectiveObligationStatus,
  ESCALATION_INTERVAL_DAYS,
  MAX_ESCALATION_LEVEL,
} from "@/lib/obligations/escalation";

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
  agencyResponseNote: string | null;
  agencyRespondedAt: string | null;
};

export function ObligationsPanel({
  projectId,
  obligations,
  canEditVendorSide,
  canRespondAgencySide,
  canDraftLetter,
}: {
  projectId: string;
  obligations: ObligationRow[];
  /** vendor side: chase, mark received, escalate */
  canEditVendorSide: boolean;
  /** agency side: acknowledge with a note, optionally mark fulfilled */
  canRespondAgencySide: boolean;
  canDraftLetter: boolean;
}) {
  const [, startTransition] = useTransition();
  const [letterFor, setLetterFor] = useState<ObligationRow | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [respondTo, setRespondTo] = useState<ObligationRow | null>(null);

  async function openLetter(o: ObligationRow) {
    setLetterFor(o);
    setLetter(null);
    setLetterError(null);
    setCopied(false);
    const res = await draftEscalationLetter(o.id);
    if ("error" in res) setLetterError(res.error);
    else setLetter(res.letter);
  }
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
              // All three come from the same tested rule module.
              const overdueDays = computeDaysOverdue(o, today);
              const shownStatus = effectiveObligationStatus(o, today);
              const shownLevel = effectiveEscalationLevel(o, today);
              const nextIn = daysToNextEscalation(o, today);
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
                    {o.agencyResponseNote && (
                      <div
                        className="mt-0.5 border-l-2 border-mf-border pl-1.5 text-[10px] text-mf-text-2"
                        title={`Agency response ${formatDate(o.agencyRespondedAt)}`}
                      >
                        {o.agencyResponseNote}
                      </div>
                    )}
                  </td>
                  <td className="mf-mono w-16 px-2 py-1 text-right align-top text-[11px] whitespace-nowrap text-mf-text-2">
                    {formatDate(o.dueOn)}
                    {overdueDays > 0 && (
                      <div className="font-medium text-mf-critical">+{overdueDays}d</div>
                    )}
                  </td>
                  <td className="w-25 px-2 py-1 align-top">
                    <StatusSelect
                      value={shownStatus}
                      options={OBLIGATION_STATUSES}
                      disabled={!canEditVendorSide}
                      onChange={(s) =>
                        startTransition(() =>
                          updateObligationStatus(o.id, s as ObligationStatus)
                        )
                      }
                    />
                    <div className="mt-1 flex items-center gap-1">
                      <EscalationSquares
                        level={shownLevel}
                        overdueDays={overdueDays}
                        nextIn={nextIn}
                        readOnly={!canEditVendorSide}
                        onSet={(lvl) =>
                          startTransition(() => setEscalationLevel(o.id, lvl))
                        }
                      />
                      {canDraftLetter && (
                        <button
                          type="button"
                          title="Draft escalation letter"
                          onClick={() => void openLetter(o)}
                          className="ml-1 text-mf-text-2 hover:text-mf-accent"
                        >
                          <Mail className="size-3.5" />
                        </button>
                      )}
                      {canRespondAgencySide && (
                        <button
                          type="button"
                          title="Respond to this request"
                          onClick={() => setRespondTo(o)}
                          className="ml-1 text-mf-text-2 hover:text-mf-accent"
                        >
                          <MessageSquareReply className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* agency response modal */}
      <RespondDialog
        obligation={respondTo}
        onClose={() => setRespondTo(null)}
        onSubmit={(note, markReceived) =>
          startTransition(() => {
            if (respondTo) {
              void respondToObligation(respondTo.id, { note, markReceived });
            }
            setRespondTo(null);
          })
        }
      />

      {/* escalation letter modal — draft only, copy to send elsewhere */}
      <Dialog open={letterFor != null} onOpenChange={(o) => !o && setLetterFor(null)}>
        <DialogContent className="max-w-xl rounded-[2px] p-0">
          <DialogHeader className="border-b border-mf-border px-3 py-2">
            <DialogTitle className="mf-heading text-mf-text-1">
              Escalation letter — {letterFor?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] min-h-32 overflow-auto px-3 py-2">
            {letterError ? (
              <div className="text-[11px] text-mf-critical">{letterError}</div>
            ) : letter ? (
              <pre className="font-mono text-[11px] leading-4.5 whitespace-pre-wrap text-mf-text-1">
                {letter}
              </pre>
            ) : (
              <div className="flex items-center gap-2 text-[11px] text-mf-text-2">
                <Loader2 className="size-3 animate-spin" /> Drafting…
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-mf-border px-3 py-2">
            <span className="mr-auto text-[10px] text-mf-text-2">
              Draft only — nothing is sent.
            </span>
            <button
              type="button"
              disabled={!letter}
              onClick={async () => {
                if (!letter) return;
                await navigator.clipboard.writeText(letter);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 border border-mf-accent bg-mf-accent px-2 py-1 text-[11px] text-white hover:bg-mf-accent-hover disabled:opacity-50"
            >
              <Copy className="size-3" /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Agency-side acknowledgement: a note, optionally marking the item fulfilled. */
function RespondDialog({
  obligation,
  onClose,
  onSubmit,
}: {
  obligation: ObligationRow | null;
  onClose: () => void;
  onSubmit: (note: string, markReceived: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const [markReceived, setMarkReceived] = useState(false);

  return (
    <Dialog
      open={obligation != null}
      onOpenChange={(o) => {
        if (!o) {
          setNote("");
          setMarkReceived(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md rounded-[2px] p-0">
        <DialogHeader className="border-b border-mf-border px-3 py-2">
          <DialogTitle className="mf-heading text-mf-text-1">
            Agency response — {obligation?.title}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 px-3 py-3">
          {obligation?.agencyResponseNote && (
            <div className="border-l-2 border-mf-border pl-2 text-[11px] text-mf-text-2">
              Previous: {obligation.agencyResponseNote}
            </div>
          )}
          <label className="mf-heading text-mf-text-2" htmlFor="response-note">
            Response note
          </label>
          <textarea
            id="response-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="e.g. Transformer despatch scheduled for 12-Sep; drawings returned under cover of letter no. …"
            className="w-full resize-none border border-mf-border bg-white px-2 py-1 text-[12px] outline-none focus:border-mf-accent"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-mf-text-1">
            <input
              type="checkbox"
              checked={markReceived}
              onChange={(e) => setMarkReceived(e.target.checked)}
              className="size-3 accent-[#2f5f8f]"
            />
            Mark this deliverable as fulfilled
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-mf-border px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="border border-mf-border bg-white px-3 py-1 text-[11px] text-mf-text-1 hover:bg-mf-surface-1"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!note.trim() && !markReceived}
            onClick={() => {
              onSubmit(note, markReceived);
              setNote("");
              setMarkReceived(false);
            }}
            className="border border-mf-accent bg-mf-accent px-3 py-1 text-[11px] text-white hover:bg-mf-accent-hover disabled:opacity-50"
          >
            Record response
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Escalation ladder. The level shown is whichever is higher: what the clock
 * has earned (one rung per 7 days overdue, capped at 3) or what a vendor set
 * manually. Clicking raises it ahead of the clock; it cannot be dragged below
 * the rule's floor, so the buttons below that floor are inert.
 */
function EscalationSquares({
  level,
  overdueDays,
  nextIn,
  onSet,
  readOnly,
}: {
  level: number;
  overdueDays: number;
  nextIn: number | null;
  onSet: (level: number) => void;
  readOnly?: boolean;
}) {
  const title = [
    `Escalation level ${level} of ${MAX_ESCALATION_LEVEL}`,
    overdueDays > 0
      ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue — one level per ${ESCALATION_INTERVAL_DAYS} days`
      : "not overdue",
    nextIn != null
      ? `level ${level + 1} in ${nextIn} day${nextIn === 1 ? "" : "s"}`
      : level >= MAX_ESCALATION_LEVEL
        ? "at the top of the ladder"
        : null,
    readOnly ? null : "click to escalate ahead of schedule",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span className="flex gap-0.5" title={title}>
      {[1, 2, 3].map((i) => (
        <button
          key={i}
          type="button"
          disabled={readOnly}
          onClick={() => onSet(i === level ? i - 1 : i)}
          className="inline-block size-2 border border-mf-border disabled:cursor-default"
          style={{ background: i <= level ? "var(--mf-critical)" : "transparent" }}
        />
      ))}
    </span>
  );
}
