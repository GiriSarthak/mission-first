"use server";

import { db } from "@/lib/db";
import { complete } from "@/lib/ai/client";
import {
  answerFromDocumentsPrompt,
  extractKeywords,
} from "@/lib/ai/prompts/answer-from-documents";
import { getAuthorizedProject } from "@/lib/auth/authorize";

/**
 * §7.5 — chat without an upload answers from stored DocumentPage text:
 * SQLite LIKE search on 2–4 extracted keywords, top ~10 pages, page citations
 * required in the answer.
 */
export async function sendChatMessage(
  projectId: string,
  text: string
): Promise<void> {
  const question = text.trim();
  if (!question) return;
  await getAuthorizedProject(projectId, "VIEW_PROJECT");

  await db.chatMessage.create({
    data: { projectId, role: "USER", content: question },
  });

  try {
    const keywords = extractKeywords(question);
    const matches =
      keywords.length === 0
        ? []
        : await db.documentPage.findMany({
            where: {
              document: { projectId },
              OR: keywords.map((k) => ({ text: { contains: k } })),
            },
            include: { document: { select: { filename: true } } },
            take: 200,
          });

    // rank by how many distinct keywords each page hits, then by page order
    const scored = matches
      .map((m) => ({
        m,
        score: keywords.filter((k) => m.text.toLowerCase().includes(k)).length,
      }))
      .sort((a, b) => b.score - a.score || a.m.pageNumber - b.m.pageNumber)
      .slice(0, 10);

    if (scored.length === 0) {
      await db.chatMessage.create({
        data: {
          projectId,
          role: "ASSISTANT",
          content:
            "I couldn't find anything in the stored document text for that. Upload and process the relevant document first, or rephrase with terms from the tender.",
        },
      });
      return;
    }

    const answer = await complete(
      [
        {
          role: "user",
          content: answerFromDocumentsPrompt({
            question,
            passages: scored.map(({ m }) => ({
              filename: m.document.filename,
              pageNumber: m.pageNumber,
              text: m.text,
            })),
          }),
        },
      ],
      { tier: "light", purpose: "answerFromDocuments", projectId, maxTokens: 2000 }
    );

    await db.chatMessage.create({
      data: { projectId, role: "ASSISTANT", content: answer.trim() },
    });
  } catch (err) {
    await db.chatMessage.create({
      data: {
        projectId,
        role: "ASSISTANT",
        content: `Sorry — answering failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
  }
}
