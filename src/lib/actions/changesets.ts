"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { PhaseKey } from "@/lib/enums";
import { getAuthorizedProject } from "@/lib/auth/authorize";

type ItemPayload = {
  entityType: "CHECKLIST_ITEM" | "OBLIGATION" | "ACTIVITY" | "INSIGHT";
  phaseKey?: PhaseKey | null;
  title: string;
  description?: string | null;
  clause?: string | null;
  page?: number | null;
  owedBy?: "AGENCY" | "VENDOR" | null;
  stipulatedDays?: number | null;
  dueDateHint?: string | null;
  durationDays?: number | null;
  // WBS proposals only:
  code?: string;
  optimistic?: number | null;
  pessimistic?: number | null;
  dependsOnCodes?: string[];
  // insights only:
  severity?: string;
  category?: string;
};

/**
 * Applies a changeset (BRIEF §1.3): accepted items become real records with
 * their citations; everything else is recorded as rejected. `acceptedItemIds`
 * null means accept all.
 */
export async function applyChangeset(
  changesetId: string,
  acceptedItemIds: string[] | null
): Promise<{ accepted: number; rejected: number }> {
  const changeset = await db.changeset.findUniqueOrThrow({
    where: { id: changesetId },
    include: { items: { orderBy: { id: "asc" } } },
  });
  await getAuthorizedProject(changeset.projectId, "MANAGE_DOCUMENTS");
  if (changeset.status !== "PROPOSED") {
    return {
      accepted: changeset.items.filter((i) => i.accepted).length,
      rejected: changeset.items.filter((i) => i.accepted === false).length,
    };
  }

  const acceptSet =
    acceptedItemIds == null ? null : new Set(acceptedItemIds);
  const isAccepted = (id: string) => acceptSet == null || acceptSet.has(id);

  const phases = await db.checklistPhase.findMany({
    where: { projectId: changeset.projectId },
  });
  const phaseByKey = new Map(phases.map((p) => [p.key, p.id]));

  const existingCodes = new Set(
    (
      await db.activity.findMany({
        where: { projectId: changeset.projectId },
        select: { code: true },
      })
    ).map((a) => a.code)
  );

  let accepted = 0;
  let rejected = 0;
  // proposal code → created activity id (for FS links among accepted proposals)
  const createdByCode = new Map<string, string>();
  const pendingLinks: Array<{ code: string; dependsOn: string[] }> = [];
  let extractedActivitySeq = 0;

  for (const item of changeset.items) {
    const take = isAccepted(item.id);
    await db.changesetItem.update({
      where: { id: item.id },
      data: { accepted: take },
    });
    if (!take) {
      rejected++;
      continue;
    }
    const p = JSON.parse(item.payload) as ItemPayload;

    switch (item.entityType) {
      case "CHECKLIST_ITEM": {
        const phaseId =
          (p.phaseKey && phaseByKey.get(p.phaseKey)) || phaseByKey.get("EXECUTION");
        if (!phaseId) break;
        await db.checklistItem.create({
          data: {
            phaseId,
            title: p.title,
            description: p.description ?? undefined,
            sourceType: "AI",
            sourceDocumentId: changeset.documentId,
            sourcePage: p.page ?? undefined,
            sourceClause: p.clause ?? undefined,
          },
        });
        break;
      }
      case "OBLIGATION": {
        await db.obligation.create({
          data: {
            projectId: changeset.projectId,
            title: p.title,
            description: p.description ?? undefined,
            owedBy: p.owedBy ?? "VENDOR",
            contractClause: p.clause ?? undefined,
            sourceDocumentId: changeset.documentId,
            sourcePage: p.page ?? undefined,
            stipulatedDays: p.stipulatedDays ?? undefined,
            status: "PENDING",
          },
        });
        break;
      }
      case "ACTIVITY": {
        let code = p.code;
        if (!code) {
          do {
            extractedActivitySeq += 10;
            code = `X${String(extractedActivitySeq).padStart(3, "0")}`;
          } while (existingCodes.has(code));
        }
        while (existingCodes.has(code)) code = `${code}A`;
        existingCodes.add(code);
        const created = await db.activity.create({
          data: {
            projectId: changeset.projectId,
            code,
            name: p.title,
            mostLikely: p.durationDays ?? 30,
            optimistic: p.optimistic ?? undefined,
            pessimistic: p.pessimistic ?? undefined,
            sourceType: "AI",
            sourceDocumentId: changeset.documentId,
            sourcePage: p.page ?? undefined,
          },
        });
        if (p.code) {
          createdByCode.set(p.code, created.id);
          if (p.dependsOnCodes?.length) {
            pendingLinks.push({ code: p.code, dependsOn: p.dependsOnCodes });
          }
        }
        break;
      }
      case "INSIGHT": {
        await db.insight.create({
          data: {
            projectId: changeset.projectId,
            title: p.title,
            body: p.description ?? p.title,
            severity: p.severity ?? "INFO",
            category: p.category ?? "DOCUMENT",
            sourceDocumentId: changeset.documentId,
            sourcePage: p.page ?? undefined,
          },
        });
        break;
      }
    }
    accepted++;
  }

  // FS links among accepted WBS proposals
  for (const { code, dependsOn } of pendingLinks) {
    const successorId = createdByCode.get(code);
    if (!successorId) continue;
    for (const predCode of dependsOn) {
      const predecessorId = createdByCode.get(predCode);
      if (!predecessorId || predecessorId === successorId) continue;
      await db.activityLink
        .create({
          data: { predecessorId, successorId, type: "FS", lagDays: 0 },
        })
        .catch(() => {}); // duplicate links are fine to skip
    }
  }

  const status =
    accepted === 0 ? "REJECTED" : rejected === 0 ? "ACCEPTED" : "PARTIAL";
  await db.changeset.update({ where: { id: changesetId }, data: { status } });

  await db.chatMessage.create({
    data: {
      projectId: changeset.projectId,
      role: "ASSISTANT",
      documentId: changeset.documentId,
      content:
        accepted === 0
          ? "Changeset rejected — nothing was applied."
          : `Applied ${accepted} item${accepted === 1 ? "" : "s"}${
              rejected ? ` (${rejected} rejected)` : ""
            }. The dashboard reflects them on next load.`,
    },
  });

  revalidatePath(`/projects/${changeset.projectId}/dashboard`);
  revalidatePath(`/projects/${changeset.projectId}/documents`);
  return { accepted, rejected };
}
