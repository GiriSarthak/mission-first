"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { LINK_TYPES, type LinkType } from "@/lib/enums";

export type ActivityPatch = {
  name?: string;
  optimistic?: number | null;
  mostLikely?: number;
  pessimistic?: number | null;
  percentComplete?: number;
  actualStart?: string | null; // ISO date or null to clear
  actualFinish?: string | null;
  remainingDays?: number | null;
};

export async function updateActivity(id: string, patch: ActivityPatch): Promise<void> {
  const a = await db.activity.update({
    where: { id },
    data: {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.optimistic !== undefined && { optimistic: patch.optimistic }),
      ...(patch.mostLikely !== undefined && { mostLikely: patch.mostLikely }),
      ...(patch.pessimistic !== undefined && { pessimistic: patch.pessimistic }),
      ...(patch.percentComplete !== undefined && {
        percentComplete: Math.max(0, Math.min(100, patch.percentComplete)),
      }),
      ...(patch.actualStart !== undefined && {
        actualStart: patch.actualStart ? new Date(patch.actualStart) : null,
      }),
      ...(patch.actualFinish !== undefined && {
        actualFinish: patch.actualFinish ? new Date(patch.actualFinish) : null,
      }),
      ...(patch.remainingDays !== undefined && { remainingDays: patch.remainingDays }),
    },
  });
  revalidatePath(`/projects/${a.projectId}/dashboard`);
}

export async function createActivity(
  projectId: string,
  input: { code: string; name: string; mostLikely: number }
): Promise<{ id: string } | { error: string }> {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) return { error: "Code and name are required." };
  const dup = await db.activity.findUnique({
    where: { projectId_code: { projectId, code } },
  });
  if (dup) return { error: `Activity ${code} already exists.` };
  const a = await db.activity.create({
    data: {
      projectId,
      code,
      name,
      mostLikely: Math.max(1, input.mostLikely || 1),
      sourceType: "MANUAL",
    },
  });
  revalidatePath(`/projects/${projectId}/dashboard`);
  return { id: a.id };
}

export async function deleteActivity(id: string): Promise<void> {
  const a = await db.activity.delete({ where: { id } });
  revalidatePath(`/projects/${a.projectId}/dashboard`);
}

export async function createLink(
  predecessorId: string,
  successorId: string,
  type: LinkType,
  lagDays: number
): Promise<{ id: string } | { error: string }> {
  if (!LINK_TYPES.includes(type)) return { error: "Invalid link type." };
  if (predecessorId === successorId) return { error: "An activity cannot link to itself." };
  const existing = await db.activityLink.findUnique({
    where: {
      predecessorId_successorId_type: { predecessorId, successorId, type },
    },
  });
  if (existing) return { error: "This link already exists." };
  const pred = await db.activity.findUnique({ where: { id: predecessorId } });
  if (!pred) return { error: "Predecessor not found." };
  const link = await db.activityLink.create({
    data: { predecessorId, successorId, type, lagDays },
  });
  revalidatePath(`/projects/${pred.projectId}/dashboard`);
  return { id: link.id };
}

export async function deleteLink(id: string): Promise<void> {
  const link = await db.activityLink.delete({
    where: { id },
    include: { predecessor: true },
  });
  revalidatePath(`/projects/${link.predecessor.projectId}/dashboard`);
}
