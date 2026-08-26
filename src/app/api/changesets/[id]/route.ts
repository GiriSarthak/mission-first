import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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
