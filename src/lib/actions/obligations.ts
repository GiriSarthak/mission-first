"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { OBLIGATION_STATUSES, type ObligationStatus } from "@/lib/enums";

export async function updateObligationStatus(
  obligationId: string,
  status: ObligationStatus
): Promise<void> {
  if (!OBLIGATION_STATUSES.includes(status)) return;
  const o = await db.obligation.update({
    where: { id: obligationId },
    data: {
      status,
      receivedOn: status === "RECEIVED" ? new Date() : null,
    },
  });
  revalidatePath(`/projects/${o.projectId}/dashboard`);
}

export async function setEscalationLevel(
  obligationId: string,
  level: number
): Promise<void> {
  const clamped = Math.max(0, Math.min(3, Math.round(level)));
  const o = await db.obligation.update({
    where: { id: obligationId },
    data: { escalationLevel: clamped },
  });
  revalidatePath(`/projects/${o.projectId}/dashboard`);
}
