/**
 * Minimal background processing (BRIEF §2): a Job table drained one job at a
 * time by POST /api/jobs/run, which the Documents page polls while anything is
 * processing. No queue infrastructure.
 */
import { db } from "@/lib/db";
import { processDocumentText } from "@/lib/jobs/process-document";

export type RunResult =
  | { processed: false }
  | { processed: true; jobId: string; type: string; status: "DONE" | "FAILED"; error?: string };

export async function runNextJob(): Promise<RunResult> {
  const job = await db.job.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return { processed: false };

  await db.job.update({ where: { id: job.id }, data: { status: "RUNNING" } });
  try {
    await dispatch(job.type, job.payload, job.id, job.projectId);
    await db.job.update({ where: { id: job.id }, data: { status: "DONE" } });
    return { processed: true, jobId: job.id, type: job.type, status: "DONE" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.job.update({
      where: { id: job.id },
      data: { status: "FAILED", error: message },
    });
    await onJobFailed(job.type, job.payload, message);
    return { processed: true, jobId: job.id, type: job.type, status: "FAILED", error: message };
  }
}

async function dispatch(
  type: string,
  payloadJson: string,
  jobId: string,
  projectId: string
): Promise<void> {
  const payload = JSON.parse(payloadJson || "{}") as Record<string, unknown>;
  switch (type) {
    case "PROCESS_DOCUMENT": {
      const documentId = String(payload.documentId ?? "");
      await db.document.update({
        where: { id: documentId },
        data: { processingStatus: "PROCESSING", processingError: null },
      });
      await processDocumentText(documentId);
      // Milestone 8 extends this job with AI extraction + changeset creation.
      await db.document.update({
        where: { id: documentId },
        data: { processingStatus: "DONE" },
      });
      void jobId;
      void projectId;
      return;
    }
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}

async function onJobFailed(type: string, payloadJson: string, message: string): Promise<void> {
  if (type === "PROCESS_DOCUMENT") {
    const payload = JSON.parse(payloadJson || "{}") as { documentId?: string };
    if (payload.documentId) {
      await db.document
        .update({
          where: { id: payload.documentId },
          data: { processingStatus: "FAILED", processingError: message },
        })
        .catch(() => {});
    }
  }
}
