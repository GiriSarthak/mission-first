"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

const PHASE_DEFS = [
  { key: "PRE_BID", title: "Pre-Bid", sortOrder: 1 },
  { key: "BID_SUBMISSION", title: "Bid Submission", sortOrder: 2 },
  { key: "POST_AWARD", title: "Post-Award", sortOrder: 3 },
  { key: "SOW", title: "Scope of Work", sortOrder: 4 },
  { key: "EXECUTION", title: "Execution", sortOrder: 5 },
  { key: "CLOSEOUT", title: "Closeout", sortOrder: 6 },
] as const;

export async function createProject(): Promise<string | null> {
  const project = await db.project.create({
    data: {
      name: "New project",
      tenderRef: "—",
      agencyName: "—",
      phases: { create: PHASE_DEFS.map((p) => ({ ...p })) },
    },
  });
  revalidatePath("/", "layout");
  return project.id;
}
