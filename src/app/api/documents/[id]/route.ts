import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthorizationError, authorizeByDocument } from "@/lib/auth/authorize";

/** Viewer data: one page of extracted text plus the findings for the doc. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);

  try {
    await authorizeByDocument(id, "VIEW_PROJECT");
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [pageRow, checklistItems, obligations, activities, insights] =
    await Promise.all([
      db.documentPage.findUnique({
        where: { documentId_pageNumber: { documentId: id, pageNumber: page } },
      }),
      db.checklistItem.findMany({
        where: { sourceDocumentId: id },
        include: { phase: true },
        orderBy: { sourcePage: "asc" },
      }),
      db.obligation.findMany({
        where: { sourceDocumentId: id },
        orderBy: { sourcePage: "asc" },
      }),
      db.activity.findMany({
        where: { sourceDocumentId: id },
        orderBy: { code: "asc" },
      }),
      db.insight.findMany({
        where: { sourceDocumentId: id },
        orderBy: { sourcePage: "asc" },
      }),
    ]);

  return NextResponse.json({
    page,
    pageText: pageRow?.text ?? null,
    findings: {
      checklistItems: checklistItems.map((c) => ({
        id: c.id,
        title: c.title,
        phase: c.phase.title,
        status: c.status,
        page: c.sourcePage,
        clause: c.sourceClause,
      })),
      obligations: obligations.map((o) => ({
        id: o.id,
        title: o.title,
        status: o.status,
        page: o.sourcePage,
        clause: o.contractClause,
      })),
      activities: activities.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        page: a.sourcePage,
      })),
      insights: insights.map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        page: i.sourcePage,
      })),
    },
  });
}
