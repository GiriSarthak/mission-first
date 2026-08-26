import { db } from "@/lib/db";
import { DocumentsWorkspace } from "@/components/documents/workspace";
import { ChatPanel } from "@/components/documents/chat-panel";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string; page?: string }>;
}) {
  const { id } = await params;
  const { doc, page } = await searchParams;
  const [documents, chatMessages] = await Promise.all([
    db.document.findMany({
      where: { projectId: id },
      orderBy: { uploadedAt: "asc" },
    }),
    db.chatMessage.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-[3] overflow-hidden">
        <DocumentsWorkspace
          projectId={id}
          initialDocuments={documents.map((d) => ({
            id: d.id,
            filename: d.filename,
            docType: d.docType,
            isScanned: d.isScanned,
            pageCount: d.pageCount,
            processingStatus: d.processingStatus,
            processingError: d.processingError,
            userDescription: d.userDescription,
            uploadedAt: d.uploadedAt.toISOString(),
          }))}
          initialDocId={doc && documents.some((d) => d.id === doc) ? doc : null}
          initialPage={Math.max(1, Number(page ?? 1) || 1)}
        />
      </div>
      <div className="w-2/5 min-w-80 shrink-0">
        <ChatPanel
          projectId={id}
          messages={chatMessages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            changesetId: m.changesetId,
            createdAt: m.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
