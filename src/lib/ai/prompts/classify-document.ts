import { z } from "zod";
import { DOC_TYPES } from "@/lib/enums";

export const ClassifyDocumentSchema = z.object({
  docType: z.enum(DOC_TYPES),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type ClassifyDocumentResult = z.infer<typeof ClassifyDocumentSchema>;

/**
 * §7.1 — light model. User description + first pages of text (text-layer
 * docs), or the first chunk as a document block (scanned docs).
 */
export function classifyDocumentPrompt(input: {
  filename: string;
  userDescription: string | null;
  firstPagesText: string | null; // null for scanned docs (document block attached instead)
}): string {
  return [
    `You are classifying one document from a government EPC tender bundle.`,
    ``,
    `Filename: ${input.filename}`,
    input.userDescription ? `User description: ${input.userDescription}` : null,
    input.firstPagesText
      ? `First pages of extracted text:\n"""\n${input.firstPagesText.slice(0, 8000)}\n"""`
      : `The first pages of the document are attached as a PDF.`,
    ``,
    `Classify it as exactly one of: ${DOC_TYPES.join(", ")}.`,
    `- TENDER_NIT: notice inviting tender, bid instructions, eligibility, EMD`,
    `- GCC: general conditions of contract; SCC: special/additional conditions`,
    `- SOW: scope of work; BOQ: bill of quantities / price schedules`,
    `- TECH_SPEC: technical specifications, equipment parameters, drawing lists`,
    `- DRAWING: drawings; CORRESPONDENCE: letters; OTHER: none of the above`,
    `If the document bundles several parts (NIT + GCC + specs), pick the type of the leading part.`,
    ``,
    `Respond with ONLY this JSON, no prose:`,
    `{"docType": "...", "confidence": 0.0-1.0, "reasoning": "one sentence"}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
