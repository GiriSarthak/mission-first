import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const messages = await db.chatMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      changesetId: m.changesetId,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
