import { z } from "zod";
import { PHASE_KEYS } from "@/lib/enums";

/** §7.2 — one extracted item; page numbers are always absolute. */
export const ExtractedItemSchema = z.object({
  entityType: z.enum(["CHECKLIST_ITEM", "OBLIGATION", "ACTIVITY"]),
  phaseKey: z.enum(PHASE_KEYS).nullish(),
  title: z.string().min(3),
  description: z.string().nullish(),
  clause: z.string().nullish(),
  page: z.number().int().min(1),
  owedBy: z.enum(["AGENCY", "VENDOR"]).nullish(),
  stipulatedDays: z.number().int().positive().nullish(),
  dueDateHint: z.string().nullish(),
  durationDays: z.number().positive().nullish(), // ACTIVITY only
  confidence: z.number().min(0).max(1),
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

export const ExtractRequirementsSchema = z.object({
  items: z.array(ExtractedItemSchema),
});
export type ExtractRequirementsResult = z.infer<typeof ExtractRequirementsSchema>;

/** Scanned chunks answer transcription + extraction in one call. */
export const ScannedChunkSchema = z.object({
  pages: z.array(
    z.object({
      page: z.number().int().min(1), // absolute page number
      text: z.string(),
    })
  ),
  items: z.array(ExtractedItemSchema),
});
export type ScannedChunkResult = z.infer<typeof ScannedChunkSchema>;

const EXTRACTION_RULES = `
Extract every actionable requirement into one of three entity types:
- CHECKLIST_ITEM: something the CONTRACTOR/vendor must do or submit. Set
  phaseKey: PRE_BID (eligibility, EMD, clarifications, pre-bid meeting),
  BID_SUBMISSION (bid format, covers, submission), POST_AWARD (agreement,
  performance security, registrations, documents due after LOA), SOW (scope
  elements to deliver), EXECUTION (obligations during the works: registers,
  bills, notices, EOT requests), CLOSEOUT (completion, handover, defect
  liability).
- OBLIGATION: something owed BY one party TO the other that must be requested,
  supplied or approved (site handover, drawings approval, agency-supplied
  equipment, EOT responses, payments). Set owedBy: AGENCY when the government
  agency owes it, VENDOR otherwise.
- ACTIVITY: a physical or engineering work package with a duration that belongs
  on the construction schedule. Set durationDays when the text states one.

Rules:
- PREFER time-bound clauses: "within N days", "prior to", "shall submit",
  "not later than". Set stipulatedDays when a day count is stated; put any
  other timing language in dueDateHint verbatim.
- ALWAYS cite the clause number when the text shows one (e.g. "GTC 19.3",
  "30.5", "Clause 22.5(b)"). Leave clause null when none is visible.
- "page" is the ABSOLUTE page number in the full document, as instructed below.
- Titles are short and specific (max ~90 chars); details go in description.
- Skip boilerplate with no action (definitions, headings, legal generalities).
- confidence: your certainty this is a real, correctly-classified requirement.
`;

/** §7.2 — heavy model, one call per ≤ ~40-page section of a text-layer doc. */
export function extractRequirementsPrompt(input: {
  sectionLabel: string;
  pages: Array<{ pageNumber: number; text: string }>;
}): string {
  const body = input.pages
    .map((p) => `=== PAGE ${p.pageNumber} ===\n${p.text}`)
    .join("\n\n");
  return [
    `You are analysing the section "${input.sectionLabel}" of a government EPC tender document.`,
    `Each page below is preceded by its ABSOLUTE page number; use those exact numbers in "page".`,
    EXTRACTION_RULES,
    `Document section:`,
    `"""`,
    body,
    `"""`,
    ``,
    `Respond with ONLY this JSON, no prose, no markdown fences:`,
    `{"items": [{"entityType": "...", "phaseKey": null, "title": "...", "description": null, "clause": null, "page": 1, "owedBy": null, "stipulatedDays": null, "dueDateHint": null, "durationDays": null, "confidence": 0.9}, ...]}`,
  ].join("\n");
}

/** §7.2 scanned path — heavy model, one call per ≤ 20-page PDF chunk. */
export function scannedChunkPrompt(input: {
  filename: string;
  userDescription: string | null;
  firstPageNumber: number; // absolute number of the chunk's first page
  pageCount: number;
}): string {
  const last = input.firstPageNumber + input.pageCount - 1;
  return [
    `The attached PDF is pages ${input.firstPageNumber}–${last} of the scanned tender document "${input.filename}".`,
    input.userDescription ? `User description of the document: ${input.userDescription}` : null,
    ``,
    `Do BOTH of the following in one response:`,
    `1. TRANSCRIBE each page's visible text, preserving tables as readable lines.`,
    `   PDF page 1 of the attachment is ABSOLUTE page ${input.firstPageNumber}; number every page absolutely.`,
    `2. EXTRACT requirements from those pages.`,
    EXTRACTION_RULES,
    `Respond with ONLY this JSON, no prose, no markdown fences:`,
    `{"pages": [{"page": ${input.firstPageNumber}, "text": "..."}, ...], "items": [...]}`,
    `Items use the same fields as: {"entityType": "...", "phaseKey": null, "title": "...", "description": null, "clause": null, "page": ${input.firstPageNumber}, "owedBy": null, "stipulatedDays": null, "dueDateHint": null, "durationDays": null, "confidence": 0.9}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
