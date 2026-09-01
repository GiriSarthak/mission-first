"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { DOC_TYPES, type DocType } from "@/lib/enums";
import { deleteDocumentFile } from "@/lib/storage";
import { authorizeByDocument } from "@/lib/auth/authorize";

export async function updateDocumentType(documentId: string, docType: DocType): Promise<void> {
  if (!DOC_TYPES.includes(docType)) return;
  await authorizeByDocument(documentId, "MANAGE_DOCUMENTS");
  const doc = await db.document.update({
    where: { id: documentId },
    data: { docType },
  });
  revalidatePath(`/projects/${doc.projectId}/documents`);
}

export async function deleteDocument(documentId: string): Promise<void> {
  await authorizeByDocument(documentId, "MANAGE_DOCUMENTS");
  const doc = await db.document.delete({ where: { id: documentId } });
  if (doc.storagePath) await deleteDocumentFile(doc.storagePath).catch(() => {});
  revalidatePath(`/projects/${doc.projectId}/documents`);
}

export async function reprocessDocument(documentId: string): Promise<void> {
  await authorizeByDocument(documentId, "MANAGE_DOCUMENTS");
  const doc = await db.document.update({
    where: { id: documentId },
    data: { processingStatus: "PENDING", processingError: null },
  });
  await db.job.create({
    data: {
      projectId: doc.projectId,
      type: "PROCESS_DOCUMENT",
      payload: JSON.stringify({ documentId }),
    },
  });
  revalidatePath(`/projects/${doc.projectId}/documents`);
}
