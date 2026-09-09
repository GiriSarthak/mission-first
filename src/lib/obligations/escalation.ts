/**
 * Rule-based escalation for obligations.
 *
 * Deterministic and unit-tested, like the schedule engine and delay-cost
 * module — the LLM never decides an escalation level, it only writes the
 * letter once a level has been set here.
 *
 * THE RULE
 * Every 7 days past the due date raises the level by one, capped at 3:
 *
 *   0–6 days overdue   → level 0   (past due, no escalation yet)
 *   7–13 days overdue  → level 1
 *   14–20 days overdue → level 2
 *   21+ days overdue   → level 3   (cap — the ladder has no rung above this)
 *
 * The rule sets a FLOOR, not an absolute value. A vendor may escalate ahead of
 * the clock (e.g. straight to level 2 for something urgent), and the rule will
 * never pull that back down. What the rule will not allow is de-escalating
 * below what the contractual clock says: an item 21 days overdue cannot be
 * shown as level 1 because someone clicked it down.
 *
 * An obligation that has been received or waived stops accruing entirely.
 */

const MS_PER_DAY = 86_400_000;

/** Days between the due date and today; one rung per this many days. */
export const ESCALATION_INTERVAL_DAYS = 7;
export const MAX_ESCALATION_LEVEL = 3;

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export type EscalatableObligation = {
  dueOn: Date | string | null;
  receivedOn: Date | string | null;
  status: string;
  escalationLevel: number;
};

/**
 * Whole days past the due date. 0 when not due yet, undated, already
 * received, or waived — those never accrue escalation.
 */
export function daysOverdue(
  o: Pick<EscalatableObligation, "dueOn" | "receivedOn" | "status">,
  today: Date = new Date()
): number {
  if (!o.dueOn) return 0;
  if (o.receivedOn) return 0;
  if (o.status === "RECEIVED" || o.status === "WAIVED") return 0;
  const due = startOfDay(new Date(o.dueOn));
  const now = startOfDay(today);
  const diff = Math.round((now.getTime() - due.getTime()) / MS_PER_DAY);
  return diff > 0 ? diff : 0;
}

/** The level the clock alone justifies. */
export function ruleEscalationLevel(overdueDays: number): number {
  if (overdueDays < ESCALATION_INTERVAL_DAYS) return 0;
  return Math.min(
    MAX_ESCALATION_LEVEL,
    Math.floor(overdueDays / ESCALATION_INTERVAL_DAYS)
  );
}

/**
 * What the obligation should actually show: the rule's floor, or a higher
 * level a human deliberately set.
 */
export function effectiveEscalationLevel(
  o: EscalatableObligation,
  today: Date = new Date()
): number {
  const rule = ruleEscalationLevel(daysOverdue(o, today));
  return Math.max(rule, Math.min(MAX_ESCALATION_LEVEL, Math.max(0, o.escalationLevel)));
}

/**
 * Days until the next rung, or null when there is none (not overdue yet, or
 * already at the cap). Drives the UI tooltip so the ladder is legible.
 */
export function daysToNextEscalation(
  o: EscalatableObligation,
  today: Date = new Date()
): number | null {
  const overdue = daysOverdue(o, today);
  if (overdue <= 0) return null;
  const current = ruleEscalationLevel(overdue);
  if (current >= MAX_ESCALATION_LEVEL) return null;
  const nextRungAt = (current + 1) * ESCALATION_INTERVAL_DAYS;
  return nextRungAt - overdue;
}

/**
 * Display status. The stored `status` field is what a human last chose, but a
 * dated obligation that has come and gone is overdue as a matter of fact —
 * without this the panel shows a red "+10d" next to a "Pending" pill.
 * RECEIVED and WAIVED always win: they are decisions, not clock states.
 */
export function effectiveObligationStatus(
  o: Pick<EscalatableObligation, "dueOn" | "receivedOn" | "status">,
  today: Date = new Date()
): string {
  if (o.status === "RECEIVED" || o.status === "WAIVED" || o.receivedOn) {
    return o.status === "WAIVED" ? "WAIVED" : "RECEIVED";
  }
  return daysOverdue(o, today) > 0 ? "OVERDUE" : o.status;
}
