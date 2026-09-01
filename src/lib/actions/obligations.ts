"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { OBLIGATION_STATUSES, type ObligationStatus } from "@/lib/enums";
import { authorizeByObligation } from "@/lib/auth/authorize";

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
  const clamped = Math.max(0, Math.min(3, Math.round(level)));
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
  revalidatePath(`/projects/${project.id}/dashboard`);
  revalidatePath("/portfolio");
}
