import { z } from "zod";

export const GeneratedInsightSchema = z.object({
  title: z.string().min(5).max(120),
  body: z.string().min(10),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
  category: z.enum(["SCHEDULE", "COMPLIANCE", "OBLIGATION", "DOCUMENT"]),
  relatedEntityType: z.enum(["OBLIGATION", "CHECKLIST_ITEM", "ACTIVITY"]).nullish(),
  relatedEntityId: z.string().nullish(), // must be an id present in the snapshot
  sourcePage: z.number().int().min(1).nullish(),
});

export const GenerateInsightsSchema = z.object({
  insights: z.array(GeneratedInsightSchema).max(8),
});
export type GenerateInsightsResult = z.infer<typeof GenerateInsightsSchema>;

/**
 * §7.4 — heavy model. The snapshot is computed by the deterministic schedule
 * engine and DB queries; the model narrates and prioritises, never computes.
 */
export function generateInsightsPrompt(snapshotJson: string): string {
  return [
    `You are the project-controls analyst for a government EPC contract.`,
    `Below is a machine-generated snapshot of the project. ALL NUMBERS IN THE`,
    `SNAPSHOT ARE AUTHORITATIVE — computed by a deterministic scheduling engine.`,
    `Do NOT recompute, re-derive, or alter any number; quote them as given.`,
    ``,
    `Snapshot:`,
    snapshotJson,
    ``,
    `Produce at most 8 insights the project manager should act on, ordered most`,
    `important first. Focus on: overdue agency obligations (especially any that`,
    `gate critical-path work), critical-path slippage and low-float activities,`,
    `finish variance and on-time probability, blocked or overdue checklist`,
    `items, and compliance gaps. Each insight:`,
    `- title: one specific sentence fragment (max ~90 chars), no fluff`,
    `- body: 1–2 sentences with the concrete numbers from the snapshot and a`,
    `  recommended next action`,
    `- severity: CRITICAL only for direct threats to contract finish or`,
    `  contractual deadlines already breached; WARNING for emerging risks;`,
    `  INFO otherwise`,
    `- relatedEntityType/relatedEntityId: set them to an id from the snapshot`,
    `  when the insight is about one specific record, else null`,
    `- sourcePage: page number if the snapshot lists one for that record`,
    ``,
    `Respond with ONLY this JSON, no prose:`,
    `{"insights": [{"title": "...", "body": "...", "severity": "WARNING", "category": "SCHEDULE", "relatedEntityType": null, "relatedEntityId": null, "sourcePage": null}, ...]}`,
  ].join("\n");
}
