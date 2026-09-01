"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { CHECKLIST_STATUSES, type ChecklistStatus } from "@/lib/enums";
import {
  authorizeByChecklistItem,
  getAuthorizedProject,
} from "@/lib/auth/authorize";

export async function updateChecklistItemStatus(
  itemId: string,
  status: ChecklistStatus
): Promise<void> {
  if (!CHECKLIST_STATUSES.includes(status)) return;
  const { project } = await authorizeByChecklistItem(itemId, "EDIT_PROJECT_DATA");
  await db.checklistItem.update({ where: { id: itemId }, data: { status } });
  revalidatePath(`/projects/${project.id}/dashboard`);
}

export async function addChecklistItem(
  phaseId: string,
  title: string
): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  const phase = await db.checklistPhase.findUnique({ where: { id: phaseId } });
  if (!phase) return;
  await getAuthorizedProject(phase.projectId, "EDIT_PROJECT_DATA");
  await db.checklistItem.create({
    data: { phaseId, title: trimmed, sourceType: "MANUAL" },
  });
  revalidatePath(`/projects/${phase.projectId}/dashboard`);
}

/**
 * Agency sign-off on items flagged `requiresAgencyApproval` (AGENCY_ADMIN
 * only — AGENCY_REVIEWER lacks APPROVE_AGENCY_ITEMS).
 */
export async function approveChecklistItem(
  itemId: string,
  approve: boolean
): Promise<void> {
  const { project, user } = await authorizeByChecklistItem(
    itemId,
    "APPROVE_AGENCY_ITEMS"
  );
  const item = await db.checklistItem.findUniqueOrThrow({ where: { id: itemId } });
  if (!item.requiresAgencyApproval) {
    throw new Error("This item does not require agency approval.");
  }
  await db.checklistItem.update({
    where: { id: itemId },
    data: approve
      ? { approvedAt: new Date(), approvedByUserId: user.id, status: "DONE" }
      : { approvedAt: null, approvedByUserId: null },
  });
  revalidatePath(`/projects/${project.id}/dashboard`);
}
