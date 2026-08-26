/**
 * Document processing job (milestone 7 scope): per-page text extraction with
 * unpdf, scanned detection (< ~50 chars/page on average). Milestone 8 adds the
 * AI extraction paths (text sections and scanned chunks) on top of this.
 */
import { extractText, getDocumentProxy } from "unpdf";
import { db } from "@/lib/db";
import { readDocumentFile } from "@/lib/storage";

export const SCANNED_CHARS_PER_PAGE_THRESHOLD = 50;

export type ExtractedPdf = {
  pageCount: number;
  pages: string[]; // index 0 = page 1
  isScanned: boolean;
};

export async function extractPdfText(buffer: Buffer): Promise<ExtractedPdf> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.from({ length: totalPages }, (_, i) => (text[i] ?? "").trim());
  const totalChars = pages.reduce((s, p) => s + p.length, 0);
  const isScanned =
    totalPages > 0 && totalChars / totalPages < SCANNED_CHARS_PER_PAGE_THRESHOLD;
  return { pageCount: totalPages, pages, isScanned };
}

/**
 * Extracts and stores page text for a document, updating its status. Returns
 * the extraction result so follow-on steps (AI extraction, milestone 8) can
 * reuse it without re-parsing.
 */
export async function processDocumentText(documentId: string): Promise<ExtractedPdf> {
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });
  const buffer = await readDocumentFile(doc.storagePath);
  const extracted = await extractPdfText(buffer);

  await db.documentPage.deleteMany({ where: { documentId } });
  if (!extracted.isScanned) {
    // store per-page text; scanned docs get their text from the AI
    // transcription pass (milestone 8)
    for (let i = 0; i < extracted.pages.length; i++) {
      if (extracted.pages[i]) {
        await db.documentPage.create({
          data: { documentId, pageNumber: i + 1, text: extracted.pages[i] },
        });
      }
    }
  }

  await db.document.update({
    where: { id: documentId },
    data: {
      pageCount: extracted.pageCount,
      isScanned: extracted.isScanned,
    },
  });

  return extracted;
}
