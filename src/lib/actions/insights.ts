"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { INSIGHT_STATUSES, type InsightStatus } from "@/lib/enums";
import { getAuthorizedProject } from "@/lib/auth/authorize";

export async function requestInsightsRegeneration(
  projectId: string
): Promise<{ jobId: string }> {
  await getAuthorizedProject(projectId, "REGENERATE_INSIGHTS");
  const job = await db.job.create({
    data: { projectId, type: "GENERATE_INSIGHTS", payload: "{}" },
  });
  return { jobId: job.id };
}

export async function updateInsightStatus(
  insightId: string,
  status: InsightStatus
): Promise<void> {
  if (!INSIGHT_STATUSES.includes(status)) return;
  const existing = await db.insight.findUnique({ where: { id: insightId } });
  if (!existing) return;
  await getAuthorizedProject(existing.projectId, "VIEW_PROJECT");
  const ins = await db.insight.update({
    where: { id: insightId },
    data: { status },
  });
  revalidatePath(`/projects/${ins.projectId}/dashboard`);
}
