import fs from "node:fs";
import path from "node:path";

/** Uploads live at ./storage/<projectId>/<documentId>.pdf (gitignored). */
export function documentStoragePath(projectId: string, documentId: string): string {
  return path.join("storage", projectId, `${documentId}.pdf`);
}

export function absoluteStoragePath(relative: string): string {
  return path.isAbsolute(relative) ? relative : path.join(process.cwd(), relative);
}

export async function saveDocumentFile(
  projectId: string,
  documentId: string,
  data: Buffer
): Promise<string> {
  const rel = documentStoragePath(projectId, documentId);
  const abs = absoluteStoragePath(rel);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, data);
  return rel;
}

export async function readDocumentFile(storagePath: string): Promise<Buffer> {
  return fs.promises.readFile(absoluteStoragePath(storagePath));
}

export async function deleteDocumentFile(storagePath: string): Promise<void> {
  await fs.promises.rm(absoluteStoragePath(storagePath), { force: true });
}
