/** §7.6 — light model. Formal escalation correspondence, draft only. */
export function escalationLetterPrompt(input: {
  projectName: string;
  tenderRef: string;
  agencyName: string;
  obligation: {
    title: string;
    description: string | null;
    contractClause: string | null;
    requestedOn: string | null; // formatted
    dueOn: string | null;
    daysOverdue: number;
    escalationLevel: number;
  };
  clauseExcerpt: string | null;
}): string {
  const o = input.obligation;
  const tone =
    o.escalationLevel >= 3
      ? "final notice before invoking contractual remedies (extension of time and cost claims); firm and formal"
      : o.escalationLevel === 2
        ? "strong follow-up noting schedule impact and reserving contractual rights"
        : "polite but firm first reminder";
  return [
    `Draft a formal escalation letter from the contractor to the government agency for an EPC contract.`,
    ``,
    `Context:`,
    `- Project: ${input.projectName}`,
    `- Tender ref: ${input.tenderRef}`,
    `- Agency (addressee): ${input.agencyName}`,
    `- Pending deliverable owed by the agency: ${o.title}`,
    o.description ? `- Detail: ${o.description}` : null,
    o.contractClause ? `- Contract clause: ${o.contractClause}` : null,
    o.requestedOn ? `- Requested on: ${o.requestedOn}` : null,
    o.dueOn ? `- Due on: ${o.dueOn}` : null,
    o.daysOverdue > 0 ? `- Days overdue: ${o.daysOverdue}` : null,
    `- Escalation level: ${o.escalationLevel} of 3 — tone: ${tone}`,
    input.clauseExcerpt
      ? `- Relevant contract text (quote sparingly):\n"""\n${input.clauseExcerpt.slice(0, 2500)}\n"""`
      : null,
    ``,
    `Requirements:`,
    `- Standard Indian business-letter format: subject line with tender ref${o.contractClause ? " and clause" : ""}, salutation, 3–4 short paragraphs, closing.`,
    `- Cite the clause${o.contractClause ? ` (${o.contractClause})` : ""} where obligations and timelines are stated.`,
    `- State the facts (dates, days pending) exactly as given above — do not invent dates or amounts.`,
    `- Note the impact on the works programme and request action within a stated number of days appropriate to the escalation level.`,
    `- Use placeholders [Name], [Designation] for signature details. No markdown — plain letter text only.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
