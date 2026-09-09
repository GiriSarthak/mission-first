import "server-only";
import { db } from "@/lib/db";
import { effectiveEscalationLevel } from "@/lib/obligations/escalation";

/**
 * Brings stored escalation levels up to what the rule says.
 *
 * There is no scheduler on this deployment (see CLAUDE.md), so instead of a
 * cron job this runs lazily whenever a project's obligations are read — the
 * dashboard and the portfolio. The displayed level is always computed live, so
 * the UI is correct even if this never ran; persisting matters because the
 * escalation-letter prompt and the insights snapshot read the stored column.
 *
 * Only ever raises a level. Manual escalation ahead of the clock is preserved,
 * and nothing is ever de-escalated by the machine.
 *
 * Never throws: a failed sweep must not take a dashboard down with it.
 */
export async function sweepObligationEscalations(
  projectId: string
): Promise<number> {
  try {
    const obligations = await db.obligation.findMany({
      where: {
        projectId,
        receivedOn: null,
        status: { notIn: ["RECEIVED", "WAIVED"] },
        dueOn: { not: null },
      },
      select: {
        id: true,
        dueOn: true,
        receivedOn: true,
        status: true,
        escalationLevel: true,
      },
    });

    const now = new Date();
    let raised = 0;

    for (const o of obligations) {
      const level = effectiveEscalationLevel(o, now);
      if (level > o.escalationLevel) {
        await db.obligation.update({
          where: { id: o.id },
          data: { escalationLevel: level },
        });
        raised++;
      }
    }
    return raised;
  } catch {
    return 0;
  }
}

/** Sweeps every project an org can see, for the portfolio view. */
export async function sweepProjects(projectIds: string[]): Promise<number> {
  let raised = 0;
  for (const id of projectIds) raised += await sweepObligationEscalations(id);
  return raised;
}
