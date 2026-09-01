"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { deleteDocumentFile } from "@/lib/storage";
import { getAuthorizedProject } from "@/lib/auth/authorize";
import { recordScheduleSnapshot } from "@/lib/analysis/snapshot";

export async function updateProjectSettings(
  projectId: string,
  input: {
    name: string;
    tenderRef: string;
    agencyName: string;
    contractStart: string | null; // yyyy-mm-dd
    contractDurationDays: number | null;
  }
): Promise<void> {
  await getAuthorizedProject(projectId, "EDIT_PROJECT_SETTINGS");
  await db.project.update({
    where: { id: projectId },
    data: {
      name: input.name.trim() || "Untitled project",
      tenderRef: input.tenderRef.trim(),
      agencyName: input.agencyName.trim(),
      contractStart: input.contractStart
        ? new Date(`${input.contractStart}T00:00:00`)
        : null,
      contractDurationDays: input.contractDurationDays,
    },
  });
  await recordScheduleSnapshot(projectId);
  revalidatePath(`/projects/${projectId}`, "layout");
}

const PHASE_DEFS = [
  { key: "PRE_BID", title: "Pre-Bid", sortOrder: 1 },
  { key: "BID_SUBMISSION", title: "Bid Submission", sortOrder: 2 },
  { key: "POST_AWARD", title: "Post-Award", sortOrder: 3 },
  { key: "SOW", title: "Scope of Work", sortOrder: 4 },
  { key: "EXECUTION", title: "Execution", sortOrder: 5 },
  { key: "CLOSEOUT", title: "Closeout", sortOrder: 6 },
] as const;

/** Clears everything except the project record; default phases are recreated. */
export async function resetProjectData(projectId: string): Promise<void> {
  await getAuthorizedProject(projectId, "EDIT_PROJECT_SETTINGS");
  const documents = await db.document.findMany({
    where: { projectId },
    select: { storagePath: true },
  });

  // cascades remove pages, checklist items, links, changeset items
  await db.document.deleteMany({ where: { projectId } });
  await db.checklistPhase.deleteMany({ where: { projectId } });
  await db.obligation.deleteMany({ where: { projectId } });
  await db.activity.deleteMany({ where: { projectId } });
  await db.insight.deleteMany({ where: { projectId } });
  await db.changeset.deleteMany({ where: { projectId } });
  await db.chatMessage.deleteMany({ where: { projectId } });
  await db.job.deleteMany({ where: { projectId } });

  await db.checklistPhase.createMany({
    data: PHASE_DEFS.map((p) => ({ projectId, ...p })),
  });

  for (const doc of documents) {
    if (doc.storagePath) await deleteDocumentFile(doc.storagePath).catch(() => {});
  }

  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function getModelConfig(): Promise<{ heavy: string; light: string }> {
  const { modelFor } = await import("@/lib/ai/client");
  return { heavy: modelFor("heavy"), light: modelFor("light") };
}
