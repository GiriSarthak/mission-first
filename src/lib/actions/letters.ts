"use server";

import { db } from "@/lib/db";
import { complete } from "@/lib/ai/client";
import { escalationLetterPrompt } from "@/lib/ai/prompts/escalation-letter";
import { formatDate, daysBetween } from "@/lib/format";
import { authorizeByObligation } from "@/lib/auth/authorize";
import { effectiveEscalationLevel } from "@/lib/obligations/escalation";

/** §7.6 — drafts formal escalation correspondence. Draft only, never sent. */
export async function draftEscalationLetter(
  obligationId: string
): Promise<{ letter: string } | { error: string }> {
  await authorizeByObligation(obligationId, "DRAFT_ESCALATION_LETTER");
  const obligation = await db.obligation.findUnique({
    where: { id: obligationId },
    include: { project: true },
  });
  if (!obligation) return { error: "Obligation not found." };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysOverdue =
    obligation.dueOn && !obligation.receivedOn
      ? Math.max(0, daysBetween(obligation.dueOn, today))
      : 0;

  // clause text from the cited page, when we have one
  let clauseExcerpt: string | null = null;
  if (obligation.sourceDocumentId && obligation.sourcePage) {
    const page = await db.documentPage.findUnique({
      where: {
        documentId_pageNumber: {
          documentId: obligation.sourceDocumentId,
          pageNumber: obligation.sourcePage,
        },
      },
    });
    clauseExcerpt = page?.text ?? null;
  }

  try {
    const letter = await complete(
      [
        {
          role: "user",
          content: escalationLetterPrompt({
            projectName: obligation.project.name,
            tenderRef: obligation.project.tenderRef,
            agencyName: obligation.project.agencyName,
            obligation: {
              title: obligation.title,
              description: obligation.description,
              contractClause: obligation.contractClause,
              requestedOn: obligation.requestedOn ? formatDate(obligation.requestedOn) : null,
              dueOn: obligation.dueOn ? formatDate(obligation.dueOn) : null,
              daysOverdue,
              // Rule-derived, so the tone matches the clock even if the
              // stored level has not been swept yet.
              escalationLevel: Math.max(1, effectiveEscalationLevel(obligation, today)),
            },
            clauseExcerpt,
          }),
        },
      ],
      {
        tier: "light",
        purpose: "draftEscalationLetter",
        projectId: obligation.projectId,
        maxTokens: 2000,
      }
    );
    return { letter: letter.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
