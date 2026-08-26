"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { INSIGHT_STATUSES, type InsightStatus } from "@/lib/enums";

export async function updateInsightStatus(
  insightId: string,
  status: InsightStatus
): Promise<void> {
  if (!INSIGHT_STATUSES.includes(status)) return;
  const ins = await db.insight.update({
    where: { id: insightId },
    data: { status },
  });
  revalidatePath(`/projects/${ins.projectId}/dashboard`);
}
