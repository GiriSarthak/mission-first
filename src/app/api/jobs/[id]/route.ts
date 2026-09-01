import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthorizationError, getAuthorizedProject } from "@/lib/auth/authorize";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = await db.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await getAuthorizedProject(job.projectId, "VIEW_PROJECT");
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
  return NextResponse.json({ id: job.id, status: job.status, error: job.error });
}
