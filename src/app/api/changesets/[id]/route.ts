import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthorizationError, getAuthorizedProject } from "@/lib/auth/authorize";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const changeset = await db.changeset.findUnique({
    where: { id },
    include: { items: { orderBy: { id: "asc" } } },
  });
  if (!changeset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await getAuthorizedProject(changeset.projectId, "VIEW_PROJECT");
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
  return NextResponse.json({
    id: changeset.id,
    status: changeset.status,
    summary: changeset.summary,
    items: changeset.items.map((i) => ({
      id: i.id,
      entityType: i.entityType,
      accepted: i.accepted,
      payload: JSON.parse(i.payload) as Record<string, unknown>,
    })),
  });
}
