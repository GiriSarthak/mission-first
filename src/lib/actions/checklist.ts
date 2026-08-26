"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { CHECKLIST_STATUSES, type ChecklistStatus } from "@/lib/enums";

export async function updateChecklistItemStatus(
  itemId: string,
  status: ChecklistStatus
): Promise<void> {
  if (!CHECKLIST_STATUSES.includes(status)) return;
  const item = await db.checklistItem.update({
    where: { id: itemId },
    data: { status },
    include: { phase: true },
  });
  revalidatePath(`/projects/${item.phase.projectId}/dashboard`);
}

export async function addChecklistItem(
  phaseId: string,
  title: string
): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  const phase = await db.checklistPhase.findUnique({ where: { id: phaseId } });
  if (!phase) return;
  await db.checklistItem.create({
    data: { phaseId, title: trimmed, sourceType: "MANUAL" },
  });
  revalidatePath(`/projects/${phase.projectId}/dashboard`);
}
