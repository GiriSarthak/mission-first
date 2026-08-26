/**
 * Milestone 8 — AI extraction pipeline (BRIEF §7.1–7.3).
 *
 * PROCESS_DOCUMENT (per upload/reprocess): extract text, classify, post the
 * chat acknowledgement, create the changeset shell, then enqueue one
 * EXTRACT_UNIT job per section (text docs, ≤ ~40 pages) or per ≤ 20-page chunk
 * (scanned docs), followed by one FINALIZE_EXTRACTION job. Jobs drain FIFO, so
 * finalize runs last: it dedupes, optionally proposes activities, writes the
 * summary, and posts the review-card chat message.
 */
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { readDocumentFile } from "@/lib/storage";
import { completeJson } from "@/lib/ai/client";
import {
  classifyDocumentPrompt,
  ClassifyDocumentSchema,
} from "@/lib/ai/prompts/classify-document";
import {
  extractRequirementsPrompt,
  ExtractRequirementsSchema,
  scannedChunkPrompt,
  ScannedChunkSchema,
  type ExtractedItem,
} from "@/lib/ai/prompts/extract-requirements";
import {
  proposeActivitiesPrompt,
  ProposeActivitiesSchema,
} from "@/lib/ai/prompts/propose-activities";
import { processDocumentText } from "@/lib/jobs/process-document";

const MAX_TEXT_PAGES_PER_CALL = 40;
const MAX_SCANNED_PAGES_PER_CHUNK = 18; // comfortably under the API's page limits

export type ExtractionUnit =
  | { kind: "TEXT_SECTION"; label: string; startPage: number; endPage: number }
  | { kind: "SCANNED_CHUNK"; startPage: number; endPage: number };

// ---------------------------------------------------------------------------
// Stage 1 — PROCESS_DOCUMENT
// ---------------------------------------------------------------------------

export async function startDocumentPipeline(
  documentId: string,
  jobId: string
): Promise<void> {
  const extracted = await processDocumentText(documentId);
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });

  // --- classify (light model) ---
  let classification = null;
  try {
    if (doc.isScanned) {
      const b64 = await subPdfBase64(doc.storagePath, 0, Math.min(3, extracted.pageCount));
      classification = await completeJson(
        ClassifyDocumentSchema,
        [
          {
            role: "user",
            content: classifyDocumentPrompt({
              filename: doc.filename,
              userDescription: doc.userDescription,
              firstPagesText: null,
            }),
          },
        ],
        {
          tier: "light",
          purpose: "classifyDocument",
          projectId: doc.projectId,
          jobId,
          documentBase64: b64,
        }
      );
    } else {
      classification = await completeJson(
        ClassifyDocumentSchema,
        [
          {
            role: "user",
            content: classifyDocumentPrompt({
              filename: doc.filename,
              userDescription: doc.userDescription,
              firstPagesText: extracted.pages.slice(0, 3).join("\n\n"),
            }),
          },
        ],
        { tier: "light", purpose: "classifyDocument", projectId: doc.projectId, jobId }
      );
    }
    await db.document.update({
      where: { id: documentId },
      data: { docType: classification.docType },
    });
  } catch {
    // classification is best-effort; extraction continues with the current type
  }

  await db.chatMessage.create({
    data: {
      projectId: doc.projectId,
      role: "ASSISTANT",
      documentId,
      content: classification
        ? `Received ${doc.filename} — ${extracted.pageCount} pages, ${
            extracted.isScanned ? "scanned (no text layer); pages will be transcribed during extraction" : "text layer detected"
          }. Looks like ${classification.docType} (${Math.round(classification.confidence * 100)}%): ${classification.reasoning} You can correct the type in the document table. Extraction started.`
        : `Received ${doc.filename} — ${extracted.pageCount} pages. Extraction started.`,
    },
  });

  // --- changeset shell + work units ---
  const changeset = await db.changeset.create({
    data: {
      projectId: doc.projectId,
      documentId,
      status: "PROPOSED",
      summary: "Extraction in progress…",
    },
  });

  const units: ExtractionUnit[] = doc.isScanned
    ? chunkRange(1, extracted.pageCount, MAX_SCANNED_PAGES_PER_CHUNK).map(
        ([s, e]) => ({ kind: "SCANNED_CHUNK" as const, startPage: s, endPage: e })
      )
    : splitTextSections(extracted.pages).flatMap((sec) =>
        chunkRange(sec.startPage, sec.endPage, MAX_TEXT_PAGES_PER_CALL).map(
          ([s, e]) => ({
            kind: "TEXT_SECTION" as const,
            label: sec.label,
            startPage: s,
            endPage: e,
          })
        )
      );

  for (const unit of units) {
    await db.job.create({
      data: {
        projectId: doc.projectId,
        type: "EXTRACT_UNIT",
        payload: JSON.stringify({ documentId, changesetId: changeset.id, unit }),
      },
    });
  }
  await db.job.create({
    data: {
      projectId: doc.projectId,
      type: "FINALIZE_EXTRACTION",
      payload: JSON.stringify({ documentId, changesetId: changeset.id }),
    },
  });
}

