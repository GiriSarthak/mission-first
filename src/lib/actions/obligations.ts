"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { OBLIGATION_STATUSES, type ObligationStatus } from "@/lib/enums";
import { authorizeByObligation } from "@/lib/auth/authorize";
import { recordScheduleSnapshot } from "@/lib/analysis/snapshot";
import {
  MAX_ESCALATION_LEVEL,
  daysOverdue,
  ruleEscalationLevel,
} from "@/lib/obligations/escalation";

export async function updateObligationStatus(
  obligationId: string,
  status: ObligationStatus
): Promise<void> {
  if (!OBLIGATION_STATUSES.includes(status)) return;
  const { project } = await authorizeByObligation(
    obligationId,
    "MARK_OBLIGATION_VENDOR_SIDE"
  );
  await db.obligation.update({
    where: { id: obligationId },
    data: {
      status,
      receivedOn: status === "RECEIVED" ? new Date() : null,
    },
  });
  await recordScheduleSnapshot(project.id);
  revalidatePath(`/projects/${project.id}/dashboard`);
}

export async function setEscalationLevel(
  obligationId: string,
  level: number
): Promise<void> {
  const { project } = await authorizeByObligation(
    obligationId,
    "MARK_OBLIGATION_VENDOR_SIDE"
  );
  // A human may escalate ahead of the clock, but never below the rule's
  // floor — an obligation 21 days overdue cannot be clicked back down to 1.
  const existing = await db.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    select: { dueOn: true, receivedOn: true, status: true },
  });
  const floor = ruleEscalationLevel(daysOverdue(existing));
  const requested = Math.max(0, Math.min(MAX_ESCALATION_LEVEL, Math.round(level)));
  const clamped = Math.max(floor, requested);
  await db.obligation.update({
    where: { id: obligationId },
    data: { escalationLevel: clamped },
  });
  revalidatePath(`/projects/${project.id}/dashboard`);
}

/**
 * The agency side of an obligation: acknowledge with a response note, and
 * optionally mark it fulfilled. Available to both agency roles.
 */
export async function respondToObligation(
  obligationId: string,
  input: { note: string; markReceived: boolean }
): Promise<void> {
  const { project } = await authorizeByObligation(
    obligationId,
    "RESPOND_OBLIGATION_AGENCY_SIDE"
  );
  const note = input.note.trim();
  await db.obligation.update({
    where: { id: obligationId },
    data: {
      agencyResponseNote: note || null,
      agencyRespondedAt: new Date(),
      ...(input.markReceived
        ? { status: "RECEIVED", receivedOn: new Date() }
        : {}),
    },
  });
  await recordScheduleSnapshot(project.id);
  revalidatePath(`/projects/${project.id}/dashboard`);
  revalidatePath("/portfolio");
}
