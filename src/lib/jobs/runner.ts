/**
 * Minimal background processing (BRIEF §2): a Job table drained one job at a
 * time by POST /api/jobs/run, which the Documents page polls while anything is
 * processing. No queue infrastructure.
 */
import { db } from "@/lib/db";
import {
  finalizeExtraction,
  runExtractionUnit,
  startDocumentPipeline,
  type ExtractionUnit,
} from "@/lib/jobs/extraction";

export type RunResult =
  | { processed: false }
  | { processed: true; jobId: string; type: string; status: "DONE" | "FAILED"; error?: string };

/**
 * Drains one pending job. `projectIds` scopes the queue to projects the
 * caller may act on — the route handler passes the signed-in user's visible
 * projects so one org can never drive another org's jobs.
 */
export async function runNextJob(projectIds?: string[]): Promise<RunResult> {
  if (projectIds && projectIds.length === 0) return { processed: false };
  const job = await db.job.findFirst({
    where: {
      status: "PENDING",
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
    },
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
  void projectId;
  switch (type) {
    case "PROCESS_DOCUMENT": {
      const documentId = String(payload.documentId ?? "");
      await db.document.update({
        where: { id: documentId },
        data: { processingStatus: "PROCESSING", processingError: null },
      });
      await startDocumentPipeline(documentId, jobId);
      return;
    }
    case "EXTRACT_UNIT": {
      await runExtractionUnit(
        payload as { documentId: string; changesetId: string; unit: ExtractionUnit },
        jobId
      );
      return;
    }
    case "FINALIZE_EXTRACTION": {
      await finalizeExtraction(payload as { documentId: string; changesetId: string });
      return;
    }
    case "GENERATE_INSIGHTS": {
      const { generateInsights } = await import("@/lib/insights/generate");
      await generateInsights(projectId, jobId);
      return;
    }
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}

async function onJobFailed(type: string, payloadJson: string, message: string): Promise<void> {
  // EXTRACT_UNIT failures are tolerated — finalize reports skipped sections.
  if (type === "PROCESS_DOCUMENT" || type === "FINALIZE_EXTRACTION") {
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
