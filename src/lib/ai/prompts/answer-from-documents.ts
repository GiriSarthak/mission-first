/** §7.5 — light model. Q&A over stored DocumentPage text with page citations. */

const STOPWORDS = new Set([
  "the", "and", "for", "are", "with", "that", "this", "from", "what", "when",
  "where", "which", "does", "how", "why", "who", "shall", "will", "must",
  "have", "has", "was", "were", "been", "being", "into", "about", "there",
  "their", "they", "them", "than", "then", "would", "could", "should", "can",
  "please", "tell", "give", "show", "many", "much", "any", "all", "per",
  "under", "over", "after", "before", "within", "days", "page", "clause",
  "document", "tender", "contract", "work", "works",
]);

/** Deterministic 2–4 keyword extraction for the SQLite LIKE search. */
export function extractKeywords(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  // prefer longer (more specific) words, keep original order among picks
  const unique = [...new Set(words)];
  const picked = unique
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w.length - a.w.length)
    .slice(0, 4)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.w);
  return picked.slice(0, Math.max(2, Math.min(4, picked.length)));
}

export function answerFromDocumentsPrompt(input: {
  question: string;
  passages: Array<{ filename: string; pageNumber: number; text: string }>;
}): string {
  const body = input.passages
    .map(
      (p) =>
        `--- ${p.filename}, page ${p.pageNumber} ---\n${p.text.slice(0, 3000)}`
    )
    .join("\n\n");
  return [
    `Answer the user's question using ONLY the tender document passages below.`,
    `Cite pages inline for every claim, in the form (Tendernotice_2.pdf p.42) or (p.42) when the file is obvious.`,
    `If the passages do not contain the answer, say so plainly — do not guess.`,
    `Keep the answer under 150 words, plain prose, no markdown headings.`,
    ``,
    `Passages:`,
    body,
    ``,
    `Question: ${input.question}`,
  ].join("\n");
}
