import { z } from "zod";

export const ProposedActivitySchema = z.object({
  code: z.string().min(2), // e.g. "P010"
  name: z.string().min(3),
  mostLikely: z.number().positive(), // days
  optimistic: z.number().positive().nullish(),
  pessimistic: z.number().positive().nullish(),
  dependsOnCodes: z.array(z.string()).default([]), // FS predecessors, by code
  page: z.number().int().min(1).nullish(),
  clause: z.string().nullish(),
});

export const ProposeActivitiesSchema = z.object({
  activities: z.array(ProposedActivitySchema),
});
export type ProposeActivitiesResult = z.infer<typeof ProposeActivitiesSchema>;

/** §7.3 — heavy model. WBS proposal from scope text + contract duration. */
export function proposeActivitiesPrompt(input: {
  scopeText: string;
  contractDurationDays: number | null;
  existingCodes: string[];
}): string {
  return [
    `You are planning the construction schedule for a government EPC contract.`,
    input.contractDurationDays
      ? `The contract completion period is ${input.contractDurationDays} days.`
      : null,
    input.existingCodes.length
      ? `Codes already in use (do NOT reuse): ${input.existingCodes.join(", ")}`
      : null,
    ``,
    `Scope of work text (page numbers marked where known):`,
    `"""`,
    input.scopeText.slice(0, 60_000),
    `"""`,
    ``,
    `Propose a work breakdown of 8–18 schedule activities covering the scope:`,
    `mobilisation, survey/design, approvals, procurement, civil works, erection,`,
    `cabling/earthing, testing, trial run, commissioning — as applicable to THIS scope.`,
    `- code: "P010", "P020", ... (P-prefix, increments of 10, none from the used list)`,
    `- mostLikely duration in days; add optimistic/pessimistic when you can justify a range`,
    `- dependsOnCodes: finish-to-start predecessors among YOUR proposed codes only`,
    `- durations must sum plausibly against the completion period on the longest path`,
    `- cite page when a scope element appears on a specific page`,
    ``,
    `Respond with ONLY this JSON, no prose:`,
    `{"activities": [{"code": "P010", "name": "...", "mostLikely": 30, "optimistic": null, "pessimistic": null, "dependsOnCodes": [], "page": null, "clause": null}, ...]}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
