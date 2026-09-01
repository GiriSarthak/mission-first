import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthorizationError, getAuthorizedProject } from "@/lib/auth/authorize";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  try {
    await getAuthorizedProject(projectId, "VIEW_PROJECT");
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
  const documents = await db.document.findMany({
    where: { projectId },
    orderBy: { uploadedAt: "asc" },
    select: {
      id: true,
      filename: true,
      docType: true,
      isScanned: true,
      pageCount: true,
      processingStatus: true,
      processingError: true,
      userDescription: true,
      uploadedAt: true,
    },
  });
  return NextResponse.json({
    documents: documents.map((d) => ({
      ...d,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
  });
}
