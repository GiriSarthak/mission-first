"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/authorize";
import { can } from "@/lib/auth/roles";

const PHASE_DEFS = [
  { key: "PRE_BID", title: "Pre-Bid", sortOrder: 1 },
  { key: "BID_SUBMISSION", title: "Bid Submission", sortOrder: 2 },
  { key: "POST_AWARD", title: "Post-Award", sortOrder: 3 },
  { key: "SOW", title: "Scope of Work", sortOrder: 4 },
  { key: "EXECUTION", title: "Execution", sortOrder: 5 },
  { key: "CLOSEOUT", title: "Closeout", sortOrder: 6 },
] as const;

/**
 * Vendor admins create projects under their own org. The agency org is
 * inherited from an existing project when there is one, so the demo's new
 * projects stay visible to the same agency; a real flow would let the vendor
 * pick or name the agency here.
 */
export async function createProject(): Promise<string | null> {
  const user = await requireUser();
  if (!can(user.role, "CREATE_PROJECT")) return null;

  const sibling = await db.project.findFirst({
    where: { vendorOrgId: user.orgId, agencyOrgId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { agencyOrgId: true, agencyName: true },
  });

  const project = await db.project.create({
    data: {
      name: "New project",
      tenderRef: "—",
      agencyName: sibling?.agencyName ?? "—",
      vendorOrgId: user.orgId,
      agencyOrgId: sibling?.agencyOrgId ?? null,
      phases: { create: PHASE_DEFS.map((p) => ({ ...p })) },
    },
  });
  revalidatePath("/", "layout");
  return project.id;
}