// ---------------------------------------------------------------------------
// Stage 2 — EXTRACT_UNIT
// ---------------------------------------------------------------------------

export async function runExtractionUnit(
  payload: { documentId: string; changesetId: string; unit: ExtractionUnit },
  jobId: string
): Promise<void> {
  const { documentId, changesetId, unit } = payload;
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });

  let items: ExtractedItem[] = [];

  if (unit.kind === "TEXT_SECTION") {
    const pages = await db.documentPage.findMany({
      where: {
        documentId,
        pageNumber: { gte: unit.startPage, lte: unit.endPage },
      },
      orderBy: { pageNumber: "asc" },
    });
    if (pages.length === 0) return;
    const result = await completeJson(
      ExtractRequirementsSchema,
      [
        {
          role: "user",
          content: extractRequirementsPrompt({
            sectionLabel: unit.label,
            pages: pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
          }),
        },
      ],
      { tier: "heavy", purpose: "extractRequirements", projectId: doc.projectId, jobId, maxTokens: 32000 }
    );
    items = result.items;
  } else {
    const b64 = await subPdfBase64(doc.storagePath, unit.startPage - 1, unit.endPage);
    const result = await completeJson(
      ScannedChunkSchema,
      [
        {
          role: "user",
          content: scannedChunkPrompt({
            filename: doc.filename,
            userDescription: doc.userDescription,
            firstPageNumber: unit.startPage,
            pageCount: unit.endPage - unit.startPage + 1,
          }),
        },
      ],
      {
        tier: "heavy",
        purpose: "extractScannedChunk",
        projectId: doc.projectId,
        jobId,
        documentBase64: b64,
        maxTokens: 64000,
      }
    );
    // store the transcription so citations and chat Q&A work
    for (const p of result.pages) {
      if (p.page < unit.startPage || p.page > unit.endPage || !p.text.trim()) continue;
      await db.documentPage.upsert({
        where: { documentId_pageNumber: { documentId, pageNumber: p.page } },
        create: { documentId, pageNumber: p.page, text: p.text },
        update: { text: p.text },
      });
    }
    items = result.items;
  }

  for (const item of items) {
    await db.changesetItem.create({
      data: {
        changesetId,
        entityType: item.entityType,
        payload: JSON.stringify(item),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Stage 3 — FINALIZE_EXTRACTION
// ---------------------------------------------------------------------------

export async function finalizeExtraction(payload: {
  documentId: string;
  changesetId: string;
}): Promise<void> {
  const { documentId, changesetId } = payload;
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });

  // --- dedupe by normalised title within entity type (keep first) ---
  const items = await db.changesetItem.findMany({
    where: { changesetId },
    orderBy: { id: "asc" },
  });
  const seen = new Set<string>();
  const toDelete: string[] = [];
  for (const item of items) {
    const p = JSON.parse(item.payload) as ExtractedItem;
    const key = `${item.entityType}:${normalizeTitle(p.title)}`;
    if (seen.has(key)) toDelete.push(item.id);
    else seen.add(key);
  }
  if (toDelete.length) {
    await db.changesetItem.deleteMany({ where: { id: { in: toDelete } } });
  }

  // --- optional WBS proposal when the doc is scope-ish and extraction found
  //     few schedule activities (§7.3) ---
  let remaining = await db.changesetItem.findMany({ where: { changesetId } });
  const activityCount = remaining.filter((i) => i.entityType === "ACTIVITY").length;
  const scopeish = ["SOW", "TECH_SPEC", "TENDER_NIT"].includes(doc.docType);
  if (scopeish && activityCount < 3) {
    try {
      const scopePages = await db.documentPage.findMany({
        where: { documentId },
        orderBy: { pageNumber: "asc" },
      });
      const scopeText = pickScopeText(scopePages);
      if (scopeText.length > 500) {
        const project = await db.project.findUniqueOrThrow({ where: { id: doc.projectId } });
        const existing = await db.activity.findMany({
          where: { projectId: doc.projectId },
          select: { code: true },
        });
        const proposal = await completeJson(
          ProposeActivitiesSchema,
          [
            {
              role: "user",
              content: proposeActivitiesPrompt({
                scopeText,
                contractDurationDays: project.contractDurationDays,
                existingCodes: existing.map((a) => a.code),
              }),
            },
          ],
          { tier: "heavy", purpose: "proposeActivities", projectId: doc.projectId }
        );
        for (const a of proposal.activities) {
          await db.changesetItem.create({
            data: {
              changesetId,
              entityType: "ACTIVITY",
              payload: JSON.stringify({
                entityType: "ACTIVITY",
                title: a.name,
                page: a.page ?? 1,
                clause: a.clause,
                durationDays: a.mostLikely,
                confidence: 0.7,
                code: a.code,
                optimistic: a.optimistic,
                pessimistic: a.pessimistic,
                dependsOnCodes: a.dependsOnCodes,
              }),
            },
          });
        }
      }
    } catch {
      // WBS proposal is best-effort; the changeset stands without it
    }
  }

  remaining = await db.changesetItem.findMany({ where: { changesetId } });
  const counts = {
    CHECKLIST_ITEM: 0,
    OBLIGATION: 0,
    ACTIVITY: 0,
    INSIGHT: 0,
  } as Record<string, number>;
  for (const i of remaining) counts[i.entityType] = (counts[i.entityType] ?? 0) + 1;

  const failedUnits = await db.job.count({
    where: {
      type: "EXTRACT_UNIT",
      status: "FAILED",
      payload: { contains: changesetId },
    },
  });

  const agencyObligations = remaining.filter((i) => {
    if (i.entityType !== "OBLIGATION") return false;
    const p = JSON.parse(i.payload) as ExtractedItem;
    return p.owedBy === "AGENCY";
  }).length;

  const summary =
    `Found ${counts.CHECKLIST_ITEM} checklist requirement${counts.CHECKLIST_ITEM === 1 ? "" : "s"}, ` +
    `${counts.OBLIGATION} obligation${counts.OBLIGATION === 1 ? "" : "s"} (${agencyObligations} owed by the agency), ` +
    `${counts.ACTIVITY} schedule activit${counts.ACTIVITY === 1 ? "y" : "ies"}` +
    (failedUnits > 0 ? ` — ${failedUnits} section(s) failed and were skipped` : "");

  await db.changeset.update({
    where: { id: changesetId },
    data: { summary },
  });
  await db.document.update({
    where: { id: documentId },
    data: { processingStatus: "DONE" },
  });

  if (remaining.length === 0) {
    await db.changeset.update({
      where: { id: changesetId },
      data: { status: "REJECTED", summary: "Nothing extractable found." },
    });
    await db.chatMessage.create({
      data: {
        projectId: doc.projectId,
        role: "ASSISTANT",
        documentId,
        content: `Processing of ${doc.filename} finished, but nothing extractable was found${failedUnits ? ` (${failedUnits} section(s) failed)` : ""}.`,
      },
    });
    return;
  }

  await db.chatMessage.create({
    data: {
      projectId: doc.projectId,
      role: "ASSISTANT",
      documentId,
      changesetId,
      content: `${doc.filename}: ${summary}. Review the proposed items below — nothing is applied until you accept.`,
    },
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function chunkRange(start: number, end: number, size: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let s = start; s <= end; s += size) {
    out.push([s, Math.min(end, s + size - 1)]);
  }
  return out;
}

const SECTION_PATTERNS: Array<[RegExp, string]> = [
  [/GENERAL\s+TERMS\s+AND\s+CONDITIONS/i, "General Terms and Conditions"],
  [/ADDITIONAL\s+TERMS\s*(?:&|AND)\s*CONDITIONS/i, "Additional Terms & Conditions"],
  [/TECHNICAL\s+SPECIFICATIONS?/i, "Technical Specifications"],
  [/ANNEXURE[\s-]*[IVXLC0-9]+/i, "Annexures"],
];

/** Splits a text-layer document into labelled sections on detected headings. */
export function splitTextSections(
  pages: string[] // index 0 = page 1
): Array<{ label: string; startPage: number; endPage: number }> {
  const boundaries: Array<{ page: number; label: string }> = [];
  for (let i = 0; i < pages.length; i++) {
    const head = pages[i].slice(0, 600);
    for (const [re, label] of SECTION_PATTERNS) {
      if (re.test(head)) {
        if (boundaries.length === 0 || boundaries[boundaries.length - 1].label !== label) {
          boundaries.push({ page: i + 1, label });
        }
        break;
      }
    }
  }
  const sections: Array<{ label: string; startPage: number; endPage: number }> = [];
  if (boundaries.length === 0 || boundaries[0].page > 1) {
    sections.push({
      label: "NIT & Bid Instructions",
      startPage: 1,
      endPage: boundaries.length ? boundaries[0].page - 1 : pages.length,
    });
  }
  for (let i = 0; i < boundaries.length; i++) {
    sections.push({
      label: boundaries[i].label,
      startPage: boundaries[i].page,
      endPage: i + 1 < boundaries.length ? boundaries[i + 1].page - 1 : pages.length,
    });
  }
  return sections.filter((s) => s.endPage >= s.startPage);
}

function pickScopeText(
  pages: Array<{ pageNumber: number; text: string }>
): string {
  const sections = splitTextSections(
    Array.from(
      { length: Math.max(0, ...pages.map((p) => p.pageNumber)) },
      (_, i) => pages.find((p) => p.pageNumber === i + 1)?.text ?? ""
    )
  );
  const tech = sections.find((s) => s.label === "Technical Specifications");
  const range = tech ?? sections[sections.length - 1];
  if (!range) return "";
  return pages
    .filter((p) => p.pageNumber >= range.startPage && p.pageNumber <= range.endPage)
    .slice(0, 45)
    .map((p) => `=== PAGE ${p.pageNumber} ===\n${p.text}`)
    .join("\n\n");
}

/** Base64 of a page range [startIndex, endExclusive) as its own PDF. */
async function subPdfBase64(
  storagePath: string,
  startIndex: number,
  endExclusive: number
): Promise<string> {
  const buffer = await readDocumentFile(storagePath);
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const indices = Array.from(
    { length: Math.min(endExclusive, src.getPageCount()) - startIndex },
    (_, i) => startIndex + i
  );
  const copied = await out.copyPages(src, indices);
  for (const p of copied) out.addPage(p);
  const bytes = await out.save();
  return Buffer.from(bytes).toString("base64");
}
