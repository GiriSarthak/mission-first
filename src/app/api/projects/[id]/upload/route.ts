import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { documentStoragePath, saveDocumentFile } from "@/lib/storage";

export const maxDuration = 120;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const description = String(form.get("description") ?? "");
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const created = [];
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: `${file.name}: only PDF files are supported` },
        { status: 400 }
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    let pageCount = 0;
    try {
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      pageCount = pdf.getPageCount();
    } catch {
      return NextResponse.json(
        { error: `${file.name}: could not be read as a PDF` },
        { status: 400 }
      );
    }

    const doc = await db.document.create({
      data: {
        projectId,
        filename: file.name,
        storagePath: "",
        pageCount,
        processingStatus: "PENDING",
        userDescription: description || null,
      },
    });
    const storagePath = documentStoragePath(projectId, doc.id);
    await saveDocumentFile(projectId, doc.id, buffer);
    await db.document.update({ where: { id: doc.id }, data: { storagePath } });
    await db.job.create({
      data: {
        projectId,
        type: "PROCESS_DOCUMENT",
        payload: JSON.stringify({ documentId: doc.id }),
      },
    });
    created.push({ id: doc.id, filename: doc.filename, pageCount });
  }

  const names = created.map((c) => c.filename).join(", ");
  await db.chatMessage.create({
    data: {
      projectId,
      role: "USER",
      documentId: created[0]?.id,
      content: description ? `Uploaded ${names} — ${description}` : `Uploaded ${names}`,
    },
  });

  return NextResponse.json({ documents: created });
}
