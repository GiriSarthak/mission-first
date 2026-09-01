import { z } from "zod";

export const DelayCostInsightSchema = z.object({
  title: z.string().min(5).max(120),
  body: z.string().min(10),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
});
export type DelayCostInsightResult = z.infer<typeof DelayCostInsightSchema>;

export type DelayCostNarrationInput = {
  delayDays: number;
  contractFinishDate: string;
  forecastFinishDate: string;
  ldExposureFormatted: string;
  ldCapFormatted: string;
  ldCapReached: boolean;
  ldWeeklyRatePct: number;
  ldCapPct: number;
  agencyAttributableDays: number;
  vendorAttributableDays: number;
  agencyAttributablePct: number;
  drivers: Array<{ title: string; overdueDays: number; attributedDays: number }>;
};

/**
 * Phase 2 Part B — light model. Every figure below is computed by
 * src/lib/analysis/delayCost.ts; the model writes one or two sentences the way
 * a project controls officer would, and must not recompute anything.
 */
export function delayCostInsightPrompt(input: DelayCostNarrationInput): string {
  return [
    `You are a project controls officer writing one short entry for the`,
    `project's insights register on an EPC contract.`,
    ``,
    `THESE FIGURES ARE AUTHORITATIVE. They come from a deterministic scheduling`,
    `and liquidated-damages engine. Do NOT recompute, re-derive, round`,
    `differently, or contradict them. Use them exactly as written.`,
    ``,
    JSON.stringify(input, null, 1),
    ``,
    `Notes on the figures:`,
    `- Liquidated damages accrue at ${input.ldWeeklyRatePct}% of contract value per week of delay, capped at ${input.ldCapPct}%.`,
    `- "Agency-attributable" days are days of the current delay traced to overdue`,
    `  agency deliverables that block an activity on the critical path. It is an`,
    `  allocation for management attention, not a legal determination of liability —`,
    `  write it that way: factual, no blame language, no legal conclusions.`,
    ``,
    `Write:`,
    `- title: one specific sentence fragment, max ~90 characters`,
    `- body: ONE or TWO sentences quoting the delay, the split, and the exposure`,
    `  against the cap, ending with the single most useful next action.`,
    `- severity: CRITICAL if the LD cap is reached or the delay is large and`,
    `  growing; WARNING if there is real exposure; INFO if there is no delay.`,
    ``,
    `Respond with ONLY this JSON, no prose:`,
    `{"title": "...", "body": "...", "severity": "WARNING"}`,
  ].join("\n");
}
